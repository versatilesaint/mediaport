// Server-rendered pages for Phase 0. The full control shell (brief §7, §7.1) replaces /control in Phase 1.

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const SECURITY_HEADERS: Record<string, string> = {
  'content-type': 'text/html; charset=utf-8',
  'x-content-type-options': 'nosniff',
  // Display links carry their key in the query string; never leak it through Referer.
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self' https://accounts.google.com",
};

export function html(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...SECURITY_HEADERS, 'cache-control': 'no-store', ...extra } });
}

import { headLinks, sitePage, roomHead, type RoomId } from './site';
import { platformSignedOut } from './rooms';

/** Every server-rendered page sits in the shared site frame (room bar, favicons, MediaPort tokens). */
export function page(title: string, body: string, opts: { user?: { email: string } | null; script?: string; room?: RoomId | null; scriptSrc?: string; css?: string[] } = {}): Response {
  return html(sitePage({ title, room: opts.room ?? null, user: opts.user, body, inlineScript: opts.script, scriptSrc: opts.scriptSrc, css: opts.css }));
}

export function message(title: string, text: string, status = 200, user?: { email: string } | null, action?: string) {
  const r = page(title, `<div class="card"><h1>${esc(title)}</h1><p class="mut">${esc(text)}</p>${action ?? ''}</div>`, { user });
  return new Response(r.body, { status, headers: r.headers });
}

export function signInPage(next: string, googleReady: boolean) {
  return page('Sign in · MediaPort', platformSignedOut(googleReady, next), { room: 'platform' });
}

