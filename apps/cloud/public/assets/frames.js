// Camera frames (studio spec §5): branded frames with see-through windows; OBS puts cameras behind them.
// Pure geometry, shared by the renderer (catalog.js), the studio's OBS position box, the Worker and the tests.
// Canvas 1920×1080. Defaults: margin 60, gap 24 (borders: margin 30). Window edges are rounded to whole pixels,
// then width = right − left and height = bottom − top, which reproduces the spec's table exactly.

export const W = 1920, H = 1080;
export const FRAME_IDS = ['F01','F02','F03','F04','F05','F06','F07','F08','F09','F10','F11','F12','F13','F14','F15','F16','F17'];
/** Template number → frame layout. #228–230 are the spec's extra frames (Quad, Camera + Announcement, Camera + Countdown). */
export const FRAME_OF = { 76:'F01', 80:'F02', 81:'F03', 83:'F04', 82:'F05', 228:'F06', 86:'F07', 87:'F08', 88:'F09', 89:'F10', 90:'F11', 84:'F12', 85:'F12', 91:'F13', 92:'F14', 229:'F15', 230:'F16', 93:'F17' };
export const FRAME_NAME = { F01:'Full Camera Frame', F02:'Picture-in-Picture', F03:'Dual Camera', F04:'Split Screen', F05:'Triple Camera', F06:'Quad Multi-Camera', F07:'Camera + Scripture', F08:'Camera + Lyrics', F09:'Camera + Presentation', F10:'Interview / Testimony', F11:'Guest Video Call', F12:'Vertical Camera', F13:'Live Camera Border', F14:'Corners', F15:'Camera + Announcement', F16:'Camera + Countdown', F17:'Multi-Camera ID' };

const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) && String(v).trim() !== '' ? Math.min(hi, Math.max(lo, n)) : d; };
/** A window from fractional edges, rounded edge by edge. */
const E = (x, y, w, h) => { const l = Math.round(x), t = Math.round(y), r = Math.round(x + w), b = Math.round(y + h); return { x: l, y: t, w: r - l, h: b - t }; };
/** Largest 16:9 box in (w × h), centred. */
const fit169 = (x, y, w, h) => { const ww = Math.min(w, (h * 16) / 9), hh = (ww * 9) / 16; return E(x + (w - ww) / 2, y + (h - hh) / 2, ww, hh); };
const win = (d, n, r, cam, label, extra = {}) => ({ n, ...r, cam: String(d['cam' + n] || cam), label: d['label' + n] != null && d['label' + n] !== '' ? String(d['label' + n]) : label, ...extra });

function grid(kind, d, m, g) {
  const iw = W - 2 * m, ih = H - 2 * m;
  if (kind === 'dual') return [win(d, 1, fit169(m, m, (iw - g) / 2, ih), 'Camera 1', 'Camera 1'), win(d, 2, fit169(m + (iw + g) / 2, m, (iw - g) / 2, ih), 'Camera 2', 'Camera 2')];
  if (kind === 'triple') {
    let bw = (iw - g / 9) / 1.5, bh = (bw * 9) / 16;
    if (bh > ih) { bh = ih; bw = (bh * 16) / 9; }
    const sh = (bh - g) / 2, sw = (sh * 16) / 9, x0 = m + (iw - (bw + g + sw)) / 2, y0 = m + (ih - bh) / 2;
    return [win(d, 1, E(x0, y0, bw, bh), 'Camera 1', 'Camera 1'), win(d, 2, E(x0 + bw + g, y0, sw, sh), 'Camera 2', 'Camera 2'), win(d, 3, E(x0 + bw + g, y0 + sh + g, sw, sh), 'Camera 3', 'Camera 3')];
  }
  if (kind === 'quad') {
    const ch = (ih - g) / 2, cw = (ch * 16) / 9 > (iw - g) / 2 ? (iw - g) / 2 : (ch * 16) / 9, chh = (cw * 9) / 16;
    const x0 = m + (iw - (2 * cw + g)) / 2, y0 = m + (ih - (2 * chh + g)) / 2;
    return [0, 1, 2, 3].map((i) => win(d, i + 1, E(x0 + (i % 2) * (cw + g), y0 + Math.floor(i / 2) * (chh + g), cw, chh), 'Camera ' + (i + 1), 'Camera ' + (i + 1)));
  }
  // split: two full-height windows; the first takes `ratio` % of the width (default 50)
  const r = num(d.ratio, 50, 25, 75) / 100, aw = (iw - g) * r;
  return [win(d, 1, E(m, m, aw, ih), 'Camera 1', 'Camera 1'), win(d, 2, E(m + aw + g, m, iw - g - aw, ih), 'Camera 2', 'Camera 2')];
}

