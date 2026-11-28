// Phase 3 kit builder API (studio spec §6): only the builder token may list jobs and upload; files land in the
// organisation's own R2 prefix; members download, other organisations and signed-out visitors cannot; a brand
// change makes the old hash stale (409) and marks the kit out of date.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const TOKEN = process.env.KIT_BUILD_TOKEN || '';
const stamp = Date.now().toString(36);
const A = `kit-a-${stamp}`, Bslug = `kit-b-${stamp}`;
after(() => setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref());

async function signIn(email) {
  const r = await fetch(`${BASE}/auth/dev?email=${encodeURIComponent(email)}`, { redirect: 'manual' });
  return `mp_s=${r.headers.get('set-cookie').match(/mp_s=([^;]+)/)[1]}`;
}
const req = (cookie, path, opts = {}) => fetch(BASE + path, { redirect: 'manual', ...opts, headers: { origin: BASE, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(opts.headers || {}) } });
const kb = (path, opts = {}, token = TOKEN) => fetch(BASE + '/api/kit-builder' + path, { ...opts, headers: { authorization: 'Bearer ' + token, ...(opts.headers || {}) } });

let owner, alice, bob, job;
test('setup: two organisations', async () => {
  assert.ok(TOKEN.length >= 32, 'test-local.sh sets KIT_BUILD_TOKEN');
  owner = await signIn('owner@platform.test');
  alice = await signIn('alice@kit.test');
  bob = await signIn('bob@kit.test');
  for (const [slug, who] of [[A, 'alice@kit.test'], [Bslug, 'bob@kit.test']]) {
    const r = await req(owner, '/api/platform/orgs', { method: 'POST', body: JSON.stringify({ name: 'Kit ' + slug, slug, ownerEmail: who, website: 'example.org' }) });
    assert.equal(r.status, 201);
    await req(who.startsWith('alice') ? alice : bob, new URL((await r.json()).inviteUrl).pathname);
  }
});

test('the builder API needs the token', async () => {
  assert.equal((await kb('/jobs', {}, '')).status, 401);
  assert.equal((await kb('/jobs', {}, 'x'.repeat(TOKEN.length))).status, 401);
  assert.equal((await req(alice, '/api/kit-builder/jobs')).status, 401, 'a session is not enough');
});

test('jobs list the organisations whose kit is missing, with brand and logos', async () => {
  const { jobs } = await (await kb('/jobs')).json();
  job = jobs.find((j) => j.slug === A);
  assert.ok(job && jobs.some((j) => j.slug === Bslug));
  assert.match(job.hash, /^[0-9a-f]{16}$/);
  assert.match(job.brand.p, /^#[0-9a-f]{6}$/i);
});

test('upload, done, member download; the kit leaves the jobs list', async () => {
  const p = `/orgs/${job.orgId}/${job.hash}`;
  assert.equal((await kb(`${p}/../evil.png`, { method: 'PUT', body: 'x' })).status >= 400, true);
  assert.equal((await kb(`${p}/Bad Name.png`, { method: 'PUT', body: 'x' })).status >= 400, true);
  assert.equal((await kb(`${p}/still-welcome.jpg`, { method: 'PUT', body: 'jpeg-bytes' })).status, 200);
  assert.equal((await kb(`${p}/done`, { method: 'POST', body: JSON.stringify({ files: ['still-welcome.jpg', 'missing.png'] }) })).status, 400, 'every file must be uploaded');
  assert.equal((await kb(`${p}/done`, { method: 'POST', body: JSON.stringify({ files: ['still-welcome.jpg'] }) })).status, 200);
  const d = await req(alice, `/${A}/kit/still-welcome.jpg`);
  assert.equal(d.status, 200);
  assert.equal(await d.text(), 'jpeg-bytes');
  assert.match(d.headers.get('content-disposition'), /attachment/);
  const { jobs } = await (await kb('/jobs')).json();
  assert.ok(!jobs.some((j) => j.slug === A));
  assert.ok((await (await kb('/jobs?all=1')).json()).jobs.some((j) => j.slug === A));
  const page = await (await req(alice, '/kits')).text();
  assert.ok(page.includes(`/${A}/kit/still-welcome.jpg`));
});

test('other organisations and signed-out visitors cannot download', async () => {
  assert.equal((await req(bob, `/${A}/kit/still-welcome.jpg`)).status, 404);
  const anon = await req(null, `/${A}/kit/still-welcome.jpg`);
  assert.equal(anon.status, 302);
  assert.match(anon.headers.get('location'), /\/platform\?next=\/kits/);
  assert.equal((await req(alice, `/${A}/kit/not-in-kit.png`)).status, 404);
});

test('a brand change makes the old hash stale and the kit out of date', async () => {
  const cur = await (await req(alice, `/api/orgs/${A}/brand`)).json();
  const r = await req(alice, `/api/orgs/${A}/brand`, { method: 'PUT', body: JSON.stringify({ colors: { ...cur.colors, a: '#ffcc00' }, kit: cur.kit }) });
  assert.equal(r.status, 200);
  assert.equal((await kb(`/orgs/${job.orgId}/${job.hash}/still-lyrics.jpg`, { method: 'PUT', body: 'x' })).status, 409);
  const { jobs } = await (await kb('/jobs')).json();
  assert.ok(jobs.find((j) => j.slug === A).hash !== job.hash);
  assert.ok((await (await req(alice, '/kits')).text()).includes('Your brand changed'));
});
