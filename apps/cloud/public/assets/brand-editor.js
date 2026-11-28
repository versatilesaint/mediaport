// Settings › Brand (studio spec §2): colour roles with a contrast check, fonts, look, motion, Bible version, CCLI,
// four logo variants, and a live preview drawn by the same renderer as the on-air screens.
import { T, G, sample, brandVars, brandClass, esc } from '/assets/catalog.js';

const root = document.getElementById('brandEd');
const ORG = root.dataset.org;
const api = (p, o = {}) => fetch('/api/orgs/' + ORG + p, { ...o, headers: { ...(o.body instanceof Blob ? {} : { 'content-type': 'application/json' }), ...(o.headers || {}) } })
  .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j; });

const ROLES = [['p', 'Primary'], ['m', 'Secondary'], ['a', 'Accent'], ['f', 'Second accent'], ['d', 'Dark surface'], ['sl', 'Light surface'], ['l', 'Text on dark'], ['tl', 'Text on light'], ['lv', 'Live / alert']];
const PAIRS = [['l', 'd', 'Text on dark surface'], ['l', 'p', 'Text on primary'], ['a', 'd', 'Accent text on dark surface'], ['tl', 'sl', 'Text on light surface'], ['l', 'lv', 'Text on live / alert']];
const FONTS = ['Default', 'Arial', 'Arial Black', 'Georgia', 'Inter', 'Outfit', 'Fraunces', 'Verdana', 'Trebuchet MS'];
const PD = ['KJV', 'WEB', 'ASV', 'YLT', 'DRA'];
const LOGOS = [['full_light', 'Full logo · light (for dark backgrounds and video)'], ['full_dark', 'Full logo · dark (for light backgrounds)'], ['mark_light', 'Mark only · light'], ['mark_dark', 'Mark only · dark']];
// Three very different palettes, to try the look quickly (also the test fixtures).
const PRESETS = [
  ['Navy and gold', { p: '#0e2a5c', m: '#3a7bd5', a: '#f2c14e', f: '#d7263d', d: '#061634', sl: '#f4f7ff', l: '#f4f7ff', tl: '#0b1530', lv: '#e11d2e' }],
  ['Warm light', { p: '#8a3b12', m: '#c2410c', a: '#fde68a', f: '#ea580c', d: '#2a1206', sl: '#fff7ed', l: '#fffaf0', tl: '#2a1206', lv: '#b91c1c' }],
  ['Mono high contrast', { p: '#111111', m: '#444444', a: '#ffffff', f: '#9ca3af', d: '#000000', sl: '#ffffff', l: '#ffffff', tl: '#000000', lv: '#dc2626' }],
];

const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

let S; // { colors, kit, logos, profile }

function draw() {
  const c = S.colors, k = S.kit;
  const colorRows = ROLES.map(([key, label]) => `<label>${label}<span class="row" style="flex-wrap:nowrap"><input type="color" data-c="${key}" value="${c[key]}" style="width:52px;padding:4px;flex:none"><input data-hex="${key}" value="${c[key]}" maxlength="7" class="mono" style="flex:1"></span></label>`).join('');
  const sel = (name, opts, v) => `<select data-k="${name}">${opts.map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const logoSlots = LOGOS.map(([v, label]) => `<div class="card tile" style="padding:14px"><b style="font-size:14px">${label}</b>
    <div style="height:84px;border-radius:10px;display:grid;place-items:center;background:${v.endsWith('light') ? c.d : c.sl};border:1px solid var(--hairline)">${S.logos[v] ? `<img src="${esc(S.logos[v])}" alt="" style="max-width:90%;max-height:70px">` : `<span class="mut" style="font-size:13px;color:${v.endsWith('light') ? c.l : c.tl}">No logo yet</span>`}</div>
    <div class="row"><label class="btn sm" style="display:inline-flex">Upload<input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" data-logo="${v}" hidden></label>${S.logos[v] ? `<button class="btn sm danger" data-rmlogo="${v}">Remove</button>` : ''}</div></div>`).join('');
  root.innerHTML = `
  <div class="card grid">
    <div class="row"><span class="mut" style="font-size:13px">Try a palette:</span>${PRESETS.map(([n], i) => `<button class="btn sm" data-preset="${i}">${n}</button>`).join('')}</div>
    <div class="cols" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))">${colorRows}</div>
    <div id="contrast"></div>
    <div class="cols" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))">
      <label>Heading font${sel('fonts.heading', FONTS, k.fonts.heading)}</label>
      <label>Body font${sel('fonts.body', FONTS, k.fonts.body)}</label>
      <label>Scripture font${sel('fonts.scripture', FONTS, k.fonts.scripture)}</label>
      <label>Look${sel('theme', ['standard', 'sober'], k.theme)}</label>
      <label>Motion${sel('motion', ['full', 'reduced'], k.motion)}</label>
      <label>CCLI licence number<input data-k="ccli" value="${esc(k.ccli)}" inputmode="numeric" maxlength="12" placeholder="e.g. 1234567"></label>
      <label>Bible version<input data-k="scripture" value="${esc(k.scripture)}" maxlength="16" list="pdlist"><datalist id="pdlist">${PD.map((x) => `<option>${x}</option>`).join('')}</datalist></label>
      <label style="align-self:end;display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" data-k="scriptureLicence" ${k.scriptureLicence ? 'checked' : ''} style="width:20px;min-height:20px">We hold a licence for this version</label>
    </div>
    <p class="mut" style="font-size:13px;margin:0">Sober: muted colours, no light sweeps, slower movement (funerals, solemn services). Reduced motion: short fades only. Versions other than KJV, WEB, ASV, YLT and DRA need the licence box ticked.</p>
    <div class="row"><button class="btn pri" data-save>Save brand</button><span id="bout" role="status"></span></div>
  </div>
  <h3 style="margin:22px 0 10px">Preview</h3>
  <div class="cols" id="prev"></div>
  <h3 style="margin:22px 0 10px">Logos</h3>
  <p class="mut" style="font-size:14px">PNG or SVG, up to 1.5 MB. Other image types are converted to PNG in your browser, which also removes hidden details such as camera and location data.</p>
  <div class="cols">${logoSlots}</div>`;
  contrast();
  preview();
}

