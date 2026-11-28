// Home page 3D header: builds the extruded MP mark and the orbiting media cards, tilts with the pointer,
// and pauses on request. Everything degrades to a still picture with prefers-reduced-motion.
const stage = document.querySelector('.stage3d');
const scene = stage?.querySelector('.scene');
const wrap = document.querySelector('.landing');
const ACCENT = '#e8552b';

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(v * k);
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// The mark: 14 copies stacked in depth, darker towards the back (an extrusion without WebGL).
const mark = stage?.querySelector('.mark');
if (mark) {
  const depth = 14;
  let svgs = '';
  for (let i = depth - 1; i >= 0; i--) {
    const front = i === 0;
    const k = 0.55 + 0.35 * (1 - i / depth);
    const letter = front ? '#f7f4ef' : shade('#f7f4ef', k);
    const bowl = front ? ACCENT : shade(ACCENT, k);
    svgs += `<svg viewBox="14 24 92 72" aria-hidden="true" style="transform:translateZ(${(-i * 2.2).toFixed(1)}px)"><g transform="translate(-1.5 -1)" fill="none" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"><path d="M24 86V34l22 28 22-28v52" stroke="${letter}"/><path d="M68 34h12a17 17 0 0 1 0 34H68" stroke="${bowl}"/><path d="M77.5 44.5v13l10-6.5z" fill="${letter}" stroke="${letter}" stroke-width="1.5"/></g></svg>`;
  }
  mark.innerHTML = svgs;
}

// The orbit: six media cards on a ring.
const ICONS = {
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  live: '<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
  audio: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
  slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-9 8"/>',
  caption: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 11h4M7 15h7M14 11h3"/>',
};
const CARDS = [
  ['video', 'Sermon clip', '1080p · 3:42', ACCENT],
  ['live', 'Livestream', 'YouTube · ready', '#2bb5a5'],
  ['audio', 'Worship audio', 'WAV · 48 kHz', '#f7f4ef'],
  ['slides', 'Service slides', '24 slides', ACCENT],
  ['photo', 'Event photos', '128 images', '#2bb5a5'],
  ['caption', 'Captions', 'Auto · English', '#f7f4ef'],
];
const orbit = stage?.querySelector('.orbit');
if (orbit) {
  orbit.innerHTML = CARDS.map(([k, t, m, chip], i) => `<div class="mcard" style="transform:rotateY(${(i * 360) / CARDS.length}deg) translateZ(290px) translateY(${i % 2 ? 70 : -70}px)"><span class="chip" style="background:${chip}"><svg viewBox="0 0 24 24" fill="none" stroke="#0f1e2e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg></span><span><b>${t}</b><small>${m}</small></span></div>`).join('');
}

// Pointer tilt (one update per frame).
let raf = 0, want = null;
const tilt = (rx, ry) => {
  want = [rx, ry];
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; if (want && scene) scene.style.transform = `rotateX(${want[0]}deg) rotateY(${want[1]}deg)`; });
};
stage?.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect();
  tilt(-6 - ((e.clientY - r.top) / r.height - 0.5) * 24, -18 + ((e.clientX - r.left) / r.width - 0.5) * 50);
});
stage?.addEventListener('pointerleave', () => tilt(-6, -18));

// Pause / play motion (remembered on this device).
const btn = document.querySelector('[data-motion]');
const setPaused = (p) => {
  wrap?.classList.toggle('paused', p);
  btn?.setAttribute('aria-pressed', String(p));
  try { localStorage.setItem('mp-motion-paused', p ? '1' : ''); } catch {}
};
let saved = false;
try { saved = localStorage.getItem('mp-motion-paused') === '1'; } catch {}
setPaused(saved);
btn?.addEventListener('click', () => setPaused(!wrap?.classList.contains('paused')));
