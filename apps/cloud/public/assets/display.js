// MediaPort display output (OBS Browser Source, FreeShow Website item, Stage screen).
// Read-only: it follows the organisation's room and never sends changes. It keeps the last picture on screen
// through network loss (brief §4.2) and reconnects with backoff (0.5 s to 5 s).
import { reconcile, listFor, brandVars, tmrEl, tmrPhase, tmrText, PH, fmt, clock, now } from '/assets/catalog.js';

const BOOT = JSON.parse(document.getElementById('mp-boot').textContent);
const OUT = BOOT.output;
const CACHE = 'mp.snap.' + BOOT.slug + ':' + OUT;
const cv = document.getElementById('cv');
const dot = document.getElementById('dot');
let profile = BOOT.profile;
let state = null;

if (OUT === 'stage') document.body.classList.add('stage');
if (BOOT.reduceMotion) document.body.classList.add('reduce-motion');

function scale() {
  // The page is 1920x1080. If a browser window is a different size, fit it without changing the layout.
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  cv.style.transform = s === 1 ? '' : `scale(${s})`;
}
addEventListener('resize', scale);
scale();

function render(fresh) {
  if (!state) return;
  const oc = (state.outputs && state.outputs[OUT]) || {};
  document.body.classList.toggle('ff', oc.mode === 'fullframe' && OUT !== 'stage');
  document.body.classList.toggle('bo', !!oc.blackout);
  cv.setAttribute('style', brandVars(profile) + ';' + (cv.style.transform ? 'transform:' + cv.style.transform : ''));
  scale();
  if (fresh) cv.classList.add('noanim');
  reconcile(cv, oc.blackout ? [] : listFor(state, OUT, profile));
  if (fresh) requestAnimationFrame(() => cv.classList.remove('noanim'));
  tick();
}

function apply(s, p, fresh) {
  state = s;
  if (p) profile = { ...profile, ...p };
  render(fresh);
  try { localStorage.setItem(CACHE, JSON.stringify({ state: s, profile })); } catch { /* storage blocked */ }
}

// Show the last known picture at once, before the connection opens.
try {
  const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
  if (c && c.state) apply(c.state, c.profile, true);
} catch { /* no cache */ }

let ws, wait = 500, first = true;
function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/${encodeURIComponent(BOOT.slug)}/ws?role=display&output=${OUT}&k=${encodeURIComponent(BOOT.key)}`);
  ws.onopen = () => { wait = 500; if (dot) dot.dataset.s = 'on'; ws.send(JSON.stringify({ v: 1, type: 'ping', t: Date.now() })); };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === 'hello') clock.offset = m.serverTime - Date.now();
    else if (m.type === 'pong') clock.offset = m.serverTime + (Date.now() - m.t) / 2 - Date.now();
    else if (m.type === 'snapshot') { apply(m.state, m.profile, first); first = false; }
  };
  ws.onclose = (e) => {
    if (dot) dot.dataset.s = 'off';
    // 4001: the key was rotated or the organisation suspended. Keep the last picture; stop retrying fast.
    setTimeout(connect, e.code === 4001 ? 30000 : wait);
    wait = Math.min(5000, wait * 2);
  };
}
setInterval(() => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ v: 1, type: 'ping', t: Date.now() })); }, 30000);

function tick() {
  const t0 = now();
  const ck = new Date(t0).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  for (const e of document.querySelectorAll('[data-kind="clock"]')) e.textContent = ck;
  for (const e of document.querySelectorAll('[data-kind="cd"]')) { const r = +e.dataset.t - t0; e.textContent = r > 0 ? fmt(r) : 'Starting'; }
  const t = state && state.timer;
  if (!t) return;
  const ph = tmrPhase(t), used = Math.min(1, tmrEl(t) / t.durationMs);
  for (const e of document.querySelectorAll('[data-kind="timer"]')) e.textContent = tmrText(t, !!e.dataset.short);
  for (const e of document.querySelectorAll('[data-kind="tph"]')) e.textContent = PH[ph][0];
  for (const e of document.querySelectorAll('.tphase')) { e.dataset.phase = ph; e.style.setProperty('--pc', PH[ph][1]); }
  for (const e of document.querySelectorAll('.tms .bar i')) e.style.width = used * 100 + '%';
}
setInterval(tick, 250);
connect();
