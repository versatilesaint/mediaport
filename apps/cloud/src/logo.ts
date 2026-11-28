// Logo upload checks (studio spec §10: validate type and size, strip metadata).
// Accepts PNG and SVG only. The browser converts JPEG/WebP/etc. to PNG before upload (which also drops EXIF);
// here PNG text/EXIF/time chunks are removed as well, and SVGs with scripts or event handlers are refused.

export const MAX_LOGO_BYTES = 1_500_000;
const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const DROP = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']);

/** Removes metadata chunks from a PNG. Returns null if the file isn't a well-formed PNG. */
export function stripPng(b: Uint8Array): Uint8Array | null {
  if (b.length < 8 || PNG_SIG.some((x, i) => b[i] !== x)) return null;
  const keep: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8, sawEnd = false;
  while (i + 12 <= b.length) {
    const len = ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
    const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
    const end = i + 12 + len;
    if (end > b.length) return null;
    if (!DROP.has(type)) keep.push(b.subarray(i, end));
    i = end;
    if (type === 'IEND') { sawEnd = true; break; }
  }
  if (!sawEnd) return null;
  const out = new Uint8Array(keep.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of keep) { out.set(c, o); o += c.length; }
  return out;
}

const SVG_BAD = /<script|<foreignobject|\son[a-z]+\s*=|javascript:|<iframe|<embed|<object|xlink:href\s*=\s*["']?\s*(?!#)|href\s*=\s*["']?\s*(?!#|data:image\/)[a-z]+:/i;

export function checkLogo(contentType: string, bytes: Uint8Array): { bytes: Uint8Array; type: string; ext: 'png' | 'svg' } | { error: string } {
  if (!bytes.length) return { error: 'The file is empty.' };
  if (bytes.length > MAX_LOGO_BYTES) return { error: 'Logos must be 1.5 MB or smaller.' };
  const ct = contentType.split(';')[0]!.trim().toLowerCase();
  if (ct === 'image/png') {
    const clean = stripPng(bytes);
    return clean ? { bytes: clean, type: 'image/png', ext: 'png' } : { error: 'That file is not a valid PNG image.' };
  }
  if (ct === 'image/svg+xml') {
    const text = new TextDecoder().decode(bytes);
    if (!/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text)) return { error: 'That file is not an SVG image.' };
    if (SVG_BAD.test(text)) return { error: 'SVG logos can’t contain scripts, links or embedded content. Export a plain SVG, or upload a PNG.' };
    return { bytes, type: 'image/svg+xml', ext: 'svg' };
  }
  return { error: 'Upload a PNG or SVG file.' };
}
