// Brand Profile v2 (studio spec §2): colour roles, fonts, look, motion, Scripture version, CCLI, logos.
// Stored in orgs.settings (JSON). Pure: used by the Worker and its tests.

/** Today's six on-air tokens and what they mean in the spec's colour roles. */
export const COLOR_ROLES = [
  ['p', 'primary', 'Primary', '--bp'],
  ['m', 'secondary', 'Secondary', '--bm'],
  ['a', 'accent', 'Accent', '--ba'],
  ['f', 'accent2', 'Second accent (gradients)', '--bf'],
  ['d', 'surface_dark', 'Dark surface', '--bd'],
  ['sl', 'surface_light', 'Light surface', '--bs'],
  ['l', 'text_on_dark', 'Text on dark', '--bl'],
  ['tl', 'text_on_light', 'Text on light', '--bt'],
  ['lv', 'live', 'Live / alert', '--blv'],
] as const;
export type ColorKey = (typeof COLOR_ROLES)[number][0];
export type BrandColors = Record<ColorKey, string>;

export const FONT_CHOICES = ['Default', 'Arial', 'Arial Black', 'Georgia', 'Inter', 'Outfit', 'Fraunces', 'Verdana', 'Trebuchet MS'] as const;
export const THEMES = ['standard', 'sober'] as const;
export const MOTIONS = ['full', 'reduced'] as const;
export const LOGO_VARIANTS = ['full_light', 'full_dark', 'mark_light', 'mark_dark'] as const;
export type LogoVariant = (typeof LOGO_VARIANTS)[number];
/** Public-domain translations that need no licence. */
export const PD_SCRIPTURE = ['KJV', 'WEB', 'ASV', 'YLT', 'DRA'] as const;

export interface BrandKit {
  fonts: { heading: string; body: string; scripture: string };
  theme: (typeof THEMES)[number];
  motion: (typeof MOTIONS)[number];
  scripture: string;
  /** set only when the organisation records that it holds a licence for a non-public-domain translation */
  scriptureLicence: boolean;
  ccli: string;
  /** stored object version per logo (cache key); empty = none */
  logos: Partial<Record<LogoVariant, string>>;
}
export const DEFAULT_KIT: BrandKit = {
  fonts: { heading: 'Default', body: 'Default', scripture: 'Georgia' },
  theme: 'standard', motion: 'full', scripture: 'KJV', scriptureLicence: false, ccli: '', logos: {},
};

const HEX = /^#[0-9a-f]{6}$/i;
/** Fills the three new roles from the old six when missing. */
export function completeColors(b: Partial<BrandColors> & Pick<BrandColors, 'p' | 'd' | 'a' | 'f' | 'm' | 'l'>): BrandColors {
  return { ...b, sl: b.sl && HEX.test(b.sl) ? b.sl : '#f7f7fa', tl: b.tl && HEX.test(b.tl) ? b.tl : '#111318', lv: b.lv && HEX.test(b.lv) ? b.lv : '#c8102e' } as BrandColors;
}

export function cleanColors(v: unknown): BrandColors | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k] of COLOR_ROLES) {
    const x = b[k];
    if (typeof x === 'string' && HEX.test(x)) out[k] = x.toLowerCase();
    else if (['p', 'd', 'a', 'f', 'm', 'l'].includes(k)) return null; // the original six are required
  }
  return completeColors(out as BrandColors);
}

export function cleanKit(v: unknown, prev: BrandKit = DEFAULT_KIT): BrandKit {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, any>;
  const font = (x: unknown, d: string) => ((FONT_CHOICES as readonly string[]).includes(String(x)) ? String(x) : d);
  const fonts = o.fonts && typeof o.fonts === 'object' ? o.fonts : {};
  const scripture = typeof o.scripture === 'string' && /^[A-Za-z0-9 .\-]{2,16}$/.test(o.scripture.trim()) ? o.scripture.trim().toUpperCase() : prev.scripture;
  const licence = !!o.scriptureLicence;
  return {
    fonts: { heading: font(fonts.heading, prev.fonts.heading), body: font(fonts.body, prev.fonts.body), scripture: font(fonts.scripture, prev.fonts.scripture) },
    theme: (THEMES as readonly string[]).includes(o.theme) ? o.theme : prev.theme,
    motion: (MOTIONS as readonly string[]).includes(o.motion) ? o.motion : prev.motion,
    // A licensed translation needs the licence recorded; otherwise fall back to KJV.
    scripture: (PD_SCRIPTURE as readonly string[]).includes(scripture) || licence ? scripture : 'KJV',
    scriptureLicence: licence,
    ccli: typeof o.ccli === 'string' && /^[0-9 ]{0,12}$/.test(o.ccli) ? o.ccli.trim() : prev.ccli,
    logos: prev.logos,
  };
}

// ---------- contrast (WCAG 2.x) ----------
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return Math.round(((x! + 0.05) / (y! + 0.05)) * 100) / 100;
}
/** The text pairs on-air graphics use. Each below 4.5 : 1 is a warning (saving is still allowed). */
export const TEXT_PAIRS: [ColorKey, ColorKey, string][] = [
  ['l', 'd', 'Text on dark surface'],
  ['l', 'p', 'Text on primary'],
  ['a', 'd', 'Accent text on dark surface'],
  ['tl', 'sl', 'Text on light surface'],
  ['l', 'lv', 'Text on live / alert'],
];
export function contrastWarnings(c: BrandColors): { pair: string; ratio: number }[] {
  return TEXT_PAIRS.map(([t, b, pair]) => ({ pair, ratio: contrast(c[t], c[b]) })).filter((x) => x.ratio < 4.5);
}
