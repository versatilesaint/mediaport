// Phase 2 (studio spec §3.2, §4, §12): paging lyrics and Scripture with Next / Prev, countdowns to a set time or a
// weekly schedule in the organisation's time zone, Emergency pre-emption, who's online with role and since.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pagesOf, chunk, countdownTarget, zonedEpoch } from '../apps/cloud/public/assets/catalog.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const WSB = BASE.replace('http', 'ws');
const A = `p2-a-${Date.now().toString(36)}`;
after(() => setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref());

async function signIn(email) {
  const r = await fetch(`${BASE}/auth/dev?email=${encodeURIComponent(email)}`, { redirect: 'manual' });
  return `mp_s=${r.headers.get('set-cookie').match(/mp_s=([^;]+)/)[1]}`;
}
const req = (cookie, path, opts = {}) => fetch(BASE + path, { redirect: 'manual', ...opts, headers: { origin: BASE, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
function open(url, cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, cookie ? { headers: { cookie, origin: BASE } } : undefined);
    const msgs = [], waiters = [];
    ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m); for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); } };
    ws.onerror = () => reject(new Error('refused'));
    ws.onopen = () => resolve({ msgs, send: (m) => ws.send(JSON.stringify({ v: 1, ...m })), close: () => ws.close(),
      next: (pred, ms = 3000) => { const hit = msgs.find(pred); if (hit) return Promise.resolve(hit); return new Promise((res, rej) => { waiters.push({ pred, res }); setTimeout(() => rej(new Error('timeout')), ms); }); } });
  });
}
const last = (c) => [...c.msgs].reverse().find((m) => m.type === 'snapshot');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newId = () => 'i' + Math.random().toString(36).slice(2, 12);

let alice, viewer, ctl, obs, stage, fs;
test('setup', async () => {
  const owner = await signIn('owner@platform.test');
  alice = await signIn('alice@p2.test');
  const r = await req(owner, '/api/platform/orgs', { method: 'POST', body: JSON.stringify({ name: 'Phase Two', slug: A, ownerEmail: 'alice@p2.test' }) });
  await req(alice, new URL((await r.json()).inviteUrl).pathname);
  const inv = await req(alice, `/api/orgs/${A}/invites`, { method: 'POST', body: JSON.stringify({ email: 'v@p2.test', role: 'viewer' }) });
  viewer = await signIn('v@p2.test');
  await req(viewer, new URL((await inv.json()).url).pathname);
  const links = (await (await req(alice, `/api/orgs/${A}/display-links`)).json()).links;
  const k = (o) => new URL(links[o]).searchParams.get('k');
  ctl = await open(`${WSB}/${A}/ws?role=control`, alice);
  await ctl.next((m) => m.type === 'snapshot');
  obs = await open(`${WSB}/${A}/ws?role=display&output=obs&k=${k('obs')}`);
  stage = await open(`${WSB}/${A}/ws?role=display&output=stage&k=${k('stage')}`);
  fs = await open(`${WSB}/${A}/ws?role=display&output=freeshow&k=${k('freeshow')}`);
});

test('a pasted song pages two lines at a time, by verse; Next / Prev step through it on air', async () => {
  const id = newId();
  const song = 'Amazing grace! how sweet the sound,\nThat saved a wretch like me!\nI once was lost, but now am found,\nWas blind, but now I see.\n\nTwas grace that taught my heart to fear,\nAnd grace my fears relieved;';
  ctl.send({ type: 'item.upsert', item: { id, n: 1, data: { text: song, per: 2 }, targets: { obs: true, freeshow: false, stage: false } } });
  await sleep(200);
  ctl.send({ type: 'take', itemId: id });
  const a = await obs.next((m) => m.type === 'snapshot' && m.state.onAir.obs.includes(id));
  assert.equal(a.state.items[id].live.page, 0);
  assert.deepEqual(pagesOf(a.state.items[id]), [[ 'Amazing grace! how sweet the sound,', 'That saved a wretch like me!' ], [ 'I once was lost, but now am found,', 'Was blind, but now I see.' ], [ 'Twas grace that taught my heart to fear,', 'And grace my fears relieved;' ]]);
  ctl.send({ type: 'page', itemId: id, dir: 1 });
  await obs.next((m) => m.type === 'snapshot' && m.state.items[id]?.live.page === 1);
  ctl.send({ type: 'page', itemId: id, dir: 1 });
  ctl.send({ type: 'page', itemId: id, dir: 1 }); // past the end: stays on the last page
  await sleep(300);
  assert.equal(last(obs).state.items[id].live.page, 2);
  ctl.send({ type: 'page', itemId: id, dir: -1 });
  await obs.next((m) => m.type === 'snapshot' && m.state.items[id]?.live.page === 1);
  // a viewer can't page
  const v = await open(`${WSB}/${A}/ws?role=control`, viewer);
  v.send({ type: 'page', itemId: id, dir: 1 });
  assert.ok(await v.next((m) => m.type === 'error' && m.code === 'forbidden'));
  v.close();
  // Show again starts at page 1
  ctl.send({ type: 'take', itemId: id });
  await obs.next((m) => m.type === 'snapshot' && m.state.items[id]?.live.page === 0);
});

