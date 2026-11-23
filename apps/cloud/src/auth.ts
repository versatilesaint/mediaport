// Sign-in: Google OAuth (state + PKCE), app sessions, and Cloudflare Access checks for /platform.

import type { Env } from './env';
import { Users, type User } from './db';
import { b64urlDecode, randomToken, sha256B64url, signValue, verifyValue } from './crypto';

export const SESSION_COOKIE = 'mp_s';
const OAUTH_COOKIE = 'mp_oauth';
export const SESSION_TTL = 30 * 24 * 3600_000;

export function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name: string, value: string, maxAgeSec: number, secure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

const isSecure = (req: Request) => new URL(req.url).protocol === 'https:';

/** Only same-site relative paths are allowed as a post-sign-in destination. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}

export async function currentUser(req: Request, env: Env): Promise<User | null> {
  const t = cookies(req)[SESSION_COOKIE];
  if (!t) return null;
  return Users.bySession(env.DB, t, SESSION_TTL);
}

async function startSession(req: Request, env: Env, user: User, next: string): Promise<Response> {
  const token = randomToken(32);
  await Users.createSession(env.DB, user.id, token, SESSION_TTL);
  const h = new Headers({ location: safeNext(next) });
  h.append('set-cookie', cookie(SESSION_COOKIE, token, SESSION_TTL / 1000, isSecure(req)));
  h.append('set-cookie', cookie(OAUTH_COOKIE, '', 0, isSecure(req)));
  return new Response(null, { status: 302, headers: h });
}

export async function signOut(req: Request, env: Env): Promise<Response> {
  const t = cookies(req)[SESSION_COOKIE];
  if (t) await Users.endSession(env.DB, t);
  return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': cookie(SESSION_COOKIE, '', 0, isSecure(req)) } });
}

// ---------- Google OAuth ----------

export const googleConfigured = (env: Env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET);

export async function googleStart(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = await sha256B64url(verifier);
  const signed = await signValue(env.SESSION_SECRET, { state, verifier, next: safeNext(url.searchParams.get('next')), exp: Date.now() + 600_000 });
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${url.origin}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return new Response(null, { status: 302, headers: { location: auth.toString(), 'set-cookie': cookie(OAUTH_COOKIE, signed, 600, isSecure(req)) } });
}

export async function googleCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const saved = await verifyValue<{ state: string; verifier: string; next: string; exp: number }>(env.SESSION_SECRET, cookies(req)[OAUTH_COOKIE]);
  const code = url.searchParams.get('code');
  if (!saved || saved.exp < Date.now() || !code || url.searchParams.get('state') !== saved.state) {
    return new Response('Sign-in expired or was interrupted. Go back and try again.', { status: 400 });
  }
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${url.origin}/auth/google/callback`,
      grant_type: 'authorization_code',
      code_verifier: saved.verifier,
    }),
  });
  if (!tok.ok) return new Response('Google did not accept the sign-in. Try again.', { status: 400 });
  const { id_token } = (await tok.json()) as { id_token?: string };
  // The ID token came straight from Google's token endpoint over TLS, so its claims are checked, not its signature.
  const claims = id_token ? (JSON.parse(new TextDecoder().decode(b64urlDecode(id_token.split('.')[1] || ''))) as Record<string, unknown>) : null;
  if (
    !claims ||
    claims.aud !== env.GOOGLE_CLIENT_ID ||
    !['accounts.google.com', 'https://accounts.google.com'].includes(String(claims.iss)) ||
    claims.email_verified !== true ||
    typeof claims.email !== 'string' ||
    Number(claims.exp) * 1000 < Date.now()
  ) {
    return new Response('Your Google account email could not be verified.', { status: 403 });
  }
  const user = await Users.upsertByEmail(env.DB, claims.email, typeof claims.name === 'string' ? claims.name : null);
  return startSession(req, env, user, saved.next);
}

/** Local development only: sign in as any email. Refuses unless ENVIRONMENT=dev and the request is to localhost. */
export async function devSignIn(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (env.ENVIRONMENT !== 'dev' || !['localhost', '127.0.0.1'].includes(url.hostname)) return new Response('Not found', { status: 404 });
  const email = url.searchParams.get('email') || '';
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return new Response('email required', { status: 400 });
  const user = await Users.upsertByEmail(env.DB, email, null);
  return startSession(req, env, user, url.searchParams.get('next') || '/');
}

// ---------- Platform owner ----------

export function isPlatformOwnerEmail(env: Env, email: string): boolean {
  const list = (env.PLATFORM_OWNERS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

let certCache: { at: number; keys: JsonWebKey[] } | null = null;

/**
 * When ACCESS_TEAM_DOMAIN and ACCESS_AUD are set, /platform also requires a valid Cloudflare Access JWT.
 * Without them, only the PLATFORM_OWNERS email check applies.
 */
export async function accessOk(req: Request, env: Env): Promise<boolean> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return true;
  const jwt = req.headers.get('cf-access-jwt-assertion');
  if (!jwt) return false;
  const [h, p, s] = jwt.split('.');
  if (!h || !p || !s) return false;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h))) as { kid?: string; alg?: string };
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p))) as { aud?: string | string[]; exp?: number; iss?: string };
    if (header.alg !== 'RS256') return false;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD) || !payload.exp || payload.exp * 1000 < Date.now()) return false;
    if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return false;
    if (!certCache || Date.now() - certCache.at > 3600_000) {
      const r = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
      certCache = { at: Date.now(), keys: ((await r.json()) as { keys: JsonWebKey[] }).keys };
    }
    const jwk = certCache.keys.find((k) => (k as JsonWebKey & { kid?: string }).kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
  } catch {
    return false;
  }
}
