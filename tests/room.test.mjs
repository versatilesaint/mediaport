// Room sync tests (brief §4.2, §13 Phase 1a): Take reaches the right outputs, roles are enforced,
// displays only see their own output, and organisations never see each other's room.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const WSB = BASE.replace('http', 'ws');
const stamp = Date.now().toString(36);
const A = `room-a-${stamp}`, B = `room-b-${stamp}`;

async function signIn(email) {
  const r = await fetch(`${BASE}/auth/dev?email=${encodeURIComponent(email)}`, { redirect: 'manual' });
  return `mp_s=${r.headers.get('set-cookie').match(/mp_s=([^;]+)/)[1]}`;
}
const req = (cookie, path, opts = {}) =>
  fetch(BASE + path, { redirect: 'manual', ...opts, headers: { origin: BASE, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });

/** Opens a socket and collects messages. `cookie` is sent for control sockets. */
function open(url, cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, cookie ? { headers: { cookie, origin: BASE } } : undefined);
    const msgs = [];
    const waiters = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      msgs.push(m);
      for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); }
    };
    ws.onerror = () => reject(new Error('socket refused: ' + url));
    ws.onopen = () =>
      resolve({
        ws, msgs,
        send: (m) => ws.send(JSON.stringify({ v: 1, ...m })),
        next: (pred, ms = 3000) => {
          const hit = msgs.find(pred);
          if (hit) return Promise.resolve(hit);
          return new Promise((res, rej) => { waiters.push({ pred, res }); setTimeout(() => rej(new Error('timeout waiting for message')), ms); });
        },
        close: () => ws.close(),
      });
  });
}
const lastSnap = (c) => [...c.msgs].reverse().find((m) => m.type === 'snapshot');

let owner, alice, opUser, viewer, bob, keyA, keyAstage, keyB;

test('setup', async () => {
  owner = await signIn('owner@platform.test');
  alice = await signIn('alice@a.test');
  bob = await signIn('bob@b.test');
  for (const [slug, cookie, email] of [[A, () => alice, 'alice@a.test'], [B, () => bob, 'bob@b.test']]) {
    const r = await req(owner, '/api/platform/orgs', { method: 'POST', body: JSON.stringify({ name: 'Room ' + slug, slug, ownerEmail: email }) });
    assert.equal(r.status, 201);
    await req(cookie(), new URL((await r.json()).inviteUrl).pathname);
  }
  for (const [email, role] of [['op@a.test', 'operator'], ['view@a.test', 'viewer']]) {
    const r = await req(alice, `/api/orgs/${A}/invites`, { method: 'POST', body: JSON.stringify({ email, role }) });
    const c = await signIn(email);
    await req(c, new URL((await r.json()).url).pathname);
    if (role === 'operator') opUser = c; else viewer = c;
  }
  const la = (await (await req(alice, `/api/orgs/${A}/display-links`)).json()).links;
  keyA = new URL(la.obs).searchParams.get('k');
  keyAstage = new URL(la.stage).searchParams.get('k');
  keyB = new URL((await (await req(bob, `/api/orgs/${B}/display-links`)).json()).links.obs).searchParams.get('k');
});

test('the control page serves the MediaPort OS shell to members only', async () => {
  const r = await req(alice, `/${A}/control`);
  assert.equal(r.status, 200);
  const t = await r.text();
  assert.match(t, /\/assets\/shell\.js/);
  assert.match(t, /"role":"owner"/);
  assert.equal((await req(bob, `/${A}/control`)).status, 403);
  assert.equal((await fetch(`${BASE}/assets/catalog.js`)).status, 200);
});

test('first control connection seeds the room from the starter pack', async () => {
  const c = await open(`${WSB}/${A}/ws?role=control`, alice);
  const s = await c.next((m) => m.type === 'snapshot');
  assert.ok(s.state.seeded);
  assert.equal(s.state.ro.length, 10, 'church pack has 10 running-order items');
  assert.ok(s.state.timerItem && s.state.items[s.state.timerItem]);
  assert.equal(s.profile.slug, A);
  c.close();
});