function contrast() {
  const c = S.colors;
  const rows = PAIRS.map(([t, b, n]) => { const r = ratio(c[t], c[b]); return `<span class="pill ${r >= 4.5 ? 'teal' : 'orange'}" title="${n}">${n}: ${r.toFixed(1)} : 1${r >= 4.5 ? '' : ' · low'}</span>`; }).join(' ');
  document.getElementById('contrast').innerHTML = `<div class="row" style="gap:6px">${rows}</div>`;
}

function preview() {
  const org = { ...S.profile, brand: S.colors, kit: { ...S.kit, logos: S.logos } };
  const box = document.getElementById('prev');
  box.innerHTML = [46, 16, 1].map((n) => `<div style="aspect-ratio:16/9;border-radius:12px;overflow:hidden;position:relative;background:linear-gradient(135deg,#3b4652,#1b232c)"><div class="pv" data-n="${n}" style="position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0"></div></div>`).join('');
  for (const el of box.querySelectorAll('.pv')) {
    const t = T(+el.dataset.n);
    const it = { id: 'pv' + t.n, n: t.n, comp: t.comp, slot: t.slot, live: sample(t, org) };
    const [cls, html] = G(it, it.live, 'obs', 0, org, { timer: {} });
    el.setAttribute('style', el.getAttribute('style') + ';' + brandVars(org));
    el.className = 'pv ' + brandClass(org);
    el.innerHTML = `<div class="g ${cls.split('"')[0]}" style="${(cls.split('style="')[1] || '').replace(/"$/, '')}">${html}</div>`;
    const fit = () => { el.style.transform = `scale(${el.parentElement.clientWidth / 1920})`; };
    fit(); addEventListener('resize', fit);
  }
}

function setColor(key, v) {
  if (!/^#[0-9a-f]{6}$/i.test(v)) return;
  S.colors[key] = v.toLowerCase();
  const a = root.querySelector(`[data-c="${key}"]`), h = root.querySelector(`[data-hex="${key}"]`);
  if (a && a.value !== v) a.value = v;
  if (h && h.value !== v) h.value = v;
  contrast(); preview();
}

root.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.c) setColor(t.dataset.c, t.value);
  else if (t.dataset.hex) setColor(t.dataset.hex, t.value.trim());
  else if (t.dataset.k) {
    const v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.k.startsWith('fonts.')) S.kit.fonts[t.dataset.k.slice(6)] = v; else S.kit[t.dataset.k] = v;
    preview();
  }
});

/** Any image → PNG (max 2000 px), re-encoded so hidden metadata is gone. SVG is sent as is (the server checks it). */
async function toUpload(file) {
  if (file.type === 'image/svg+xml') return file;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((r) => c.toBlob(r, 'image/png'));
}

root.addEventListener('change', async (e) => {
  const t = e.target;
  if (!t.dataset.logo || !t.files?.[0]) return;
  const out = document.getElementById('bout');
  out.className = ''; out.textContent = 'Uploading…';
  try {
    const blob = await toUpload(t.files[0]);
    const j = await api('/brand/logo/' + t.dataset.logo, { method: 'POST', body: blob, headers: { 'content-type': blob.type || 'image/png' } });
    S.logos = j.logos; draw();
    document.getElementById('bout').className = 'ok'; document.getElementById('bout').textContent = 'Logo saved. It is on air now.';
  } catch (err) { out.className = 'err'; out.textContent = err.message; }
});

root.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const out = document.getElementById('bout');
  if (b.dataset.preset) { Object.assign(S.colors, PRESETS[+b.dataset.preset][1]); draw(); }
  else if (b.dataset.rmlogo) { try { const j = await api('/brand/logo/' + b.dataset.rmlogo, { method: 'DELETE' }); S.logos = j.logos; draw(); } catch (err) { out.className = 'err'; out.textContent = err.message; } }
  else if ('save' in b.dataset) {
    out.className = ''; out.textContent = 'Saving…';
    try {
      const j = await api('/brand', { method: 'PUT', body: JSON.stringify({ colors: S.colors, kit: S.kit }) });
      out.className = j.warnings.length ? 'err' : 'ok';
      out.textContent = j.warnings.length ? `Saved. ${j.warnings.length} text pair(s) are hard to read (below 4.5 : 1): ${j.warnings.map((w) => w.pair).join(', ')}.` : 'Saved. Every screen has the new look.';
    } catch (err) { out.className = 'err'; out.textContent = err.message; }
  }
});

api('/brand').then((j) => { S = j; draw(); }).catch((e) => { root.innerHTML = `<div class="card err">${esc(e.message)}</div>`; });
