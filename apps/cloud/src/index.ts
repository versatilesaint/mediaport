// MediaPort cloud Worker: routing, access checks and the organisation APIs.
// Every organisation-scoped route resolves the organisation first, then checks the caller against it.

import { isOutput, isRole, roleAtLeast, OUTPUTS, RESERVED_SLUGS, SLUG_RE, STARTER_PACKS, type Role, type StarterPack } from '../../../packages/core/src/index';
import type { Env } from './env';
import { Invites, OrgScope, Platform, Users, type Org, type User } from './db';
import { accessOk, currentUser, devSignIn, googleCallback, googleConfigured, googleStart, isPlatformOwnerEmail, safeNext, signOut } from './auth';
import { randomToken } from './crypto';
import { controlPage, displayPage, freeshowTestPage, homePage, message, platformPage, signInPage } from './pages';

export { OverlayRoom } from './room';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const fail = (status: number, error: string) => json({ error }, status);
const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });

/** State-changing requests must come from this site (blocks cross-site form posts). */
function sameOrigin(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  return req.headers.get('origin') === new URL(req.url).origin;
}

async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

const clean = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function orgFor(env: Env, slug: string): Promise<Org | null> {
  if (!SLUG_RE.test(slug)) return null;
  return Platform.orgBySlug(env.DB, slug);
}

/** Resolves organisation + member role, enforcing active status and a minimum role. */
async function guardOrg(env: Env, user: User | null, slug: string, need: Role): Promise<{ scope: OrgScope; role: Role } | Response> {
  const org = await orgFor(env, slug);
  if (!org) return fail(404, 'Organisation not found.');
  if (!user) return fail(401, 'Sign in first.');
  const scope = new OrgScope(env.DB, org);
  const role = await scope.roleOf(user.id);
  // Same answer for "not a member" and "suspended" so the API doesn't reveal more than it must.
  if (!role || org.status !== 'active') return fail(403, 'You are not a member of this organisation.');
  if (!roleAtLeast(role, need)) return fail(403, `This needs the ${need} role or higher.`);
  return { scope, role };
}

async function platformGuard(req: Request, env: Env, user: User | null): Promise<Response | null> {
  if (!user) return fail(401, 'Sign in first.');
  if (!isPlatformOwnerEmail(env, user.email) || !(await accessOk(req, env))) return fail(403, 'Platform owner only.');
  return null;
}

