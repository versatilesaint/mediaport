// Brand Profile v2 (studio spec §2, §10): colour roles with contrast warnings, kit settings, logo uploads
// (type checks, metadata stripping, SVG script rejection), organisation isolation, and live delivery to screens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const WSB = BASE.replace('http', 'ws');
const stamp = Date.now().toString(36);
const A = `brand-a-${stamp}`, B = `brand-b-${stamp}`;

async function signIn(email) {
  const r = await fetch(`${BASE}/auth/dev?email=${encodeURIComponent(email)}`, { redirect: 'manual' });
  return `mp_s=${r.headers.get('set-cookie').match(/mp_s=([^;]+)/)[1]}`;
}
const req = (cookie, path, opts = {}) =>
  fetch(BASE + path, { redirect: 'manual', ...opts, headers: { origin: BASE, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(opts.headers || {}) } });

// A real 1×1 PNG with a tEXt metadata chunk (which must be stripped).
function crc32(buf) { let c, crc = 0xffffffff; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
const PNG = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])),
  chunk('tEXt', Buffer.from('Comment\0GPS 53.74N 0.43W secret camera data')),
  chunk('IDAT', deflateSync(Buffer.from([0, 232, 85, 43, 255]))),
  chunk('IEND', Buffer.alloc(0)),
]);

const PALETTES = {
  navyGold: { p: '#0e2a5c', m: '#3a7bd5', a: '#f2c14e', f: '#d7263d', d: '#061634', sl: '#f4f7ff', l: '#f4f7ff', tl: '#0b1530', lv: '#e11d2e' },
  warmLight: { p: '#8a3b12', m: '#c2410c', a: '#fde68a', f: '#ea580c', d: '#2a1206', sl: '#fff7ed', l: '#fffaf0', tl: '#2a1206', lv: '#b91c1c' },
  mono: { p: '#111111', m: '#444444', a: '#ffffff', f: '#9ca3af', d: '#000000', sl: '#ffffff', l: '#ffffff', tl: '#000000', lv: '#dc2626' },
};

let owner, alice, bob, linkA;
test('setup: two organisations with their own owners', async () => {
  owner = await signIn('owner@platform.test');
  alice = await signIn('alice@brand-a.test');
  bob = await signIn('bob@brand-b.test');
  for (const [slug, email, who] of [[A, 'alice@brand-a.test', () => alice], [B, 'bob@brand-b.test', () => bob]]) {
    const r = await req(owner, '/api/platform/orgs', { method: 'POST', body: JSON.stringify({ name: `Org ${slug}`, slug, ownerEmail: email, pack: 'church' }) });
    assert.equal(r.status, 201);
    const { inviteUrl } = await r.json();
    await req(who(), new URL(inviteUrl).pathname);
  }
  linkA = (await (await req(alice, `/api/orgs/${A}/display-links`)).json()).links.obs;
});