/** Big 16:9 window + a smaller 16:9 window beside it, top-aligned, filling the width (Presentation, Video call). */
function bigSmall(d, m, g, smallDefault, big, small) {
  const iw = W - 2 * m, ih = H - 2 * m;
  const sw = num(d.small, smallDefault, 240, 900), bw = iw - g - sw;
  const bh = (bw * 9) / 16, y0 = m + (ih - bh) / 2;
  const a = win(d, 1, E(m, y0, bw, bh), big[0], big[1]), b = win(d, 2, E(m + bw + g, y0, sw, (sw * 9) / 16), small[0], small[1]);
  const py = b.y + b.h + g;
  return { a, b, panel: E(b.x, py, b.w, a.y + a.h - py) };
}

/** A camera window on one side and a text panel on the other (Camera + Scripture / Announcement / Countdown). */
function side(d, m, g, dRatio, kind) {
  const iw = W - 2 * m, ih = H - 2 * m, r = num(d.ratio, dRatio, 35, 75) / 100, cw = (iw - g) * r, right = d.side === 'right';
  const cam = E(right ? m + iw - cw : m, m, cw, ih), panel = E(right ? m : m + cw + g, m, iw - g - cw, ih);
  return { windows: [win(d, 1, cam, 'Camera 1', 'Live')], panels: [{ kind, ...panel }], backdrop: true, outline: 'frame' };
}

/** Geometry for a frame and its settings, in canvas pixels. */
export function frameLayout(id, d = {}) {
  const border = id === 'F13' || id === 'F14';
  const m = num(d.margin, border ? 30 : 60, 0, 200), g = num(d.gap, 24, 0, 120), iw = W - 2 * m, ih = H - 2 * m;
  switch (id) {
    case 'F01': return { windows: [win(d, 1, E(m, m, iw, ih), 'Camera 1', 'Live')], panels: [], backdrop: true, outline: 'frame' };
    case 'F02': {
      const size = num(d.size, 28, 15, 50) / 100, pw = W * size, ph = (pw * 9) / 16, c = String(d.corner || 'br');
      const x = c.endsWith('l') ? m : W - m - pw, y = c.startsWith('t') ? m : H - m - ph;
      return { windows: [win(d, 1, { x: 0, y: 0, w: W, h: H }, 'Camera 1', '', { plain: true }), win(d, 2, E(x, y, pw, ph), 'Camera 2', 'Camera 2')], panels: [], backdrop: false, outline: 'frame' };
    }
    case 'F03': case 'F10': return { windows: grid('dual', d, m, g), panels: [], backdrop: true, outline: 'frame', names: id === 'F10' };
    case 'F04': return { windows: grid('split', d, m, g), panels: [], backdrop: true, outline: 'frame' };
    case 'F05': return { windows: grid('triple', d, m, g), panels: [], backdrop: true, outline: 'frame' };
    case 'F06': return { windows: grid('quad', d, m, g), panels: [], backdrop: true, outline: 'frame' };
    case 'F17': return { windows: grid('quad', d, m, g), panels: [], backdrop: false, outline: 'none', labelsOnly: true };
    case 'F07': return side(d, m, g, 58, 'scripture');
    case 'F15': return side(d, m, g, 60, 'announcement');
    case 'F16': return side(d, m, g, 60, 'countdown');
    case 'F08': {
      const band = num(d.band, 260, 120, 500), camH = ih - g - band;
      return { windows: [win(d, 1, E(m, m, iw, camH), 'Camera 1', 'Worship')], panels: [{ kind: 'lyrics', ...E(m, m + camH + g, iw, band) }], backdrop: true, outline: 'frame' };
    }
    case 'F09': { const r = bigSmall(d, m, g, 504, ['Slides', 'Slides'], ['Camera 1', 'Speaker']); return { windows: [r.a, r.b], panels: [{ kind: 'caption', ...r.panel }], backdrop: true, outline: 'frame' }; }
    case 'F11': { const r = bigSmall(d, m, g, 540, ['Guest', 'Guest'], ['Camera 1', 'Live']); return { windows: [r.a, r.b], panels: [{ kind: 'guest', ...r.panel }], backdrop: true, outline: 'frame' }; }
    case 'F12': { const vw = (ih * 9) / 16; return { windows: [win(d, 1, E((W - vw) / 2, m, vw, ih), 'Camera 1', '')], panels: [{ kind: 'caption', ...E((W + vw) / 2 + g, H - m - 200, (W - vw) / 2 - g - m, 200) }], backdrop: true, outline: 'frame' }; }
    case 'F13': return { windows: [win(d, 1, E(m, m, iw, ih), 'Camera 1', '')], panels: [], backdrop: false, outline: 'animated' };
    case 'F14': return { windows: [win(d, 1, E(m, m, iw, ih), 'Camera 1', '')], panels: [], backdrop: false, outline: 'corners' };
  }
  return { windows: [], panels: [], backdrop: false, outline: 'none' };
}

/** OBS sources and where each goes (canvas pixels): for the OBS position box and automatic placement. */
export const obsPositions = (id, d) => frameLayout(id, d).windows.filter((w) => w.cam && w.cam !== 'None').map((w) => ({ n: w.n, source: w.cam, label: w.label, x: w.x, y: w.y, w: w.w, h: w.h }));
