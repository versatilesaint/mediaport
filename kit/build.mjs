#!/usr/bin/env node
// MediaPort kit builder (studio spec §6). Runs free on GitHub Actions (.github/workflows/kit-build.yml):
// asks the Worker which organisations need a fresh kit, renders each one in its own brand with Playwright +
// ffmpeg, uploads the files to R2 through the Worker, then marks the kit done.
//
//   MEDIAPORT_URL   default https://mediaport.koladelawal.org
//   KIT_BUILD_TOKEN required (Worker secret + GitHub secret, 32+ characters)
//   ALL=1           rebuild every organisation, not only out-of-date ones
//   ONLY=slug       build one organisation
//   FAST=1          tiny clips (for local tests): 0.5 s, 6 fps
//   OUT=dir         also keep the files locally
import { createServer } from 'node:http';
import { readFile, mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { FRAME_IDS, FRAME_OF, FRAME_NAME, obsPositions } from '../apps/cloud/public/assets/frames.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, '../apps/cloud/public/assets');
const BASE = (process.env.MEDIAPORT_URL || 'https://mediaport.koladelawal.org').replace(/\/$/, '');
const TOKEN = process.env.KIT_BUILD_TOKEN || '';
const FAST = process.env.FAST === '1';
const FPS = FAST ? 6 : 30;
const WORKERS = Number(process.env.WORKERS || 4);

if (TOKEN.length < 32) { console.log('KIT_BUILD_TOKEN is not set (or shorter than 32 characters): nothing to build.'); process.exit(0); }
const api = (path, opts = {}) => fetch(BASE + '/api/kit-builder' + path, { ...opts, headers: { authorization: 'Bearer ' + TOKEN, ...(opts.headers || {}) } });

// ---- static server for the scene pages and the studio's own assets ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = u.pathname.startsWith('/assets/') ? join(ASSETS, u.pathname.slice(8)) : join(HERE, u.pathname.slice(1));
  if (file.includes('..') || !(file.startsWith(ASSETS) || file.startsWith(HERE))) { res.writeHead(404).end(); return; }
  try { res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const LOCAL = `http://127.0.0.1:${server.address().port}`;

const run = (cmd, args) => new Promise((ok, bad) => { const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] }); let e = ''; p.stderr.on('data', (d) => (e += d)); p.on('close', (c) => (c ? bad(new Error(cmd + ' failed: ' + e.slice(-600))) : ok())); });