test('a long passage is split into pages between words', () => {
  const text = ('In the beginning was the Word, and the Word was with God, and the Word was God. ').repeat(8);
  const lower = pagesOf({ n: 16, comp: 'scripture', slot: 'lower', live: { text } });
  assert.ok(lower.length >= 4);
  assert.ok(lower.every(([p]) => p.length <= 170 && !p.startsWith(' ')));
  assert.equal(lower.map(([p]) => p).join(' '), text.trim().replace(/\s+/g, ' '));
  assert.deepEqual(chunk('', 10), ['']);
});

test('countdowns: a set time and the next weekly service, in the organisation time zone', async () => {
  const tz = 'Europe/London';
  const now = Date.UTC(2026, 10, 28, 12, 0); // Saturday 28 November 2026, 12:00 GMT
  assert.equal(countdownTarget({ weekly: 'Sun 10:30, Wed 19:00' }, tz, now), Date.UTC(2026, 10, 29, 10, 30));
  assert.equal(countdownTarget({ weekly: 'Sat 18:00' }, tz, now), Date.UTC(2026, 10, 28, 18, 0));
  assert.equal(countdownTarget({ at: '2026-07-01 18:00' }, tz, now), Date.UTC(2026, 6, 1, 17, 0), 'summer time: 18:00 BST is 17:00 UTC');
  assert.equal(countdownTarget({ at: '11:00' }, tz, now), Date.UTC(2026, 10, 29, 11, 0), 'a time already passed today means tomorrow');
  assert.equal(countdownTarget({ minutes: 5 }, tz, now), now + 300000);
  assert.equal(zonedEpoch(2026, 3, 30, 10, 0, tz), Date.UTC(2026, 2, 30, 9, 0), 'the day after the clocks go forward: 10:00 BST is 09:00 UTC');
  assert.equal(zonedEpoch(2026, 3, 28, 10, 0, tz), Date.UTC(2026, 2, 28, 10, 0), 'the day before: 10:00 GMT');
  // through the room
  const id = newId();
  ctl.send({ type: 'item.upsert', item: { id, n: 109, data: { at: '2030-01-06 10:30' } } });
  await sleep(200);
  ctl.send({ type: 'take', itemId: id });
  const s = await obs.next((m) => m.type === 'snapshot' && m.state.onAir.obs.includes(id));
  assert.equal(s.state.items[id].live.target, Date.UTC(2030, 0, 6, 10, 30));
});

test('an emergency notice is never pushed off by other banners, and shows on every screen', async () => {
  const emg = newId(), b1 = newId(), b2 = newId(), b3 = newId();
  ctl.send({ type: 'item.upsert', item: { id: emg, n: 183, data: { text: 'Please follow the stewards to the nearest exit.' } } });
  for (const id of [b1, b2, b3]) ctl.send({ type: 'item.upsert', item: { id, n: 184, data: { text: 'Ordinary banner' }, targets: { obs: true, freeshow: true, stage: true } } });
  await sleep(300);
  ctl.send({ type: 'take', itemId: emg });
  const s = await stage.next((m) => m.type === 'snapshot' && m.state.onAir.stage.includes(emg));
  assert.ok(s, 'emergency reaches the stage screen too');
  for (const id of [b1, b2, b3]) ctl.send({ type: 'take', itemId: id });
  await sleep(500);
  for (const c of [obs, fs, stage]) {
    const out = Object.keys(last(c).state.onAir)[0];
    assert.ok(last(c).state.onAir[out].includes(emg), `still on ${out} after three other banners`);
  }
  ctl.send({ type: 'clear', itemId: emg });
  await obs.next((m) => m.type === 'snapshot' && !m.state.onAir.obs.includes(emg));
});

test("who's online shows each person's role and since when", async () => {
  const v = await open(`${WSB}/${A}/ws?role=control`, viewer);
  const p = await ctl.next((m) => m.type === 'presence' && m.people?.some((x) => x.email === 'v@p2.test'));
  const me = p.people.find((x) => x.email === 'alice@p2.test'), them = p.people.find((x) => x.email === 'v@p2.test');
  assert.equal(me.role, 'owner');
  assert.equal(them.role, 'viewer');
  assert.ok(Date.now() - them.since < 10_000);
  v.close();
  for (const c of [ctl, obs, stage, fs]) c.close();
});
