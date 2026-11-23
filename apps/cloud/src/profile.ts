// Builds the organisation profile that graphics and the room use: names, mark, brand kit, lead person.
import type { Org } from './db';
import type { OrgProfile } from './room';
// @ts-expect-error plain JS module shared with the browser
import { PACKS } from '../public/assets/catalog.js';

export type Brand = OrgProfile['brand'];
export const DEFAULT_BRAND: Brand = { p: '#0e2a5c', d: '#061634', a: '#f2c14e', f: '#d7263d', m: '#3a7bd5', l: '#f4f7ff' };
const HEX = /^#[0-9a-f]{6}$/i;

export function cleanBrand(v: unknown): Brand | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Record<string, unknown>;
  const keys = ['p', 'd', 'a', 'f', 'm', 'l'] as const;
  if (!keys.every((k) => typeof b[k] === 'string' && HEX.test(b[k] as string))) return null;
  return Object.fromEntries(keys.map((k) => [k, (b[k] as string).toLowerCase()])) as Brand;
}

export const initials = (v: string) => (v.match(/[A-Za-z0-9]+/g) || ['?']).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export function orgProfile(org: Org): OrgProfile {
  const s = org.settings as Org['settings'] & { brand?: unknown; lead?: unknown; mark?: unknown };
  const lead = Array.isArray(s.lead) && s.lead.length === 2 && s.lead.every((x) => typeof x === 'string') ? (s.lead as [string, string]) : null;
  const pack = (PACKS as Record<string, { svc: string }>)[org.pack] ? org.pack : 'church';
  return {
    slug: org.slug,
    name: org.name,
    short: org.short_name,
    mk: typeof s.mark === 'string' && s.mark ? s.mark.slice(0, 3) : initials(org.short_name),
    loc: s.location || '',
    motto: s.motto || '',
    web: s.website || '',
    depts: Array.isArray(s.departments) ? s.departments.filter((x) => typeof x === 'string').slice(0, 30) : [],
    lead: lead ?? [pack === 'church' ? 'Pastor' : 'Host', 'Add names in People'],
    brand: cleanBrand(s.brand) ?? DEFAULT_BRAND,
    pack,
    svc: (PACKS as Record<string, { svc: string }>)[pack]!.svc,
  };
}