export function controlPage(user: { email: string }, org: { slug: string; name: string }, role: string) {
  const script = `
const ORG=${JSON.stringify(org.slug)},ROLE=${JSON.stringify(role)};
const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=(p,o={})=>fetch('/api/orgs/'+ORG+p,{...o,headers:{'content-type':'application/json',...(o.headers||{})}}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok) throw new Error(j.error||r.statusText);return j});
const canAdmin=['owner','admin'].includes(ROLE);
async function load(){
  const m=await api('/members');
  $('#members').innerHTML='<table><tr><th>Email</th><th>Role</th></tr>'+m.members.map(x=>'<tr><td>'+esc(x.email)+'</td><td>'+esc(x.role)+'</td></tr>').join('')+'</table>'+(m.invites&&m.invites.length?'<p class="mut" style="margin-top:12px">Waiting to accept: '+m.invites.map(i=>esc(i.email)+' ('+esc(i.role)+')').join(', ')+'</p>':'');
}

const f=$('#invite');if(f) f.addEventListener('submit',async e=>{e.preventDefault();const out=$('#invout');out.className='';out.textContent='Creating…';
 try{const j=await api('/invites',{method:'POST',body:JSON.stringify({email:f.email.value,role:f.role.value})});out.className='ok';out.innerHTML='Invite link (valid 7 days, send it to them): <div class="mono" style="margin-top:6px">'+esc(j.url)+'</div>';f.reset();load()}catch(err){out.className='err';out.textContent=err.message}});
load().catch(e=>{$('#members').textContent=e.message});`;
  return page(
    `${org.name} · MediaPort`,
    `${roomHead('platform', 'Platform · /' + org.slug, org.name, `You're signed in as <b>${esc(role)}</b>. <a href="/${esc(org.slug)}/control">Open the studio</a>`)}
    <h2>Team</h2><div class="card" id="members">Loading…</div>
    ${
      ['owner', 'admin'].includes(role)
        ? `<h2>Invite someone</h2><form class="card grid" id="invite" style="grid-template-columns:2fr 1fr auto;align-items:end"><label>Email<input name="email" type="email" required autocomplete="off"></label><label>Role<select name="role">${(role === 'owner' ? ['admin', 'producer', 'operator', 'viewer', 'owner'] : ['producer', 'operator', 'viewer'])
            .map((r) => `<option>${r}</option>`)
            .join('')}</select></label><button class="btn pri">Create invite</button></form><p id="invout"></p>
      <h2>Display links</h2><p class="mut">Paste each link once: OBS Browser Source, FreeShow Website item, or any screen for Stage. Links are display-only.</p><div id="links">Loading…</div>
      <h2 id="activity">Activity</h2><p class="mut">What went on air, and changes to the team, links and brand. Times are in your organisation's time zone.</p>
      <div class="card"><div class="row" style="margin-bottom:12px"><input id="actQ" type="search" placeholder="Filter (name, graphic, action)" style="flex:1;min-width:200px"><select id="actDays" style="width:auto"><option value="1">Today</option><option value="7">7 days</option><option value="30" selected>30 days</option><option value="365">A year</option></select><a class="btn sm" id="actCsv" href="#">Download CSV</a></div><div id="actList" class="tw">Loading…</div></div>
      <h2 id="brand">Brand</h2><p class="mut">Your on-air look: colours, fonts, logos and the Bible version. Changes reach OBS, FreeShow and Stage straight away, without reloading them.</p>
      <div id="brandEd" data-org="${esc(org.slug)}"><div class="card">Loading…</div></div>`
        : ''
    }`,
    { user, script, room: 'platform', scriptSrc: ['owner', 'admin'].includes(role) ? '/assets/team.js' : undefined, css: ['owner', 'admin'].includes(role) ? ['/assets/graphics.css'] : undefined },
  );
}

export function platformPage(user: { email: string }, memberHtml = '') {
  const script = `
const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=(p,o={})=>fetch('/api/platform'+p,{...o,headers:{'content-type':'application/json'}}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok) throw new Error(j.error||r.statusText);return j});
async function load(){const d=await api('/orgs');$('#orgs').innerHTML='<div class="tw"><table><tr><th>Organisation</th><th>Members</th><th>Status</th><th></th></tr>'+d.orgs.map(o=>'<tr><td><b>'+esc(o.name)+'</b><br><span class="mono mut">/'+esc(o.slug)+' · '+esc(o.pack)+'</span></td><td>'+o.members+'</td><td><span class="pill">'+esc(o.status)+'</span></td><td><div class="row"><button class="btn sm" data-inv="'+esc(o.slug)+'">Invite owner</button><button class="btn sm" data-st="'+esc(o.slug)+'" data-to="'+(o.status==='active'?'suspended':'active')+'">'+(o.status==='active'?'Suspend':'Reactivate')+'</button><button class="btn sm danger" data-del="'+esc(o.slug)+'">Delete</button></div></td></tr>').join('')+'</table></div>'}
const slugify=v=>v.toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9\\s-]/g,'').trim().replace(/[\\s_]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,32);
const f=$('#create');let edited=false;f.slug.addEventListener('input',()=>edited=true);f.name.addEventListener('input',()=>{if(!edited) f.slug.value=slugify(f.name.value)});
f.addEventListener('submit',async e=>{e.preventDefault();const out=$('#out');out.className='';out.textContent='Creating…';const body=Object.fromEntries(new FormData(f));
 try{const j=await api('/orgs',{method:'POST',body:JSON.stringify(body)});out.className='ok';out.innerHTML='Created /'+esc(j.org.slug)+'.'+(j.inviteUrl?' Owner invite link (valid 7 days): <div class="mono" style="margin-top:6px">'+esc(j.inviteUrl)+'</div>':'');f.reset();edited=false;load()}catch(err){out.className='err';out.textContent=err.message}});
