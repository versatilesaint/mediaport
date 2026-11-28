// Camera frames (studio spec §5, §12 Phase 3): the default geometry matches the spec's table exactly; changing
// margin / gap recomputes every window; windows stay on the canvas; the renderer cuts real windows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameLayout, obsPositions, FRAME_IDS, FRAME_OF } from '../apps/cloud/public/assets/frames.js';
import { T, fieldsFor, frameHTML, sample } from '../apps/cloud/public/assets/catalog.js';

const r = (s) => { const [x, y, w, h] = s.split(/[ ,×]+/).map(Number); return { x, y, w, h }; };
// Spec §5 table, at margin 60 / gap 24 (borders: margin 30).
const SPEC = {
  F01: ['60,60 1800×960'],
  F02: ['0,0 1920×1080', '1322,718 538×302'],
  F03: ['60,290 888×500', '972,290 888×500'],
  F04: ['60,60 888×960', '972,60 888×960'],
  F05: ['60,203 1198×674', '1282,203 578×325', '1282,552 578×325'],
  F06: ['116,60 832×468', '972,60 832×468', '116,552 832×468', '972,552 832×468'],
  F07: ['60,60 1030×960'],
  F08: ['60,60 1800×676'],
  F09: ['60,182 1272×716', '1356,182 504×284'],
  F10: ['60,290 888×500', '972,290 888×500'],
  F11: ['60,192 1236×696', '1320,192 540×304'],
  F12: ['690,60 540×960'],
  F13: ['30,30 1860×1020'],
  F14: ['30,30 1860×1020'],
  F15: ['60,60 1066×960'],
  F16: ['60,60 1066×960'],
  F17: ['116,60 832×468', '972,60 832×468', '116,552 832×468', '972,552 832×468'],
};

test('all 17 frames exist and every one has a template in Camera overlays', () => {
  assert.equal(FRAME_IDS.length, 17);
  const used = new Set(Object.values(FRAME_OF));
  for (const id of FRAME_IDS) assert.ok(used.has(id), id);
  for (const n of Object.keys(FRAME_OF).map(Number)) assert.equal(T(n).comp, 'frame', '#' + n);
});

test('default geometry matches the spec table exactly', () => {
  for (const [id, rows] of Object.entries(SPEC)) {
    const got = frameLayout(id, {}).windows.map(({ x, y, w, h }) => ({ x, y, w, h }));
    assert.deepEqual(got, rows.map(r), id);
  }
});

test('changing margin and gap recomputes every window, and windows stay on the canvas', () => {
  for (const id of FRAME_IDS) {
    const base = JSON.stringify(frameLayout(id, {}).windows);
    const changed = JSON.stringify(frameLayout(id, { margin: 100, gap: 60 }).windows);
    if (id !== 'F02') assert.notEqual(changed, base, id + ' follows margin/gap');
    for (const margin of [0, 60, 200]) for (const gap of [0, 24, 120]) {
      const L = frameLayout(id, { margin, gap });
      for (const w of [...L.windows, ...L.panels]) assert.ok(w.x >= 0 && w.y >= 0 && w.x + w.w <= 1920 && w.y + w.h <= 1080 && w.w > 0 && w.h > 0, `${id} m${margin} g${gap}`);
    }
  }
  assert.equal(frameLayout('F04', { ratio: 60 }).windows[0].w, 1066);
  assert.deepEqual(frameLayout('F02', { corner: 'tl', size: 25 }).windows[1], { ...frameLayout('F02', { corner: 'tl', size: 25 }).windows[1], x: 60, y: 60, w: 480 });
});

test('OBS positions name the source for each window; the editor shows only the fields a frame uses', () => {
  assert.deepEqual(obsPositions('F09', {}).map((p) => p.source), ['Slides', 'Camera 1']);
  assert.deepEqual(obsPositions('F06', { cam3: 'Choir cam' }).map((p) => p.source), ['Camera 1', 'Camera 2', 'Choir cam', 'Camera 4']);
  const f = fieldsFor({ n: 230, comp: 'frame' }).map((x) => x[0]);
  assert.ok(f.includes('weekly') && f.includes('look') && !f.includes('name1'));
});

test('the renderer cuts one window per camera, in both looks, using brand tokens only', () => {
  for (const n of Object.keys(FRAME_OF).map(Number)) for (const look of ['bold', 'flat']) {
    const d = { ...sample(T(n), { loc: 'Leeds, United Kingdom', web: '' }), look };
    const html = frameHTML({ n, comp: 'frame', slot: 'frame', live: {} }, d, { kit: {} });
    const id = FRAME_OF[n];
    const holes = frameLayout(id, d).windows.filter((w) => !w.plain).length;
    if (frameLayout(id, d).backdrop) assert.equal((html.match(/H1920V1080H0Z/g) || []).length, look === 'bold' ? 2 : 1, `#${n} ${look}: one backdrop (plus glow)`);
    if (frameLayout(id, d).backdrop) assert.equal((html.match(/fill-rule="evenodd"[^>]*d="M0 0H1920V1080H0Z ((?:M[^Z]*Z ?)*)"/)?.[1].match(/Z/g) || []).length, holes, `#${n} windows`);
    assert.ok(!/#[0-9a-f]{6}/i.test(html.replace(/#f[a-z]{2}\)/g, '')), `#${n} ${look}: no hard-coded colours`);
  }
});
