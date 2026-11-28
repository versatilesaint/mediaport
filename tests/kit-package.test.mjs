// Phase 4 kit packaging (studio spec §8, §12): OBS scene collections (Windows + Mac) whose every reference and
// media path resolves inside the kit, 25+ scenes with cameras under each frame's windows; FreeShow files that
// survive FreeShow 1.6's import (path rewrite by base name); the four ZIPs; the countdown page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packageKit, layout, folderName, MAIN_SCENES } from '../kit/package.mjs';
import { unzip } from '../kit/zip.mjs';
import { FRAME_IDS, FRAME_NAME, obsPositions } from '../apps/cloud/public/assets/frames.js';

const job = { orgId: 'org_test', slug: 'grace', name: 'Grace Chapel <Leeds>', short: 'Grace Chapel', mk: 'GC', hash: 'abc',
  brand: { p: '#1d4ed8', d: '#0b1a4a', a: '#f5b301', f: '#e8590c', m: '#7c3aed', l: '#ffffff' }, fonts: { heading: 'Default', body: 'Default', scripture: 'Georgia' } };
const files = new Map([...layout('X').keys()].map((n) => [n, Buffer.from('media:' + n)]));
const kit = packageKit(job, files, [['full_light', 'png', Buffer.from('logo')]]);
const F = kit.F;

test('folder name is the short name, safe for both systems', () => {
  assert.equal(F, 'Grace-Chapel');
  assert.equal(folderName({ short: '  ', name: '' }), 'MediaPort');
  assert.equal(folderName({ short: 'Église Saint-Jean' }), 'Eglise-Saint-Jean');
});

test('OBS collections: Windows and Mac paths, 25+ scenes, stinger at 1.2 s, every path inside the kit', () => {
  for (const [os, base] of [['Windows', `C:/${F}`], ['Mac', `/Users/Shared/${F}`]]) {
    const c = JSON.parse(kit.tree.get(`obs/${F}-Scenes-${os}.json`));
    const scenes = c.sources.filter((s) => s.id === 'scene').map((s) => s.name);
    assert.ok(c.scene_order.length >= 25, `${os}: ${c.scene_order.length} scenes`);
    for (const s of MAIN_SCENES) assert.ok(scenes.includes(s), s);
    assert.equal(scenes.filter((s) => s.startsWith('Frame • ')).length, 17);
    assert.equal(c.transitions[0].settings.transition_point, 1200);
    for (const s of c.sources) for (const k of ['local_file', 'file']) if (s.settings[k]) {
      assert.ok(s.settings[k].startsWith(base + '/'), s.settings[k]);
      assert.ok(kit.tree.has(s.settings[k].slice(base.length + 1)), 'in kit: ' + s.settings[k]);
    }
    assert.ok(kit.tree.has(c.transitions[0].settings.path.slice(base.length + 1)));
    const uuids = new Set(c.sources.map((s) => s.uuid));
    assert.equal(uuids.size, c.sources.length, 'unique uuids');
    for (const s of c.sources) for (const it of s.settings.items || []) assert.ok(uuids.has(it.source_uuid), it.name);
  }
});

test('each frame scene puts every camera exactly under its window', () => {
  const c = JSON.parse(kit.tree.get(`obs/${F}-Scenes-Windows.json`));
  for (const id of FRAME_IDS) {
    const sc = c.sources.find((s) => s.name === `Frame • ${FRAME_NAME[id]}`);
    const seen = new Set();
    for (const p of obsPositions(id, {})) {
      if (seen.has(p.source)) continue; seen.add(p.source);
      const it = sc.settings.items.find((i) => i.name === p.source);
      assert.ok(it, `${id} ${p.source}`);
      assert.deepEqual([it.pos.x, it.pos.y, it.bounds.x, it.bounds.y, it.bounds_type], [p.x, p.y, p.w, p.h, 3], `${id} ${p.source}`);
    }
    const art = sc.settings.items.findIndex((i) => i.name.startsWith('Frame Art'));
    assert.ok(art >= seen.size, `${id}: frame art above the cameras`);
  }
});

test('FreeShow: every file imports (paths rewritten by base name, media inside, items present)', async () => {
  const fs = [...kit.tree.keys()].filter((p) => /\.fs(template|overlay)$/.test(p));
  assert.equal(fs.filter((p) => p.endsWith('.fstemplate')).length, 8);
  assert.equal(fs.filter((p) => p.startsWith('frames/freeshow/')).length, 34);
  for (const p of fs) {
    const z = await unzip(kit.tree.get(p));
    const raw = z.get('data.json').toString();
    const data = JSON.parse(raw), kind = p.endsWith('.fstemplate') ? 'template' : 'overlay';
    for (const folder of ['C:\\Users\\Media\\Documents\\FreeShow\\Imports', '/Users/media/Documents/FreeShow/Imports']) {
      let c = raw;
      const sep = folder.includes('\\') ? '\\' : '/';
      for (const f of data.files) {
        const base = f.split('/').pop();
        assert.ok(z.has(base), `${p}: ${base} in the zip`);
        c = c.split(f).join((folder + sep + base).replace(/\\/g, '\\\\'));
      }
      const obj = JSON.parse(c)[kind];
      assert.ok(Array.isArray(obj.items) && obj.items.length, p);
      assert.ok(!c.includes(`/${F}-FreeShow/`), `${p}: placeholder replaced`);
      for (const it of obj.items) if (it.type === 'media') assert.ok(it.src.startsWith(folder), it.src);
      if (obj.settings?.mode === 'scripture') assert.ok(JSON.stringify(obj.items).includes('{scripture_text}'));
    }
  }
});

test('four ZIPs with the right contents; the broadcast kit has everything under one folder', async () => {
  const z = Object.fromEntries(await Promise.all(kit.zips.map(async ([n, b]) => [n, await unzip(b)])));
  assert.deepEqual(Object.keys(z).sort(), ['broadcast-kit.zip', 'camera-frames.zip', 'freeshow-kit.zip', 'obs-kit.zip']);
  assert.equal(z['broadcast-kit.zip'].size, kit.tree.size);
  for (const m of Object.values(z)) for (const k of m.keys()) assert.ok(k.startsWith(F + '/'), k);
  assert.ok(z['obs-kit.zip'].has(`${F}/obs/${F}-Scenes-Mac.json`) && ![...z['obs-kit.zip'].keys()].some((k) => k.includes('/4K/')));
  assert.equal(z['broadcast-kit.zip'].get(`${F}/backgrounds/1080p/${F}-Welcome.jpg`).toString(), 'media:still-welcome.jpg');
  assert.ok(z['broadcast-kit.zip'].has(`${F}/brand/${F}-logo-full-light.png`));
  const small = packageKit(job, files, [], { maxZip: 20_000 });
  assert.ok(!small.zips.some(([n]) => n === 'broadcast-kit.zip'), 'oversized ZIPs are skipped');
});

test('countdown page: brand colours, schedule config at the top, name escaped, no address', () => {
  const h = kit.tree.get('obs/countdown.html').toString();
  assert.match(h, /SERVICE_TIMES = \[\s*\{ day: 0/);
  assert.ok(h.includes('#f5b301') && h.includes('Grace Chapel &lt;Leeds&gt;') && !h.includes('<Leeds>'));
  assert.ok(!/innerHTML\s*=\s*`/.test(h), 'text is set with textContent');
});
