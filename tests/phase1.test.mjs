// Phase 1 acceptance (studio spec §12): two control browsers + an OBS screen stay in sync in < 500 ms; making a
// new link revokes the old one at once; a non-team user is locked out. Plus: state versions, screen status,
// rate limiting, the activity log and CSV export, the website's rooms, real QR codes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { qrSvg, qrLink } from '../apps/cloud/public/assets/catalog.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const WSB = BASE.replace('http', 'ws');
const stamp = Date.now().toString(36);
const A = `p1-a-${stamp}`;

async function signIn(email) {
  const r = await fetch(`${BASE}/auth/dev?email=${encodeURIComponent(email)}`, { redirect: 'manual' });
  return `mp_s=${r.headers.get('set-cookie').match(/mp_s=([^;]+)/)[1]}`;
}
const req = (cookie, path, opts = {}) =>
  fetch(BASE + path, { redirect: 'manual', ...opts, headers: { origin: BASE, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
function open(url, cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, cookie ? { headers: { cookie, origin: BASE } } : undefined);
    const msgs = [], waiters = [];
    let closed = null;
    ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m); for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); } };
    ws.onclose = (e) => { closed = e.code; };
    ws.onerror = () => reject(new Error('socket refused: ' + url));
    ws.onopen = () => resolve({
      ws, msgs, closedCode: () => closed,
      send: (m) => ws.send(JSON.stringify({ v: 1, ...m })),
      next: (pred, ms = 3000) => { const hit = msgs.find(pred); if (hit) return Promise.resolve(hit); return new Promise((res, rej) => { waiters.push({ pred, res }); setTimeout(() => rej(new Error('timeout')), ms); }); },
      close: () => ws.close(),
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Local dev quirk: a socket the server closed can stay in CLOSING (the proxy never finishes the close handshake),
// which keeps this process alive after the tests. Exit once they're reported.
after(() => setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref());

let owner, alice, op, stranger, links;
test('setup', async () => {
  owner = await signIn('owner@platform.test');
  alice = await signIn('alice@p1.test');
  stranger = await signIn('stranger@elsewhere.test');
  const r = await req(owner, '/api/platform/orgs', { method: 'POST', body: JSON.stringify({ name: 'Phase One', slug: A, ownerEmail: 'alice@p1.test', website: 'example.org' }) });
  await req(alice, new URL((await r.json()).inviteUrl).pathname);
  const inv = await req(alice, `/api/orgs/${A}/invites`, { method: 'POST', body: JSON.stringify({ email: 'op@p1.test', role: 'operator' }) });
  op = await signIn('op@p1.test');
  await req(op, new URL((await inv.json()).url).pathname);
  links = (await (await req(alice, `/api/orgs/${A}/display-links`)).json()).links;
});

test('acceptance: two control browsers and an OBS screen stay in sync in under 500 ms', async () => {
  const k = new URL(links.obs).searchParams.get('k');
  const c1 = await open(`${WSB}/${A}/ws?role=control`, alice);
  const c2 = await open(`${WSB}/${A}/ws?role=control`, op);
  const obs = await open(`${WSB}/${A}/ws?role=display&output=obs&k=${k}`);
  const s = (await c1.next((m) => m.type === 'snapshot')).state;
  await c2.next((m) => m.type === 'snapshot');
  const item = s.ro.map((r) => s.items[r.id]).find((i) => i.targets.obs);
  const t0 = Date.now();
  c1.send({ type: 'take', itemId: item.id });
  const [a, b] = await Promise.all([
    obs.next((m) => m.type === 'snapshot' && m.state.onAir.obs.includes(item.id)),
    c2.next((m) => m.type === 'snapshot' && m.state.onAir.obs.includes(item.id)),
  ]);
  const ms = Date.now() - t0;
  assert.ok(ms < 500, `synced in ${ms} ms`);
  assert.equal(typeof a.state.rev, 'number', 'screens get the state version');
  assert.equal(a.state.rev, b.state.rev, 'the screen and the second control are on the same version');
  c1.send({ type: 'clear', itemId: item.id });
  const after = await obs.next((m) => m.type === 'snapshot' && m.state.rev > a.state.rev && !m.state.onAir.obs.includes(item.id));
  assert.ok(after.state.rev > a.state.rev, 'versions only go up');
  for (const c of [c1, c2, obs]) c.close();
});

test('screen status: connected now, then last seen', async () => {
  const k = new URL(links.stage).searchParams.get('k');
  const st = await open(`${WSB}/${A}/ws?role=display&output=stage&k=${k}`);
  await st.next((m) => m.type === 'snapshot');
  let s = (await (await req(alice, `/api/orgs/${A}/display-links`)).json()).status;
  assert.ok(s.stage.connected >= 1);
  st.close();
  await sleep(400);
  s = (await (await req(alice, `/api/orgs/${A}/display-links`)).json()).status;
  assert.equal(s.stage.connected, 0);
  assert.ok(Date.now() - s.stage.lastSeen < 10_000, 'last seen is recorded');
});

test('acceptance: making a new link revokes the old one immediately', async () => {
  const oldUrl = links.freeshow;
  const k = new URL(oldUrl).searchParams.get('k');
  const fs = await open(`${WSB}/${A}/ws?role=display&output=freeshow&k=${k}`);
  await fs.next((m) => m.type === 'snapshot');
  assert.equal((await req(alice, `/api/orgs/${A}/display-links/freeshow/rotate`, { method: 'POST' })).status, 200);
  const t0 = Date.now();
  await fs.next((m) => m.type === 'access_changed', 2000);
  assert.ok(Date.now() - t0 < 1000, `the connected screen was told in ${Date.now() - t0} ms`);
  fs.close();
  const head = await fetch(oldUrl.replace(/^https?:\/\/[^/]+/, BASE), { method: 'HEAD' });
  assert.equal(head.status, 404, 'the old link no longer opens (the screen then shows "link replaced")');
  const page = await (await fetch(`${BASE}/assets/display.js`)).text();
  assert.match(page, /link was replaced/);
  links = (await (await req(alice, `/api/orgs/${A}/display-links`)).json()).links;
});

test('acceptance: a non-team user is locked out', async () => {
  assert.equal((await req(stranger, `/${A}/control`)).status, 403);
  assert.equal((await req(stranger, `/api/orgs/${A}/display-links`)).status, 403);
  assert.equal((await req(stranger, `/api/orgs/${A}/activity`)).status, 403);
  assert.equal((await req(op, `/api/orgs/${A}/activity.csv`)).status, 403, 'operators do not export the log');
  await assert.rejects(open(`${WSB}/${A}/ws?role=control`, stranger));
  const r = await req(null, '/control');
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /\/platform\?next=\/control$/);
});

test('control operations are rate limited', async () => {
  const c = await open(`${WSB}/${A}/ws?role=control`, alice);
  const s = (await c.next((m) => m.type === 'snapshot')).state;
  const id = s.ro[0].id;
  for (let i = 0; i < 80; i++) c.send({ type: i % 2 ? 'clear' : 'take', itemId: id });
  const e = await c.next((m) => m.type === 'error' && m.code === 'rate_limited');
  assert.ok(e);
  c.close();
});

test('activity: filter and spreadsheet-safe CSV in the organisation time zone', async () => {
  const j = await (await req(alice, `/api/orgs/${A}/activity?q=showed&days=1`)).json();
  assert.ok(j.rows.length > 0 && j.rows.every((r) => /showed/i.test(r.what + r.who)));
  assert.equal(j.tz, 'Europe/London');
  const csv = await req(alice, `/api/orgs/${A}/activity.csv?days=7`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /attachment/);
  const text = await csv.text();
  assert.match(text, /^"Time \(Europe\/London\)","Type","What","Who"\r\n/);
  assert.match(text, /display_key\.rotated · freeshow/);
});

test('the website rooms answer, with favicons', async () => {
  for (const p of ['/', '/platform', '/kits', '/help', '/guidelines']) {
    const r = await fetch(BASE + p);
    assert.equal(r.status, 200, p);
    const t = await r.text();
    assert.match(t, /aria-label="Rooms"/, p + ' has the room bar');
    assert.match(t, /rel="manifest" href="\/site.webmanifest"/, p + ' has the favicons');
  }
  for (const f of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/site.webmanifest']) assert.equal((await fetch(BASE + f)).status, 200, f);
  assert.match(await (await fetch(BASE + '/')).text(), /One port\./);
  // organisation addresses can't take the room names
  const r = await req(owner, '/api/platform/orgs', { method: 'POST', body: JSON.stringify({ name: 'X', slug: 'kits' }) });
  assert.equal(r.status, 400);
});

test('QR codes are real and point at the card link or the website', () => {
  const svg = qrSvg('https://example.org/give');
  assert.match(svg, /^<svg class="qr" viewBox="0 0 (\d+) \1"/);
  const n = +svg.match(/viewBox="0 0 (\d+)/)[1] - 8;
  assert.ok([21, 25, 29, 33, 37].includes(n), 'a valid QR version size');
  assert.equal(qrLink({ link: '' }, { web: 'example.org' }), 'https://example.org');
  assert.equal(qrLink({ link: 'http://give.example.org/x' }, { web: 'example.org' }), 'http://give.example.org/x');
  assert.equal(qrSvg(''), '');
});