test('brand defaults: the six original colours plus light surface, text on light and live', async () => {
  const j = await (await req(alice, `/api/orgs/${A}/brand`)).json();
  for (const k of ['p', 'm', 'a', 'f', 'd', 'sl', 'l', 'tl', 'lv']) assert.match(j.colors[k], /^#[0-9a-f]{6}$/);
  assert.equal(j.kit.scripture, 'KJV');
  assert.equal(j.kit.theme, 'standard');
});

test('another organisation cannot read or change this brand', async () => {
  assert.equal((await req(bob, `/api/orgs/${A}/brand`)).status, 403);
  assert.equal((await req(bob, `/api/orgs/${A}/brand`, { method: 'PUT', body: JSON.stringify({ colors: PALETTES.mono }) })).status, 403);
  assert.equal((await req(bob, `/api/orgs/${A}/brand/logo/full_light`, { method: 'POST', body: PNG, headers: { 'content-type': 'image/png' } })).status, 403);
});

test('three very different palettes save; weak contrast is warned about, not blocked', async () => {
  for (const [name, colors] of Object.entries(PALETTES)) {
    const r = await req(alice, `/api/orgs/${A}/brand`, { method: 'PUT', body: JSON.stringify({ colors, kit: { theme: 'standard' } }) });
    assert.equal(r.status, 200, name);
    const j = await r.json();
    assert.ok(Array.isArray(j.warnings), name);
  }
  const weak = { ...PALETTES.navyGold, l: '#1a2a4a' }; // dark text on a dark surface
  const j = await (await req(alice, `/api/orgs/${A}/brand`, { method: 'PUT', body: JSON.stringify({ colors: weak }) })).json();
  assert.ok(j.warnings.some((w) => w.pair === 'Text on dark surface' && w.ratio < 4.5));
  const back = await (await req(alice, `/api/orgs/${A}/brand`)).json();
  assert.equal(back.colors.l, '#1a2a4a');
});

test('invalid colours are refused; kit values are cleaned', async () => {
  assert.equal((await req(alice, `/api/orgs/${A}/brand`, { method: 'PUT', body: JSON.stringify({ colors: { ...PALETTES.mono, p: 'red' } }) })).status, 400);
  await req(alice, `/api/orgs/${A}/brand`, { method: 'PUT', body: JSON.stringify({ colors: PALETTES.navyGold, kit: { theme: 'sober', motion: 'reduced', fonts: { heading: 'Comic Sans', body: 'Georgia' }, scripture: 'NIV', ccli: '12345x' } }) });
  const k = (await (await req(alice, `/api/orgs/${A}/brand`)).json()).kit;
  assert.equal(k.theme, 'sober');
  assert.equal(k.motion, 'reduced');
  assert.equal(k.fonts.heading, 'Default', 'unknown fonts are refused');
  assert.equal(k.fonts.body, 'Georgia');
  assert.equal(k.scripture, 'KJV', 'a licensed translation needs the licence recorded');
  assert.equal(k.ccli, '', 'CCLI numbers are digits only');
  await req(alice, `/api/orgs/${A}/brand`, { method: 'PUT', body: JSON.stringify({ colors: PALETTES.navyGold, kit: { scripture: 'NIV', scriptureLicence: true, ccli: '1234567' } }) });
  const k2 = (await (await req(alice, `/api/orgs/${A}/brand`)).json()).kit;
  assert.equal(k2.scripture, 'NIV');
  assert.equal(k2.ccli, '1234567');
});

test('logo upload: PNG metadata is stripped; scripts in SVG and other types are refused', async () => {
  const up = await req(alice, `/api/orgs/${A}/brand/logo/full_light`, { method: 'POST', body: PNG, headers: { 'content-type': 'image/png' } });
  assert.equal(up.status, 200, await up.clone().text());
  const { logos } = await up.json();
  assert.match(logos.full_light, new RegExp(`^/${A}/logo/full_light\\?v=`));
  const got = await fetch(BASE + logos.full_light);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.match(got.headers.get('content-security-policy'), /sandbox/);
  const bytes = Buffer.from(await got.arrayBuffer());
  assert.ok(!bytes.includes(Buffer.from('tEXt')) && !bytes.includes(Buffer.from('secret camera')), 'metadata removed');
  assert.ok(bytes.includes(Buffer.from('IDAT')), 'image data kept');

  const bad = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  assert.equal((await req(alice, `/api/orgs/${A}/brand/logo/mark_light`, { method: 'POST', body: bad, headers: { 'content-type': 'image/svg+xml' } })).status, 400);
  const onload = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="9" height="9"/></svg>';
  assert.equal((await req(alice, `/api/orgs/${A}/brand/logo/mark_light`, { method: 'POST', body: onload, headers: { 'content-type': 'image/svg+xml' } })).status, 400);
  const good = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f2c14e"/></svg>';
  assert.equal((await req(alice, `/api/orgs/${A}/brand/logo/mark_light`, { method: 'POST', body: good, headers: { 'content-type': 'image/svg+xml' } })).status, 200);
  assert.equal((await req(alice, `/api/orgs/${A}/brand/logo/mark_light`, { method: 'POST', body: Buffer.from([255, 216, 255, 0]), headers: { 'content-type': 'image/jpeg' } })).status, 400);
  assert.equal((await req(alice, `/api/orgs/${A}/brand/logo/banner`, { method: 'POST', body: PNG, headers: { 'content-type': 'image/png' } })).status, 400);
  // B's logo address never serves A's logo
  assert.equal((await fetch(`${BASE}/${B}/logo/full_light`)).status, 404);
});

test('a brand change reaches an open screen live, with the new kit', async () => {
  const k = new URL(linkA).searchParams.get('k');
  const ws = new WebSocket(`${WSB}/${A}/ws?role=display&output=obs&k=${k}`);
  const snaps = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === 'snapshot') snaps.push(m); };
  await new Promise((r) => (ws.onopen = r));
  await new Promise((r) => setTimeout(r, 300));
  await req(alice, `/api/orgs/${A}/brand`, { method: 'PUT', body: JSON.stringify({ colors: PALETTES.warmLight, kit: { theme: 'standard', motion: 'full' } }) });
  await new Promise((r) => setTimeout(r, 600));
  ws.close();
  const last = snaps.at(-1);
  assert.equal(last.profile.brand.p, PALETTES.warmLight.p);
  assert.equal(last.profile.kit.theme, 'standard');
  assert.ok(last.profile.kit.logos.full_light, 'logo URL delivered to the screen');
});