document.addEventListener('click',async e=>{const out=$('#out');
 const i=e.target.closest('[data-inv]');if(i){const email=$('#ownerEmail').value.trim();if(!email){out.className='err';out.textContent='Type the owner email in the box above the table first.';return}
  try{const j=await api('/orgs/'+i.dataset.inv+'/owner-invite',{method:'POST',body:JSON.stringify({email})});out.className='ok';out.innerHTML='Owner invite for /'+esc(i.dataset.inv)+': <div class="mono" style="margin-top:6px">'+esc(j.url)+'</div>'}catch(err){out.className='err';out.textContent=err.message}}
 const s=e.target.closest('[data-st]');if(s){await api('/orgs/'+s.dataset.st+'/status',{method:'POST',body:JSON.stringify({status:s.dataset.to})}).catch(err=>{out.className='err';out.textContent=err.message});load()}
 const d=e.target.closest('[data-del]');if(d){const typed=$('#delConfirm').value.trim();if(typed!==d.dataset.del){out.className='err';out.textContent='To delete, type '+d.dataset.del+' in the confirm box, then press Delete again.';return}
  try{await api('/orgs/'+d.dataset.del,{method:'DELETE',body:JSON.stringify({confirm:typed})});out.className='ok';out.textContent='Deleted /'+d.dataset.del;$('#delConfirm').value='';load()}catch(err){out.className='err';out.textContent=err.message}}});
load().catch(e=>{$('#orgs').textContent=e.message});`;
  return page(
    'Platform · MediaPort',
    `${memberHtml}<h2>Platform admin</h2><p class="mut">Create and manage organisations. You see names and usage only, not an organisation's content.</p>
    <h2>All organisations</h2>
    <div class="row" style="margin-bottom:10px"><label style="flex:1;min-width:220px">Owner email (for "Invite owner")<input id="ownerEmail" type="email" autocomplete="off"></label><label style="flex:1;min-width:220px">Confirm delete (type the address)<input id="delConfirm" autocomplete="off"></label></div>
    <div class="card" id="orgs">Loading…</div><p id="out" role="status"></p>
    <h2>Add an organisation</h2>
    <form class="card grid" id="create" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
      <label>Organisation name<input name="name" required></label>
      <label>Address<input name="slug" required pattern="[a-z0-9][a-z0-9-]{0,30}[a-z0-9]" title="2–32 lowercase letters, numbers or hyphens"></label>
      <label>Short name (on graphics)<input name="shortName"></label>
      <label>Location shown on air<input name="location" placeholder="Town, country"></label>
      <label>Time zone<select name="tz">${['Europe/London', 'Europe/Dublin', 'Africa/Lagos', 'Africa/Accra', 'Africa/Johannesburg', 'America/New_York', 'America/Chicago', 'America/Toronto', 'Europe/Berlin', 'Asia/Dubai'].map((z) => `<option>${z}</option>`).join('')}</select></label>
      <label>Starter pack<select name="pack"><option value="church">Church</option><option value="conference">Conference</option><option value="general">General organisation</option></select></label>
      <label>Website<input name="website" placeholder="example.org"></label>
      <label>Owner email (optional)<input name="ownerEmail" type="email"></label>
      <div style="align-self:end"><button class="btn pri" style="width:100%">Create organisation</button></div>
    </form>`,
    { user, script, room: 'platform' },
  );
}

/** Safe JSON for an inline <script type="application/json"> block. */
const bootJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const APP_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'";

/** The display page: a 1920×1080 canvas that follows the organisation's room. Transparent unless the output is set to full frame. */
export function displayPage(boot: { slug: string; output: string; key: string; profile: unknown; reduceMotion: boolean }, debug: boolean) {
  return html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MediaPort ${esc(boot.output)}</title><link rel="stylesheet" href="/assets/graphics.css">
<style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}
#cv{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;overflow:hidden;font-family:var(--f-ui)}
body.stage #cv{background:#000}
body.ff #cv{background:radial-gradient(120% 90% at 85% 0%,color-mix(in srgb,var(--bm) 45%,transparent),transparent 60%),linear-gradient(160deg,var(--bp),var(--bd))}
body.bo #cv{background:#000}body.bo #cv>*{display:none}
#dot{position:fixed;right:12px;top:12px;width:14px;height:14px;border-radius:50%;background:#f59e0b;z-index:99}#dot[data-s=on]{background:#22c55e}#dot[data-s=off]{background:#ef4444}</style></head>
<body><div id="cv">${boot.output === 'stage' ? '<div class="g stclk" data-static="1"><span data-kind="clock"></span></div>' : ''}</div>${debug ? '<div id="dot" title="connection"></div>' : ''}
<script type="application/json" id="mp-boot">${bootJson(boot)}</script><script type="module" src="/assets/display.js"></script></body></html>`,
    200,
    { 'content-security-policy': APP_CSP },
  );
}