async function dataUrl(url) {
  if (!url) return '';
  const r = await fetch(url);
  if (!r.ok) return '';
  return `data:${r.headers.get('content-type') || 'image/png'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
}

/** Everything a job renders: [file name, page, query, kind, extra]. */
function plan() {
  const P = [];
  for (const v of ['standard', 'dark']) P.push([`bg-${v}.webm`, 'scenes.html', { s: 'bg', v }, 'video', { opaque: true }]);
  for (const v of ['welcome', 'lyrics', 'scripture', 'announcement', 'sermon']) { P.push([`still-${v}.jpg`, 'scenes.html', { s: 'still', v }, 'jpg', { scale: 1 }]); P.push([`still-${v}-4k.jpg`, 'scenes.html', { s: 'still', v }, 'jpg', { scale: 2 }]); }
  P.push(['intro-sting.webm', 'scenes.html', { s: 'intro' }, 'video']);
  P.push(['transition-stinger.webm', 'scenes.html', { s: 'stinger' }, 'video']);
  P.push(['corner-logo.webm', 'scenes.html', { s: 'corner' }, 'video'], ['corner-logo.png', 'scenes.html', { s: 'corner' }, 'png', { at: 1 }]);
  P.push(['lower-third.webm', 'scenes.html', { s: 'lowerthird' }, 'video'], ['lower-third.png', 'scenes.html', { s: 'lowerthird' }, 'png', { at: 0 }]);
  for (const id of FRAME_IDS) {
    const n = Number(Object.keys(FRAME_OF).find((k) => FRAME_OF[k] === id));
    for (const look of ['bold', 'flat']) P.push([`frame-${id.toLowerCase()}-${look}.png`, 'frames.html', { n, look }, 'png', { at: 0 }]);
  }
  for (const look of ['bold', 'flat']) P.push([`frame-f13-${look}-animated.webm`, 'frames.html', { n: 91, look }, 'video']);
  return P;
}

async function render(browser, B, [name, page, query, kind, x = {}], dir) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: x.scale || 1 });
  try {
    await ctx.addInitScript((b) => { window.__B = b; }, B);
    const pg = await ctx.newPage();
    await pg.goto(`${LOCAL}/${page}?${new URLSearchParams(query)}`);
    await pg.waitForFunction(() => window.sceneReady === true, null, { timeout: 30000 });
    const size = await pg.evaluate(() => window.SIZE);
    await pg.setViewportSize({ width: size.w, height: size.h });
    const clip = { x: 0, y: 0, width: size.w, height: size.h };
    const out = join(dir, name);
    if (kind !== 'video') {
      await pg.evaluate((t) => window.renderAt(t), x.at ?? 0);
      await writeFile(out, await pg.screenshot({ clip, type: kind === 'jpg' ? 'jpeg' : 'png', quality: kind === 'jpg' ? 90 : undefined, omitBackground: kind === 'png' }));
      return out;
    }
    const dur = FAST ? 0.5 : await pg.evaluate(() => window.DURATION);
    const frames = join(dir, name + '.frames');
    await mkdir(frames, { recursive: true });
    const count = Math.round(dur * FPS);
    for (let i = 0; i < count; i++) {
      await pg.evaluate((t) => window.renderAt(t), i / FPS);
      await writeFile(join(frames, String(i).padStart(5, '0') + '.png'), await pg.screenshot({ clip, omitBackground: !x.opaque }));
    }
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, '%05d.png'), '-c:v', 'libvpx-vp9',
      '-pix_fmt', x.opaque ? 'yuv420p' : 'yuva420p', '-b:v', '0', '-crf', FAST ? '50' : '30', '-row-mt', '1', '-deadline', FAST ? 'realtime' : 'good', '-cpu-used', FAST ? '8' : '2',
      ...(x.opaque ? [] : ['-auto-alt-ref', '0', '-metadata:s:v:0', 'alpha_mode=1']), out]);
    await rm(frames, { recursive: true, force: true });
    return out;
  } finally { await ctx.close(); }
}

/** kit.json: what's in the kit and where OBS should put each camera, per frame. */
const manifest = (job, files) => JSON.stringify({ org: job.name, hash: job.hash, made: new Date().toISOString(), canvas: [1920, 1080], files,
  frames: FRAME_IDS.map((id) => ({ id, name: FRAME_NAME[id], files: files.filter((f) => f.startsWith(`frame-${id.toLowerCase()}-`)), obs: obsPositions(id, {}) })),
  stinger: { file: 'transition-stinger.webm', transitionPointMs: 1200 } }, null, 2);

async function build(browser, job) {
  const dir = await mkdtemp(join(tmpdir(), `kit-${job.slug}-`));
  const logo = await dataUrl(job.logos?.full_light || job.logos?.mark_light);
  const B = { name: job.name, short: job.short, mk: job.mk, brand: job.brand, theme: job.theme, motion: job.motion, fonts: job.fonts, logo, mark: await dataUrl(job.logos?.mark_light) };
  const queue = plan(), done = [];
  console.log(`${job.slug}: rendering ${queue.length} files`);
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    while (queue.length) { const item = queue.shift(); await render(browser, B, item, dir); done.push(item[0]); console.log(`  ${job.slug}/${item[0]}`); }
  }));
  done.sort();
  await writeFile(join(dir, 'kit.json'), manifest(job, done));
  const names = [...done, 'kit.json'];
  for (const name of names) {
    const body = await readFile(join(dir, name));
    const r = await api(`/orgs/${job.orgId}/${job.hash}/${name}`, { method: 'PUT', body, headers: { 'content-type': 'application/octet-stream' } });
    if (r.status === 409) { console.log(`${job.slug}: brand changed during the build; the next run picks it up.`); return; }
    if (!r.ok) throw new Error(`${job.slug}/${name}: upload ${r.status} ${await r.text()}`);
  }
  const r = await api(`/orgs/${job.orgId}/${job.hash}/done`, { method: 'POST', body: JSON.stringify({ files: names }), headers: { 'content-type': 'application/json' } });
  if (!r.ok) throw new Error(`${job.slug}: done ${r.status} ${await r.text()}`);
  if (process.env.OUT) { await mkdir(join(process.env.OUT, job.slug), { recursive: true }); for (const n of names) await writeFile(join(process.env.OUT, job.slug, n), await readFile(join(dir, n))); }
  await rm(dir, { recursive: true, force: true });
  console.log(`${job.slug}: kit ready (${names.length} files)`);
}

let failed = 0;
try {
  const r = await api('/jobs' + (process.env.ALL === '1' ? '?all=1' : ''));
  if (!r.ok) throw new Error(`jobs: ${r.status} ${await r.text()}`);
  let { jobs } = await r.json();
  if (process.env.ONLY) jobs = jobs.filter((j) => j.slug === process.env.ONLY);
  if (!jobs.length) console.log('Every kit is up to date.');
  const browser = jobs.length ? await chromium.launch() : null;
  for (const job of jobs) { try { await build(browser, job); } catch (e) { failed++; console.error(e.message); } }
  await browser?.close();
} finally { server.close(); }
process.exit(failed ? 1 : 0);