const room = (env: Env, org: Org) => env.ROOM.get(env.ROOM.idFromName(org.id));

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const user = await currentUser(req, env);

    if (!sameOrigin(req)) return fail(403, 'Request blocked: it did not come from this site.');

    // ----- Public and auth -----
    if (url.pathname === '/healthz') return json({ ok: true });
    if (url.pathname === '/') {
      const orgs = user ? await Users.orgsFor(env.DB, user.id) : [];
      return homePage(user, orgs, !!user && isPlatformOwnerEmail(env, user.email));
    }
    if (url.pathname === '/auth/signin') return signInPage(safeNext(url.searchParams.get('next')), googleConfigured(env));
    if (url.pathname === '/auth/google/start') return googleConfigured(env) ? googleStart(req, env) : message('Sign-in not set up', 'Google sign-in has not been configured yet.', 503);
    if (url.pathname === '/auth/google/callback') return googleConfigured(env) ? googleCallback(req, env) : notFound();
    if (url.pathname === '/auth/signout' && req.method === 'POST') return signOut(req, env);
    if (url.pathname === '/auth/dev') return devSignIn(req, env);
    if (url.pathname === '/test/freeshow') return freeshowTestPage();

    // ----- Invite acceptance -----
    if (parts[0] === 'invite' && parts[1]) {
      if (!user) return Response.redirect(`${url.origin}/auth/signin?next=${encodeURIComponent(url.pathname)}`, 302);
      const inv = await Invites.byToken(env.DB, parts[1]);
      if (!inv || inv.accepted_at || inv.expires_at < Date.now()) return message('Invite not valid', 'This invite has expired or was already used. Ask for a new one.', 410, user);
      if (inv.status !== 'active') return message('Organisation suspended', 'This organisation is suspended.', 403, user);
      if (inv.email !== user.email.toLowerCase())
        return message('Wrong account', `This invite is for a different email address. Sign out and sign in with the invited account.`, 403, user);
      const org = (await Platform.orgBySlug(env.DB, inv.slug))!;
      const scope = new OrgScope(env.DB, org);
      await scope.addMember(user.id, inv.role);
      await scope.markInviteAccepted(inv.id);
      await scope.audit(user.id, 'invite.accepted', inv.role);
      return Response.redirect(`${url.origin}/${org.slug}/control`, 302);
    }

    // ----- Platform (owner only) -----
    if (parts[0] === 'platform') {
      if (!user) return Response.redirect(`${url.origin}/auth/signin?next=/platform`, 302);
      const denied = await platformGuard(req, env, user);
      if (denied) return message('Platform owner only', 'This area is for the MediaPort platform owner.', 403, user);
      return platformPage(user);
    }
    if (parts[0] === 'api' && parts[1] === 'platform') {
      const denied = await platformGuard(req, env, user);
      if (denied) return denied;
      if (parts[2] !== 'orgs') return notFound();
      if (parts.length === 3 && req.method === 'GET') return json({ orgs: await Platform.listOrgs(env.DB) });
      if (parts.length === 3 && req.method === 'POST') {
        const b = await body<Record<string, unknown>>(req);
        const name = clean(b.name);
        const slug = clean(b.slug, 32).toLowerCase();
        const pack = (STARTER_PACKS as readonly string[]).includes(String(b.pack)) ? (b.pack as StarterPack) : 'church';
        if (!name) return fail(400, 'Enter the organisation name.');
        if (!SLUG_RE.test(slug)) return fail(400, 'The address must be 2–32 lowercase letters, numbers or hyphens.');
        if (RESERVED_SLUGS.includes(slug)) return fail(400, `/${slug} is reserved by MediaPort.`);
        if (await Platform.orgBySlug(env.DB, slug)) return fail(409, `/${slug} is already taken.`);
        const tz = clean(b.tz, 64) || 'Europe/London';
        try {
          new Intl.DateTimeFormat('en-GB', { timeZone: tz });
        } catch {
          return fail(400, 'Unknown time zone.');
        }
        const org = await Platform.createOrg(env.DB, {
          slug,
          name,
          shortName: clean(b.shortName, 40) || name.split(/[,(]/)[0]!.trim().slice(0, 40),
          tz,
          pack,
          settings: { location: clean(b.location), motto: clean(b.motto), departments: [], website: clean(b.website).replace(/^https?:\/\//, ''), connectors: {} },
        });
        await Platform.audit(env.DB, user!.id, 'org.created', slug);
        let inviteUrl: string | null = null;
        const ownerEmail = clean(b.ownerEmail, 254);
        if (ownerEmail) {
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) return fail(400, 'The owner email is not valid.');
          const token = randomToken(32);
          await new OrgScope(env.DB, org).createInvite(ownerEmail, 'owner', user!.id, token);
          inviteUrl = `${url.origin}/invite/${token}`;
        }
        return json({ org: { slug: org.slug, name: org.name }, inviteUrl }, 201);
      }
      const org = parts[3] ? await orgFor(env, parts[3]) : null;
      if (!org) return fail(404, 'Organisation not found.');
      if (parts[4] === 'status' && req.method === 'POST') {
        const status = (await body<{ status?: string }>(req)).status;
        if (status !== 'active' && status !== 'suspended') return fail(400, 'Status must be active or suspended.');
        await Platform.setOrgStatus(env.DB, org.id, status);
        if (status === 'suspended') await room(env, org).disconnect({ all: true });
        await Platform.audit(env.DB, user!.id, 'org.' + status, org.slug);
        return json({ ok: true });
      }
      if (parts[4] === 'owner-invite' && req.method === 'POST') {
        const email = clean((await body<{ email?: string }>(req)).email, 254);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, 'Enter a valid email.');
        const token = randomToken(32);
        await new OrgScope(env.DB, org).createInvite(email, 'owner', user!.id, token);
        await Platform.audit(env.DB, user!.id, 'org.owner_invited', org.slug);
        return json({ url: `${url.origin}/invite/${token}` }, 201);
      }
      if (parts.length === 4 && req.method === 'DELETE') {
        if ((await body<{ confirm?: string }>(req)).confirm !== org.slug) return fail(400, `Type ${org.slug} to confirm.`);
        await room(env, org).disconnect({ all: true });
        await Platform.deleteOrg(env.DB, org.id);
        // R2 media lives under orgs/{orgId}/; remove it too.
        let cursor: string | undefined;
        do {
          const l = await env.MEDIA.list({ prefix: `orgs/${org.id}/`, cursor });
          if (l.objects.length) await env.MEDIA.delete(l.objects.map((o) => o.key));
          cursor = l.truncated ? l.cursor : undefined;
        } while (cursor);
        await Platform.audit(env.DB, user!.id, 'org.deleted', org.slug);
        return json({ ok: true });
      }
      return notFound();
    }

    // ----- Organisation APIs: /api/orgs/:slug/... -----
    if (parts[0] === 'api' && parts[1] === 'orgs' && parts[2]) {
      const sub = parts.slice(3).join('/');
      const need: Role = sub === 'members' || sub === 'me' ? 'viewer' : 'admin';
      const g = await guardOrg(env, user, parts[2], need);
      if (g instanceof Response) return g;
      const { scope, role } = g;
      if (sub === 'me' && req.method === 'GET') return json({ org: { slug: scope.org.slug, name: scope.org.name }, role, email: user!.email });
      if (sub === 'members' && req.method === 'GET')
        return json({ members: await scope.members(), invites: roleAtLeast(role, 'admin') ? await scope.pendingInvites() : [] });
      if (sub === 'invites' && req.method === 'POST') {
        const b = await body<{ email?: string; role?: string }>(req);
        const email = clean(b.email, 254);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, 'Enter a valid email.');
        if (!isRole(b.role)) return fail(400, 'Choose a role.');
        // Admins can't hand out admin or owner; only an owner can.
        if (role !== 'owner' && roleAtLeast(b.role, 'admin')) return fail(403, 'Only an owner can invite admins or owners.');
        const token = randomToken(32);
        await scope.createInvite(email, b.role, user!.id, token);
        await scope.audit(user!.id, 'invite.created', b.role);
        return json({ url: `${url.origin}/invite/${token}` }, 201);
      }
      if (sub === 'display-links' && req.method === 'GET') {
        const keys = await scope.displayKeys();
        const links = Object.fromEntries(OUTPUTS.map((o) => [o, `${url.origin}/${scope.org.slug}/o/${o}?k=${keys[o]}`]));
        return json({ links });
      }
      if (parts[3] === 'display-links' && parts[5] === 'rotate' && req.method === 'POST') {
        const out = parts[4];
        if (!isOutput(out)) return fail(400, 'Unknown output.');
        await scope.rotateDisplayKey(out);
        await room(env, scope.org).disconnect({ output: out });
        await scope.audit(user!.id, 'display_key.rotated', out);
        return json({ ok: true });
      }
      return notFound();
    }

    // ----- Organisation pages and sockets: /:slug/... -----
    if (parts[0] && !RESERVED_SLUGS.includes(parts[0])) {
      const org = await orgFor(env, parts[0]);
      if (!org) return notFound();
      const scope = new OrgScope(env.DB, org);

      // Display page: read-only, key in the query string. Wrong key, wrong organisation or suspended: plain 404.
      if (parts[1] === 'o' && parts.length === 3) {
        const out = parts[2];
        const key = url.searchParams.get('k') || '';
        if (org.status !== 'active' || !isOutput(out) || !(await scope.displayKeyValid(out, key))) return notFound();
        return displayPage(org, out, url.searchParams.get('debug') === '1');
      }

      if (parts[1] === 'ws' && parts.length === 2) {
        if (org.status !== 'active') return fail(403, 'Organisation suspended.');
        const asRole = url.searchParams.get('role');
        const headers = new Headers(req.headers);
        if (asRole === 'display') {
          const out = url.searchParams.get('output');
          if (!isOutput(out) || !(await scope.displayKeyValid(out, url.searchParams.get('k') || ''))) return fail(403, 'Display key not valid.');
          headers.set('x-mp-role', 'display');
          headers.set('x-mp-output', out);
          headers.delete('x-mp-user');
          headers.delete('x-mp-can-write');
        } else {
          if (!user) return fail(401, 'Sign in first.');
          const role = await scope.roleOf(user.id);
          if (!role) return fail(403, 'You are not a member of this organisation.');
          headers.set('x-mp-role', 'control');
          headers.set('x-mp-user', user.id);
          headers.set('x-mp-can-write', roleAtLeast(role, 'operator') ? '1' : '0');
          headers.delete('x-mp-output');
        }
        if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return fail(426, 'Expected a WebSocket.');
        return room(env, org).fetch(new Request(req.url, { headers }));
      }

      if ((parts[1] === 'control' || parts[1] === 'dock') && parts.length === 2) {
        if (!user) return Response.redirect(`${url.origin}/auth/signin?next=${encodeURIComponent(url.pathname)}`, 302);
        const role = await scope.roleOf(user.id);
        if (!role) return message('No access', `You're not a member of ${org.name}. Ask its owner for an invite.`, 403, user);
        if (org.status !== 'active') return message('Organisation suspended', `${org.name} is suspended. Contact the platform owner.`, 403, user);
        return controlPage(user, org, role);
      }
      return notFound();
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;