test('Take shows on the targeted outputs only, and displays see only their own output', async () => {
  const ctl = await open(`${WSB}/${A}/ws?role=control`, opUser);
  const obs = await open(`${WSB}/${A}/ws?role=display&output=obs&k=${keyA}`);
  const stage = await open(`${WSB}/${A}/ws?role=display&output=stage&k=${keyAstage}`);
  const otherOrg = await open(`${WSB}/${B}/ws?role=display&output=obs&k=${keyB}`);
  const s = (await ctl.next((m) => m.type === 'snapshot')).state;
  const preacher = s.ro.map((r) => s.items[r.id]).find((i) => i.n === 33); // #33 Preacher ID: OBS + FreeShow, not Stage
  assert.ok(preacher);
  const t0 = Date.now();
  ctl.send({ type: 'take', itemId: preacher.id });
  const so = await obs.next((m) => m.type === 'snapshot' && m.state.onAir.obs.includes(preacher.id));
  const latency = Date.now() - t0;
  assert.ok(latency < 500, `take reached the display in ${latency} ms`);
  assert.equal(so.state.items[preacher.id].live.name !== undefined, true);
  assert.equal(so.state.ro, undefined, 'displays never receive the running order');
  assert.equal(so.state.log, undefined, 'displays never receive the activity log');
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!lastSnap(stage).state.onAir.stage.includes(preacher.id), 'stage switch is off for #33');
  assert.ok(!otherOrg.msgs.some((m) => m.type === 'snapshot' && JSON.stringify(m).includes(preacher.id)), 'other organisation saw nothing');
  // Switching Stage on re-applies the on-air item to Stage.
  ctl.send({ type: 'item.upsert', item: { id: preacher.id, targets: { stage: true } } });
  await new Promise((r) => setTimeout(r, 300));
  // operator can't change targets (producer+), so stage stays off
  assert.ok(!lastSnap(stage).state.onAir.stage.includes(preacher.id));
  ctl.send({ type: 'clear', itemId: preacher.id });
  await obs.next((m) => m.type === 'snapshot' && !m.state.onAir.obs.includes(preacher.id));
  for (const c of [ctl, obs, stage, otherOrg]) c.close();
});

test('producer-level changes are refused for operators and everything for viewers', async () => {
  const op = await open(`${WSB}/${A}/ws?role=control`, opUser);
  await op.next((m) => m.type === 'snapshot');
  op.send({ type: 'item.upsert', item: { id: 'inewitem0001', n: 46 } });
  const e1 = await op.next((m) => m.type === 'error' && m.code === 'forbidden');
  assert.match(e1.message, /producer/);
  const vw = await open(`${WSB}/${A}/ws?role=control`, viewer);
  const s = (await vw.next((m) => m.type === 'snapshot')).state;
  vw.send({ type: 'take', itemId: s.ro[0].id });
  await vw.next((m) => m.type === 'error' && m.code === 'forbidden');
  op.close(); vw.close();
});

test('the speaker timer runs on server time and is shared by every screen', async () => {
  const ctl = await open(`${WSB}/${A}/ws?role=control`, alice);
  const stage = await open(`${WSB}/${A}/ws?role=display&output=stage&k=${keyAstage}`);
  await ctl.next((m) => m.type === 'snapshot');
  ctl.send({ type: 'timer', op: 'duration', value: 10 });
  ctl.send({ type: 'timer', op: 'toggle' });
  const s = await stage.next((m) => m.type === 'snapshot' && m.state.timer.startedAt > 0);
  assert.equal(s.state.timer.durationMs, 600000);
  ctl.send({ type: 'timer', op: 'add', value: 60000 });
  const s2 = await stage.next((m) => m.type === 'snapshot' && m.state.timer.durationMs === 660000);
  assert.ok(s2);
  ctl.send({ type: 'timer', op: 'reset' });
  await stage.next((m) => m.type === 'snapshot' && m.state.timer.startedAt === 0);
  ctl.close(); stage.close();
});

test('a transition goes out by itself', async () => {
  const ctl = await open(`${WSB}/${A}/ws?role=control`, alice);
  const s = (await ctl.next((m) => m.type === 'snapshot')).state;
  const tr = s.ro.map((r) => s.items[r.id]).find((i) => i.slot === 'transition');
  ctl.send({ type: 'take', itemId: tr.id });
  await ctl.next((m) => m.type === 'snapshot' && m.state.onAir.obs.includes(tr.id));
  await ctl.next((m) => m.type === 'snapshot' && !m.state.onAir.obs.includes(tr.id), 6000);
  ctl.close();
});

test('unknown fields and oversized text are dropped', async () => {
  const ctl = await open(`${WSB}/${A}/ws?role=control`, alice);
  const s = (await ctl.next((m) => m.type === 'snapshot')).state;
  const lt = s.ro.map((r) => s.items[r.id]).find((i) => i.n === 33);
  ctl.send({ type: 'item.upsert', item: { id: lt.id, data: { name: 'x'.repeat(5000), evil: '<script>' } } });
  const s2 = await ctl.next((m) => m.type === 'snapshot' && m.state.items[lt.id].data.name.length === 2000);
  assert.equal(s2.state.items[lt.id].data.evil, undefined);
  ctl.close();
});
