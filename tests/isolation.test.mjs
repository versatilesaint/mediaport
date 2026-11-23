// Cross-organisation isolation and access tests (brief §3.3, §12). Runs against a local `wrangler dev`.
// Start with: npm test   (scripts/test-local.sh sets up a fresh local database first)

import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OWNER = 'owner@platform.test';
const stamp = Date.now().toString(36);
const A = `iso-a-${stamp}`, B = `iso-b-${stamp}`;

async function signIn(email) {
  const r = await fetch(`${BASE}/auth/dev?email=${encodeURIComponent(email)}`, { redirect: 'manual' });
  assert.equal(r.status, 302, 'dev sign-in should redirect');
  const c = r.headers.get('set-cookie').match(/mp_s=([^;]+)/)[1];
  return `mp_s=${c}`;
}
const req = (cookie, path, opts = {}) =>
  fetch(BASE + path, { redirect: 'manual', ...opts, headers: { origin: BASE, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(opts.headers || {}) } });

async function acceptInvite(cookie, url) {
  const path = new URL(url).pathname;
  const r = await req(cookie, path);
  assert.equal(r.status, 302);
  return r;
}

function wsOutcome(url, send) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const msgs = [];
    const done = (r) => { try { ws.close(); } catch {} resolve(r); };
    ws.onopen = () => { if (send) ws.send(JSON.stringify(send)); setTimeout(() => done({ open: true, msgs }), 600); };
    ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
    ws.onerror = () => done({ open: false, msgs });
  });
}

let owner, alice, bob, keysA, keysB;

test('setup: platform owner creates two organisations and invites their owners', async () => {
  owner = await signIn(OWNER);
  alice = await signIn('alice@a.test');
  bob = await signIn('bob@b.test');
  for (const [slug, email, who] of [[A, 'alice@a.test', () => alice], [B, 'bob@b.test', () => bob]]) {
    const r = await req(owner, '/api/platform/orgs', { method: 'POST', body: JSON.stringify({ name: `Org ${slug}`, slug, ownerEmail: email, pack: 'church' }) });
    assert.equal(r.status, 201, await r.clone().text());
    const { inviteUrl } = await r.json();
    await acceptInvite(who(), inviteUrl);
  }
  keysA = (await (await req(alice, `/api/orgs/${A}/display-links`)).json()).links;
  keysB = (await (await req(bob, `/api/orgs/${B}/display-links`)).json()).links;
  assert.ok(keysA.obs && keysB.obs);
});

test('a member of A cannot read B', async () => {
  assert.equal((await req(alice, `/api/orgs/${B}/members`)).status, 403);
  assert.equal((await req(alice, `/api/orgs/${B}/me`)).status, 403);
  assert.equal((await req(alice, `/api/orgs/${B}/display-links`)).status, 403);
  assert.equal((await req(alice, `/${B}/control`)).status, 403);
});

test('a member of A cannot change B', async () => {
  assert.equal((await req(alice, `/api/orgs/${B}/invites`, { method: 'POST', body: JSON.stringify({ email: 'x@x.test', role: 'owner' }) })).status, 403);
  assert.equal((await req(alice, `/api/orgs/${B}/display-links/obs/rotate`, { method: 'POST' })).status, 403);
});

test("A's display key does not open B's outputs", async () => {
  const kA = new URL(keysA.obs).searchParams.get('k');
  assert.equal((await fetch(`${BASE}/${B}/o/obs?k=${kA}`)).status, 404);
  assert.equal((await fetch(`${BASE}/${A}/o/obs?k=${kA}`)).status, 200);
  // A key for one output does not open another output of the same organisation.
  assert.equal((await fetch(`${BASE}/${A}/o/stage?k=${kA}`)).status, 404);
  const ws = await wsOutcome(`${BASE.replace('http', 'ws')}/${B}/ws?role=display&output=obs&k=${kA}`);
  assert.equal(ws.open, false, 'B room must refuse A key');
});

test("A member's session cannot open B's control socket", async () => {
  assert.equal((await req(alice, `/${B}/ws?role=control`)).status, 403);
  assert.equal((await req(null, `/${B}/ws?role=control`)).status, 401);
  // Authorised but not a WebSocket: passes the gate, then 426.
  assert.equal((await req(bob, `/${B}/ws?role=control`)).status, 426);
});

test('display sockets are read-only', async () => {
  const kA = new URL(keysA.obs).searchParams.get('k');
  const r = await wsOutcome(`${BASE.replace('http', 'ws')}/${A}/ws?role=display&output=obs&k=${kA}`, { v: 1, type: 'take', itemId: 'x' });
  assert.equal(r.open, true);
  assert.equal(r.msgs[0].type, 'hello');
  assert.equal(r.msgs[1].type, 'snapshot');
  assert.ok(r.msgs.some((m) => m.type === 'error' && m.code === 'read_only'), JSON.stringify(r.msgs));
});

test('the display page is transparent', async () => {
  const t = await (await fetch(keysA.obs.replace(/^https?:\/\/[^/]+/, BASE))).text();
  assert.match(t, /background:transparent/);
});

test('rotating a display key invalidates the old link', async () => {
  const old = new URL(keysA.freeshow).searchParams.get('k');
  assert.equal((await req(alice, `/api/orgs/${A}/display-links/freeshow/rotate`, { method: 'POST' })).status, 200);
  assert.equal((await fetch(`${BASE}/${A}/o/freeshow?k=${old}`)).status, 404);
});

test('non-owners cannot use the platform area; the platform owner cannot read org content', async () => {
  assert.equal((await req(alice, '/api/platform/orgs')).status, 403);
  assert.equal((await req(alice, '/platform')).status, 403);
  assert.equal((await req(owner, `/api/orgs/${A}/members`)).status, 403);
});

test('invites are bound to their email and single-use', async () => {
  const r = await req(alice, `/api/orgs/${A}/invites`, { method: 'POST', body: JSON.stringify({ email: 'carol@a.test', role: 'operator' }) });
  const { url } = await r.json();
  const path = new URL(url).pathname;
  assert.equal((await req(bob, path)).status, 403, 'wrong account must be refused');
  const carol = await signIn('carol@a.test');
  assert.equal((await req(carol, path)).status, 302);
  assert.equal((await req(carol, path)).status, 410, 'second use must be refused');
  assert.equal((await req(carol, `/api/orgs/${A}/display-links`)).status, 403, 'operator is not admin');
});

test('cross-site POSTs are blocked', async () => {
  const r = await fetch(`${BASE}/api/orgs/${A}/invites`, { method: 'POST', headers: { cookie: alice, origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
});

test('suspending B blocks its members and displays', async () => {
  const kB = new URL(keysB.obs).searchParams.get('k');
  assert.equal((await req(owner, `/api/platform/orgs/${B}/status`, { method: 'POST', body: JSON.stringify({ status: 'suspended' }) })).status, 200);
  assert.equal((await req(bob, `/api/orgs/${B}/members`)).status, 403);
  assert.equal((await fetch(`${BASE}/${B}/o/obs?k=${kB}`)).status, 404);
  assert.equal((await req(owner, `/api/platform/orgs/${B}`, { method: 'DELETE', body: JSON.stringify({ confirm: B }) })).status, 200);
});
