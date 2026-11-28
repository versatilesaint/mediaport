// Broadcast kit assets (studio spec §6, §8): rendered per organisation by the free GitHub Actions kit builder
// (kit/build.mjs) and stored in R2 under orgs/{orgId}/kit/{brandHash}/. The builder authenticates with the
// KIT_BUILD_TOKEN secret; members download through their session. A brand change makes a new hash, so the next
// builder run regenerates that organisation's kit and the old files are removed.
import { OrgScope, Platform, type Org } from './db';
import type { Env } from './env';
import { orgProfile } from './profile';

export const KIT_FILE = /^[a-z0-9][a-z0-9-]{0,60}\.(webm|png|jpg|json)$/;
const TYPES: Record<string, string> = { webm: 'video/webm', png: 'image/png', jpg: 'image/jpeg', json: 'application/json' };
export const MAX_KIT_FILE = 60_000_000;

export interface KitAssets { hash: string; at: number; files: { name: string; size: number }[] }
export const kitAssets = (org: Org): KitAssets | null => {
  const k = (org.settings as unknown as { kitAssets?: KitAssets }).kitAssets;
  return k && typeof k.hash === 'string' && Array.isArray(k.files) ? k : null;
};

/** What the kit depends on: names, mark, colours, look, motion, fonts and logo versions. */
export async function brandHash(org: Org): Promise<string> {
  const p = orgProfile(org);
  const basis = JSON.stringify({ v: 1, name: p.name, short: p.short, mk: p.mk, brand: p.brand, kit: { theme: p.kit?.theme, motion: p.kit?.motion, fonts: p.kit?.fonts, logos: p.kit?.logos } });
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(basis));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function tokenOk(req: Request, env: Env): boolean {
  const want = env.KIT_BUILD_TOKEN || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (want.length < 32 || got.length !== want.length) return false;
  let x = 0;
  for (let i = 0; i < want.length; i++) x |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return x === 0;
}

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** /api/kit-builder/... (GitHub Actions only). */
export async function kitBuilderApi(req: Request, env: Env, url: URL, parts: string[]): Promise<Response> {
  if (!tokenOk(req, env)) return json({ error: 'Kit builder token missing or wrong.' }, 401);
  // GET /api/kit-builder/jobs: organisations whose kit is missing or out of date
  if (parts[2] === 'jobs' && parts.length === 3 && req.method === 'GET') {
    const jobs = [];
    for (const org of await Platform.activeOrgs(env.DB)) {
      const hash = await brandHash(org);
      if (kitAssets(org)?.hash === hash && url.searchParams.get('all') !== '1') continue;
      const p = orgProfile(org);
      const logos = Object.fromEntries(Object.entries(p.kit?.logos ?? {}).map(([k, v]) => [k, url.origin + v]));
      jobs.push({ orgId: org.id, slug: org.slug, hash, name: p.name, short: p.short, mk: p.mk, brand: p.brand, theme: p.kit?.theme, motion: p.kit?.motion, fonts: p.kit?.fonts, logos });
    }
    return json({ jobs });
  }
  // /api/kit-builder/orgs/{orgId}/{hash}/{file|done}
  if (parts[2] === 'orgs' && parts.length === 6) {
    const org = await Platform.orgById(env.DB, parts[3]!);
    if (!org || org.status !== 'active') return json({ error: 'Organisation not found.' }, 404);
    const hash = await brandHash(org);
    if (parts[4] !== hash) return json({ error: 'The brand changed while building; this kit is out of date.' }, 409);
    const prefix = `orgs/${org.id}/kit/${hash}/`;
    if (parts[5] === 'done' && req.method === 'POST') {
      const b = (await req.json().catch(() => ({}))) as { files?: unknown };
      const names = Array.isArray(b.files) ? b.files.filter((n): n is string => typeof n === 'string' && KIT_FILE.test(n)) : [];
      const files: KitAssets['files'] = [];
      for (const name of names) {
        const head = await env.MEDIA.head(prefix + name);
        if (!head) return json({ error: `${name} was not uploaded.` }, 400);
        files.push({ name, size: head.size });
      }
      const scope = new OrgScope(env.DB, org);
      await scope.updateSettings({ kitAssets: { hash, at: Date.now(), files } });
      await scope.audit(null, 'kit.built', `${files.length} files`);
      // remove older kits
      let cursor: string | undefined;
      do {
        const l = await env.MEDIA.list({ prefix: `orgs/${org.id}/kit/`, cursor });
        const old = l.objects.map((o) => o.key).filter((k) => !k.startsWith(prefix));
        if (old.length) await env.MEDIA.delete(old);
        cursor = l.truncated ? l.cursor : undefined;
      } while (cursor);
      return json({ ok: true, files: files.length });
    }
    if (req.method === 'PUT' && KIT_FILE.test(parts[5]!)) {
      const len = Number(req.headers.get('content-length') || 0);
      if (!len || len > MAX_KIT_FILE) return json({ error: 'File missing or too big.' }, 413);
      await env.MEDIA.put(prefix + parts[5], req.body, { httpMetadata: { contentType: TYPES[parts[5]!.split('.').pop()!]! } });
      return json({ ok: true });
    }
  }
  return json({ error: 'Not found.' }, 404);
}

/** GET /{slug}/kit/{file} for signed-in members. */
export async function kitDownload(env: Env, org: Org, name: string): Promise<Response> {
  const k = kitAssets(org);
  if (!k || !KIT_FILE.test(name) || !k.files.some((f) => f.name === name)) return new Response('Not found', { status: 404 });
  const obj = await env.MEDIA.get(`orgs/${org.id}/kit/${k.hash}/${name}`);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, { headers: {
    'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', 'content-disposition': `attachment; filename="${org.slug}-${name}"`,
    'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff',
  } });
}

/** Kit status for the Kits room. */
export async function kitStatus(org: Org): Promise<{ ready: KitAssets | null; current: boolean }> {
  const k = kitAssets(org);
  return { ready: k, current: !!k && k.hash === (await brandHash(org)) };
}