/** The MediaPort OS control shell (brief §7.1). All data arrives over the room WebSocket after load. */
export function shellPage(boot: unknown) {
  return html(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>MediaPort</title>${headLinks()}
<link rel="stylesheet" href="/assets/graphics.css"><link rel="stylesheet" href="/assets/shell.css"></head><body>
<div class="wall" aria-hidden="true"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="dots"></div><div class="floor"></div><div class="wm">MediaPort</div></div>
<header class="menubar">
  <a class="logo" href="/" title="MediaPort home"><span class="mk" aria-hidden="true"></span><span class="grad">MediaPort</span></a>
  <nav class="site-rooms hide-sm" aria-label="Rooms"><a href="/">Home</a><a href="/control" aria-current="page">Control</a><a href="/platform">Platform</a><a href="/kits">Kits</a><a href="/help">Help</a><a href="/guidelines">Guidelines</a></nav>
  <button class="mb-btn" id="orgBtn" data-act="org-menu" aria-haspopup="true"><span id="orgName"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>
  <button class="mb-btn hide-sm" data-act="tile" title="Arrange windows"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="8" height="18" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg><span class="hide-md">Arrange</span></button>
  <div class="mb-sp"></div>
  <button class="conn" id="conn" data-act="conn" data-mode="hub"><span class="dot"></span><span id="connTxt" class="hide-sm">Connecting…</span><span id="connS" class="show-sm">…</span></button>
  <div class="mb-sp"></div>
  <div class="avs hide-md" title="People controlling now"></div>
  <button class="mb-btn" data-act="palette" title="Search (Ctrl K)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><span class="hide-md mono" style="font-size:12px;opacity:.7">Ctrl K</span></button>
  <button class="mb-btn" data-act="themes-menu" title="Theme"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/></svg></button>
  <button class="mb-btn" data-act="log" title="Activity"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg></button>
  <span class="clock hide-sm" id="clock">--:--</span>
</header>
<main class="desktop"><div class="area" id="area"></div></main>
<nav class="dock" id="dock" aria-label="Apps"></nav>
<div class="toasts" id="toasts" aria-live="polite"></div>
<script type="application/json" id="mp-boot">${bootJson(boot)}</script><script type="module" src="/assets/shell.js"></script></body></html>`,
    200,
    { 'content-security-policy': APP_CSP },
  );
}

/** Static FreeShow transparency test (brief §9): transparent background, one coloured box. No data, no connection. */
export function freeshowTestPage() {
  return html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>FreeShow transparency test</title><style>html,body{margin:0;width:1920px;height:1080px;background:transparent;overflow:hidden;font-family:system-ui,sans-serif}
.box{position:absolute;left:120px;bottom:120px;width:900px;padding:36px 44px;border-radius:24px;background:#e0337f;color:#fff;box-shadow:0 30px 60px -20px rgba(0,0,0,.6)}
.box b{display:block;font-size:56px;line-height:1.1}.box span{font-size:30px;opacity:.9}
.corner{position:absolute;right:60px;top:60px;width:160px;height:160px;border-radius:50%;background:#f7ba49}</style></head>
<body><div class="corner"></div><div class="box"><b>Transparency test</b><span>If you can see your slide behind this box, transparency works.</span></div></body></html>`,
    200,
    { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'" },
  );
}
