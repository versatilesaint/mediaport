// Team page (admins): screen links with QR codes, live status and rotation; activity with filter and CSV; brand editor.
import { qrSvg, esc } from '/assets/catalog.js';
import '/assets/brand-editor.js';

const ORG = document.getElementById('brandEd').dataset.org;
const api = (p, o = {}) => fetch('/api/orgs/' + ORG + p, { ...o, headers: { 'content-type': 'application/json' } })
  .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j; });
const NAMES = { obs: ['OBS', 'Livestream: Browser Source, 1920 × 1080'], freeshow: ['FreeShow', 'Projector: Website item'], stage: ['Stage', 'Speaker screen or tablet, full screen'] };
const ago = (t) => { if (!t) return 'never'; const s = Math.round((Date.now() - t) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); };

async function links() {
  const d = await api('/display-links');
  document.getElementById('links').innerHTML = `<div class="cols">${Object.entries(d.links).map(([o, u]) => {
    const st = d.status?.[o] || {};
    const live = st.connected > 0;
    return `<div class="card tile"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${NAMES[o][0]}</h3><span class="pill ${live ? 'teal' : ''}">${live ? `Connected${st.connected > 1 ? ' · ' + st.connected : ''}` : 'Last seen ' + ago(st.lastSeen)}</span></div>
      <span class="mut" style="font-size:13px">${NAMES[o][1]}</span>
      <div class="row" style="align-items:flex-start;flex-wrap:nowrap;gap:14px"><span style="flex:none">${qrSvg(u, 112)}</span><span class="mono" style="font-size:12px">${esc(u)}</span></div>
      <div class="row"><button class="btn sm" data-copy="${esc(u)}">Copy link</button><button class="btn sm danger" data-rotate="${o}">Make a new link</button></div></div>`;
  }).join('')}</div><p class="mut" style="font-size:13px;margin-top:10px">Scan a QR code with the screen's device, or copy the link. Making a new link stops the old one at once: that screen clears and says so until you paste the new link.</p>`;
}

async function activity() {
  const q = document.getElementById('actQ').value.trim(), days = document.getElementById('actDays').value;
  const qs = '?q=' + encodeURIComponent(q) + '&days=' + days;
  document.getElementById('actCsv').href = '/api/orgs/' + ORG + '/activity.csv' + qs;
  const d = await api('/activity' + qs);
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: d.tz, dateStyle: 'medium', timeStyle: 'medium' });
  document.getElementById('actList').innerHTML = d.rows.length
    ? `<table><tr><th>Time</th><th>Type</th><th>What</th><th>Who</th></tr>${d.rows.slice(0, 200).map((r) => `<tr><td style="white-space:nowrap">${esc(f.format(r.at))}</td><td><span class="pill ${r.kind === 'on air' ? 'orange' : ''}">${esc(r.kind)}</span></td><td>${esc(r.what)}</td><td>${esc(r.who)}</td></tr>`).join('')}</table>${d.rows.length > 200 ? `<p class="mut" style="font-size:13px">Showing 200 of ${d.rows.length}. Download the CSV for all of them.</p>` : ''}`
    : '<p class="mut" style="margin:0">Nothing yet for this filter.</p>';
}

document.addEventListener('click', async (e) => {
  const c = e.target.closest('[data-copy]');
  if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); c.textContent = 'Copied'; } catch { c.textContent = 'Select and copy'; } }
  const r = e.target.closest('[data-rotate]');
  if (r) {
    if (r.dataset.armed !== '1') { r.dataset.armed = '1'; r.textContent = 'Tap again: the old link stops'; return; }
    await fetch('/api/orgs/' + ORG + '/display-links/' + r.dataset.rotate + '/rotate', { method: 'POST' });
    links(); activity();
  }
});
let t;
document.getElementById('actQ').addEventListener('input', () => { clearTimeout(t); t = setTimeout(activity, 250); });
document.getElementById('actDays').addEventListener('change', activity);
links().catch((e) => { document.getElementById('links').textContent = e.message; });
activity().catch((e) => { document.getElementById('actList').textContent = e.message; });
setInterval(() => links().catch(() => {}), 15000);
