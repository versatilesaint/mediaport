// MediaPort OS control shell (brief §7, §7.1). Talks to the organisation's room over one WebSocket.
// All on-air changes go through the room; this page only keeps local view state (selection, windows, theme).
import {esc,TPL,T,CATS,SM,OUTS,PEOPLE,FIELDS,PACKS,PH,PHUI,fmt,tmrEl,tmrRem,tmrPhase,tmrText,brandVars,G,reconcile,listFor,tplLabel,sample,defTargets,clock,now} from '/assets/catalog.js';

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const store={get(k,d){try{const v=localStorage.getItem('mpos.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem('mpos.'+k,JSON.stringify(v))}catch(e){}}};

/* 30 shell themes: [id, name, group, bg, wall1, wall2, wall3, surface(glass), surface2, text, muted, accent, accent2] */
const THEMES=[
 ['daylight','Daylight','light','#eef2f7','#9cc3ff','#ffd3e8','#c8f2e4','rgba(255,255,255,.72)','#f6f8fb','#14202e','#5a6878','#2563eb','#db2777'],
 ['porcelain','Porcelain','light','#f3f4f6','#d5dbe6','#c7d3e6','#eceef2','rgba(255,255,255,.82)','#fafafa','#1b1d22','#61656f','#3f51b5','#00897b'],
 ['mint','Mint Studio','light','#e9f6f1','#a7e8cf','#c9f0ff','#e8f9d0','rgba(255,255,255,.75)','#f4fbf8','#0f2a22','#4b6b60','#0f8f6a','#2b7de9'],
 ['sky','Sky Glass','light','#e8f1fb','#8ec5ff','#b9e6ff','#d9d2ff','rgba(255,255,255,.70)','#f3f8fe','#0d2340','#4d6584','#0b6fd4','#7c3aed'],
 ['sakura','Sakura','light','#fbeef2','#ffc2d4','#ffe1c7','#e9d5ff','rgba(255,255,255,.74)','#fff7f9','#3a1424','#82596a','#c92a62','#8b4fd8'],
 ['citrus','Citrus','light','#fbf7e6','#ffe27a','#ffc38a','#c9f29b','rgba(255,255,255,.76)','#fffdf4','#2b2408','#6f6640','#c2410c','#15803d'],
 ['lavender','Lavender Mist','light','#f1eefb','#cdbbff','#bfd7ff','#ffd6f0','rgba(255,255,255,.72)','#f8f6fe','#231a3d','#645a80','#6d28d9','#0891b2'],
 ['arctic','Arctic','light','#edf4f7','#bfe3ee','#e0f0ff','#d4e7e1','rgba(255,255,255,.78)','#f7fbfc','#102530','#557080','#0e7490','#1d4ed8'],
 ['sandstone','Sandstone','light','#f4ede4','#f0cfa8','#e8d8c0','#cfe0d6','rgba(255,255,255,.72)','#fbf7f1','#2d2116','#75614c','#b45309','#0f766e'],
 ['purelight','Pure Light','light','#f6f3fb','#e6dcff','#fff1cc','#ffffff','rgba(255,255,255,.86)','#ffffff','#2a1458','#6b5a8e','#6b21a8','#b7790f'],
 ['photizo','Photizo Fire','dark','#0b0618','#3b1d78','#e0337f','#ff8a3d','rgba(29,18,56,.74)','#140c2a','#f4efff','#a99cc8','#f7ba49','#e0337f'],
 ['royal','Royal','dark','#07112a','#1e3a8a','#b88a1b','#0f2557','rgba(13,27,62,.74)','#0b1736','#eef2ff','#94a3c8','#e9b949','#60a5fa'],
 ['obsidian','Obsidian','dark','#0a0a0c','#26262e','#3a2f4d','#1d2a2e','rgba(22,22,26,.76)','#121215','#ececf1','#8b8b98','#a78bfa','#34d399'],
 ['neon','Neon Ring','dark','#05060f','#00b8d4','#d1008f','#3b00ff','rgba(12,14,32,.74)','#0a0c1c','#e8f6ff','#8aa0c0','#22d3ee','#f0abfc'],
 ['carbon','Carbon','dark','#111315','#2b3036','#1b2b24','#2e2a22','rgba(28,31,35,.80)','#181a1d','#e6e8ea','#8e959c','#4ade80','#fbbf24'],
 ['ocean','Deep Ocean','dark','#031420','#0b4f6c','#0189b8','#0b3954','rgba(6,32,48,.74)','#05202f','#e0f4ff','#86a9bf','#38bdf8','#2dd4bf'],
 ['ember','Ember','dark','#140806','#7c2d12','#b23a0b','#3b0d0c','rgba(36,14,10,.76)','#1c0b08','#fff1e8','#c0988a','#fb923c','#facc15'],
 ['aurora','Aurora','dark','#04120f','#0f9c6d','#5357d6','#0c8fc9','rgba(8,28,26,.72)','#071a17','#e6fff7','#8fb8ad','#34d399','#818cf8'],
 ['graphite','Graphite Mono','dark','#121212','#2a2a2a','#3a3a3a','#1f1f1f','rgba(30,30,30,.82)','#181818','#f2f2f2','#9a9a9a','#ffffff','#bdbdbd'],
 ['nebula','Nebula','dark','#0d0717','#6b1fb0','#b81f66','#1e40af','rgba(26,14,44,.74)','#140b24','#f5ecff','#a894c2','#c084fc','#f472b6'],
 ['dusk','Dusk','balanced','#4a4560','#8b6fa8','#e59c7a','#4f6d9a','rgba(66,60,88,.80)','#3d3852','#f3eefa','#c4bad6','#ffb38a','#b9a3ff'],
 ['slate','Slate','balanced','#475569','#64748b','#94a3b8','#334155','rgba(71,85,105,.82)','#3e4a5c','#f1f5f9','#c3cdd9','#7dd3fc','#fcd34d'],
 ['storm','Storm','balanced','#3d4852','#5d6d7e','#7f8c9a','#2f3a44','rgba(58,68,78,.82)','#343e48','#eef3f7','#b8c4ce','#93c5fd','#fca5a5'],
 ['olive','Olive Grove','balanced','#4a5040','#6b7a4f','#a3a36b','#3d4a35','rgba(70,76,58,.82)','#3e4434','#f4f5ea','#c9cbb4','#d9e56b','#f2a65a'],
 ['clay','Clay','balanced','#6b4f45','#a06b58','#c99a7a','#5a3f38','rgba(98,72,62,.82)','#573f37','#fbf1ec','#dcc2b6','#ffd2a8','#8fd3c7'],
 ['twilight','Twilight Steel','balanced','#3f4a63','#5f6f99','#8a7bb5','#2f3a55','rgba(60,70,98,.80)','#363f58','#eef1fb','#bcc3dc','#a5b4fc','#fbcfe8'],
 ['moss','Moss','balanced','#3c4f47','#5a7a6c','#8fb3a0','#2f423b','rgba(56,76,68,.82)','#33453e','#edf7f2','#b7cdc2','#86efac','#fde68a'],
 ['harbor','Harbor','balanced','#2f5060','#3f7a8c','#78a9b8','#24404d','rgba(46,78,94,.82)','#2a4654','#ebf7fb','#b2cdd7','#67e8f9','#fdba74'],
 ['mauve','Mauve','balanced','#5c4558','#8c6688','#c095b8','#4a3647','rgba(88,66,84,.82)','#4e3a4b','#fbf0f9','#d6bfd1','#f9a8d4','#a7f3d0'],
 ['fog','Fog','balanced','#6f7680','#9aa1ab','#b8bec6','#5c636c','rgba(88,95,105,.86)','#555c65','#ffffff','#dde1e6','#fef08a','#bfdbfe']
].map(a=>({id:a[0],name:a[1],group:a[2],bg:a[3],w1:a[4],w2:a[5],w3:a[6],surf:a[7],surf2:a[8],fg:a[9],mut:a[10],acc:a[11],acc2:a[12]}));

/* ================= Windows ================= */
const ICONS={
 program:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><circle cx="17.5" cy="7.5" r="1" fill="currentColor"/>',
 library:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 editor:'<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/>',
 order:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
 timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
 outputs:'<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
 orgs:'<path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M10 21v-5h4v5M9 11h.01M15 11h.01"/>',
 themes:'<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'
};
const ico=(k,w=1.8)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`;
const APPS={program:'Program',library:'Library',editor:'Editor',order:'Running Order',timer:'Speaker Timer',outputs:'Outputs & Links',themes:'Themes',orgs:'Organisations'};
const ZOOMS=[.8,.9,1,1.1,1.25,1.4];
const UISIZES=[['small','Small',.9,46],['standard','Standard',1,54],['large','Large',1.1,62],['xl','Extra large',1.25,70]];
let uiSize=store.get('uisize','standard');
const uiZoom=()=>(UISIZES.find(u=>u[0]===uiSize)||UISIZES[1])[2];
function applyZoom(app){const el=$(`.win[data-app="${app}"]`);if(!el) return;const z=W[app].zoom||uiZoom();$('.wb',el).style.zoom=z;const v=$('[data-zv]',el);if(v) v.textContent=Math.round(z*100)+'%';$$('.screen',el).forEach(sc=>sc.style.setProperty('--s',sc.clientWidth/1920))}
function applyUiSize(){const u=UISIZES.find(x=>x[0]===uiSize)||UISIZES[1];document.documentElement.style.setProperty('--dk',u[3]+'px');document.documentElement.style.setProperty('--dockh',(u[3]+32)+'px');Object.keys(W).forEach(applyZoom)}
const W={};let zTop=10;const area=$('#area');
const isPhone=()=>matchMedia('(max-width:760px)').matches;
function place(el,w){if(w.max){el.style.left='0px';el.style.top='0px';el.style.width='100%';el.style.height='100%'}else{el.style.left=w.x+'px';el.style.top=w.y+'px';el.style.width=w.w+'px';el.style.height=w.h+'px'}el.style.zIndex=w.z}
function openApp(app,focus=true){
  let w=W[app];
  if(!w){const A=area.getBoundingClientRect();w=W[app]={x:Math.max(0,(A.width-720)/2+Object.keys(W).length*24),y:20+Object.keys(W).length*20,w:Math.min(760,A.width),h:Math.min(560,A.height-20),z:++zTop}}
  let el=$(`.win[data-app="${app}"]`);
  if(!el){el=document.createElement('section');el.className='win';el.dataset.app=app;el.setAttribute('aria-label',APPS[app]);
    el.innerHTML=`<div class="tb"><div class="lights"><button class="c" data-act="close" aria-label="Close ${APPS[app]}"><i></i></button><button class="m" data-act="min" aria-label="Minimise"><i></i></button><button class="x" data-act="max" aria-label="Maximise"><i></i></button></div><h2>${ico(app,2)}${APPS[app]}</h2><span class="tb-sp"></span><span class="zm" title="Text size in this window"><button data-act="zoom" data-d="-1" aria-label="Smaller text">A−</button><span data-zv>100%</span><button data-act="zoom" data-d="1" aria-label="Larger text">A+</button></span></div><div class="wb"></div>${['n','s','e','w','ne','nw','se','sw'].map(d=>`<div class="rz ${d}" data-d="${d}" aria-hidden="true"></div>`).join('')}`;
    area.appendChild(el);w.open=true;RENDER[app]();applyZoom(app);}
  el.hidden=false;w.open=true;w.min=false;place(el,w);if(focus) focusWin(app);updateDock();saveLayout();
}
function focusWin(app){const w=W[app];if(!w) return;w.z=++zTop;$$('.win').forEach(e=>e.classList.toggle('focused',e.dataset.app===app));const el=$(`.win[data-app="${app}"]`);if(el){el.style.zIndex=w.z}updateDock()}
function closeApp(app){const el=$(`.win[data-app="${app}"]`);if(!el) return;el.classList.add('closing');W[app].open=false;setTimeout(()=>el.remove(),200);focusTop(app);updateDock();saveLayout()}
function minApp(app){const el=$(`.win[data-app="${app}"]`);if(!el) return;el.hidden=true;W[app].min=true;focusTop(app);updateDock()}
function focusTop(except){const vis=Object.entries(W).filter(([a,w])=>a!==except&&w.open&&!w.min).sort((a,b)=>b[1].z-a[1].z);if(vis[0]) focusWin(vis[0][0])}
function tile(){
  const A=area.getBoundingClientRect(),g=10,Wd=A.width,H=A.height;
  if(Wd<1000){const cw=(Wd-g)/2;const L={program:[0,0,Wd,H*.58],editor:[0,H*.58+g,cw,H*.42-g],order:[cw+g,H*.58+g,cw,H*.42-g],library:[Wd*.08,H*.1,Wd*.84,H*.8],timer:[Wd*.12,H*.14,Wd*.76,H*.7]};
    for(const [a,r] of Object.entries(L)) W[a]={...(W[a]||{}),x:r[0],y:r[1],w:r[2],h:r[3],z:W[a]?.z||++zTop,max:false};
    ['library','timer'].forEach(a=>{if(W[a].open) minApp(a)});['program','editor','order'].forEach(a=>openApp(a,false));focusWin('program');return}
  const lw=Math.round(Wd*.58),rw=Wd-lw-g,ph=Math.round(H*.6),bh=H-ph-g,ew=Math.round(lw*.56);
  const L={program:[0,0,lw,ph],editor:[0,ph+g,ew,bh],timer:[ew+g,ph+g,lw-ew-g,bh],library:[lw+g,0,rw,Math.round(H*.55)],order:[lw+g,Math.round(H*.55)+g,rw,H-Math.round(H*.55)-g]};
  for(const [a,r] of Object.entries(L)){W[a]={...(W[a]||{}),x:r[0],y:r[1],w:r[2],h:r[3],z:W[a]?.z||++zTop,max:false};openApp(a,false)}
  focusWin('program');
}
function saveLayout(){store.set('layout',Object.fromEntries(Object.entries(W).map(([a,w])=>[a,{x:w.x,y:w.y,w:w.w,h:w.h,open:w.open,max:!!w.max,zoom:w.zoom}])))}
function updateDock(){$$('.dk[data-app]').forEach(d=>{const w=W[d.dataset.app];d.classList.toggle('open',!!(w&&w.open))})}

/* drag + resize */
area.addEventListener('pointerdown',e=>{
  const el=e.target.closest('.win');if(!el) return;const app=el.dataset.app;focusWin(app);
  if(isPhone()||e.target.closest('button,input,select,textarea,a')) return;
  const rs=e.target.closest('.rz'),tb=e.target.closest('.tb');if(!rs&&!tb) return;
  const w=W[app];
  if(w.max){const r=el.getBoundingClientRect(),A0=area.getBoundingClientRect();w.max=false;Object.assign(w,rs?{x:0,y:0,w:A0.width,h:A0.height}:{x:Math.max(0,e.clientX-A0.left-w.w/2),y:0})}
  e.preventDefault();const sx=e.clientX,sy=e.clientY,o={...w};const A=area.getBoundingClientRect();const d=rs?rs.dataset.d:'';const MW=320,MH=200;
  el.setPointerCapture(e.pointerId);el.classList.add('resizing');
  const mv=ev=>{const dx=ev.clientX-sx,dy=ev.clientY-sy;
    if(rs){
      if(d.includes('e')) w.w=Math.max(MW,Math.min(A.width-o.x,o.w+dx));
      if(d.includes('s')) w.h=Math.max(MH,Math.min(A.height-o.y,o.h+dy));
      if(d.includes('w')){const nx=Math.max(0,Math.min(o.x+o.w-MW,o.x+dx));w.w=o.w+(o.x-nx);w.x=nx}
      if(d.includes('n')){const ny=Math.max(0,Math.min(o.y+o.h-MH,o.y+dy));w.h=o.h+(o.y-ny);w.y=ny}
    }
    else{w.x=Math.max(-w.w+140,Math.min(A.width-140,o.x+dx));w.y=Math.max(0,Math.min(A.height-44,o.y+dy))}
    place(el,w)};
  const up=()=>{el.classList.remove('resizing');el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);saveLayout()};
  el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
});
area.addEventListener('dblclick',e=>{const tb=e.target.closest('.tb');if(!tb||e.target.closest('button')) return;const app=tb.parentElement.dataset.app;W[app].max=!W[app].max;place(tb.parentElement,W[app])});

/* screen scaling */
const ro=new ResizeObserver(es=>es.forEach(en=>{const s=en.contentRect.width/1920;en.target.style.setProperty('--s',s)}));
function screenHTML(o,cls=''){return `<div class="screen ${cls}" data-screen="${o}"><div class="canvas" style="${brandVars(PROFILE)}">${o==='stage'?'<div class="g stclk" data-static="1"><span data-kind="clock"></span></div>':''}</div></div>`}
function observeScreens(root){$$('.screen',root).forEach(s=>{ro.observe(s);s.style.setProperty('--s',s.getBoundingClientRect().width/1920)})}


/* ================= Room state (from the organisation's room) ================= */
const BOOT=JSON.parse(document.getElementById('mp-boot').textContent);
const ORG=BOOT.org.slug;
let PROFILE=BOOT.profile;
const RANK={owner:5,admin:4,producer:3,operator:2,viewer:1};
const can=r=>RANK[BOOT.role]>=RANK[r];
let S={items:{},onAir:{obs:[],freeshow:[],stage:[]},ro:[],roIdx:-1,timer:{label:'',durationMs:2400000,startedAt:0,pausedAt:0,pausedTotal:0,graceMs:120000,warns:[5,2,1]},timerItem:'',
  outputs:{obs:{mode:'overlay',quality:'lite',fps:60,safe:2,blackout:false},freeshow:{mode:'overlay',quality:'lite',fps:30,safe:5,blackout:false},stage:{mode:'fullframe',quality:'lite',fps:30,safe:5,blackout:false}},log:[]};
let SEL=null,PRES={displays:{obs:0,freeshow:0,stage:0},controls:[]},LINKS=null,ONLINE=false,GOT=false;
const st=()=>S;
const isOn=(s,id)=>!!id&&OUTS.some(([o])=>(s.onAir[o]||[]).includes(id));
const newId=()=>'i'+[...crypto.getRandomValues(new Uint8Array(10))].map(b=>(b%36).toString(36)).join('');

/* ---------- Socket ---------- */
let ws=null,wait=500,pingT=0;
function connect(){
  const proto=location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(`${proto}//${location.host}/${encodeURIComponent(ORG)}/ws?role=control`);
  ws.onopen=()=>{ONLINE=true;wait=500;ping();setConn()};
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}
    if(m.type==='hello'){clock.offset=m.serverTime-Date.now()}
    else if(m.type==='pong'){const rtt=Date.now()-m.t;clock.offset=m.serverTime+rtt/2-Date.now();setConn(rtt)}
    else if(m.type==='snapshot') applySnapshot(m.state,m.profile);
    else if(m.type==='presence'){PRES=m;setConn()}
    else if(m.type==='error') toast('Not done',m.message,'var(--bad)')};
  ws.onclose=e=>{ONLINE=false;setConn();if(e.code===4001){toast('Access changed','Reload the page.','var(--amber)');return}setTimeout(connect,wait);wait=Math.min(5000,wait*2)};
}
function ping(){if(ws&&ws.readyState===1) ws.send(JSON.stringify({v:1,type:'ping',t:Date.now()}))}
setInterval(ping,15000);
function send(m){if(ws&&ws.readyState===1){ws.send(JSON.stringify({v:1,...m}));return true}toast('Not connected','Reconnecting… try again in a moment.','var(--amber)');return false}
let lastRT=0;
function setConn(rtt){const c=$('#conn');if(!c) return;const n=OUTS.reduce((a,[o])=>a+(PRES.displays?.[o]||0),0);
  c.dataset.mode=ONLINE?'online':'hub';if(rtt) lastRT=rtt;
  $('#connTxt').textContent=ONLINE?`Online · Cloud · ${n} screen${n===1?'':'s'}`:'Reconnecting…';$('#connS').textContent=ONLINE?String(n):'…';
  c.title=ONLINE?`Connected to the ${PROFILE.short} room${lastRT?` · ${lastRT} ms`:''}`:'Trying to reconnect';
  const av=$('.avs');if(av){const list=(PRES.controls||[]).slice(0,4);av.innerHTML=list.map(e=>`<span class="av" title="${esc(e)}">${esc(e.slice(0,2).toUpperCase())}</span>`).join('');av.title=(PRES.controls||[]).join(', ')}
  OUTS.forEach(([o])=>$$(`[data-lat="${o}"]`).forEach(e=>{const k=PRES.displays?.[o]||0;e.textContent=ONLINE?`${k} screen${k===1?'':'s'}${lastRT?' · '+lastRT+' ms':''}`:'offline'}))}

let sigRO='',sigTM='',sigOUT='';
function applySnapshot(state,profile){
  const first=!GOT;GOT=true;S=state;if(profile) PROFILE=profile;
  if(!SEL||!S.items[SEL]) SEL=(S.ro[S.roIdx]||S.ro[0]||{}).id||Object.keys(S.items)[0]||null;
  renderOutputs(first);refreshLive();
  const r=JSON.stringify([S.ro,S.roIdx,S.ro.map(x=>S.items[x.id]?.n)]);if(r!==sigRO){sigRO=r;renderOrder()}
  const it=S.items[SEL];
  if(first) renderEditor();
  else if(it) $$('[data-f]').forEach(i=>{if(i!==document.activeElement){const v=it.data[i.dataset.f]??'';if(String(i.value)!==String(v)) i.value=v}});
  const t=JSON.stringify([S.timer.durationMs,S.timer.graceMs,S.timer.warns,S.items[S.timerItem]?.targets,isOn(S,S.timerItem),S.timer.label]);
  if(t!==sigTM&&!$('.win[data-app="timer"]')?.contains(document.activeElement)){sigTM=t;renderTimer()}
  const o=JSON.stringify(S.outputs);if(o!==sigOUT){sigOUT=o;renderOutputsApp()}
  if(first) renderLibrary();
}

/* ---------- Program output previews ---------- */
function renderOutputs(fresh){
  const s=st();
  $$('.screen[data-screen]').forEach(sc=>{const o=sc.dataset.screen;const oc=s.outputs[o];
    sc.classList.toggle('opaque',o==='stage');sc.classList.toggle('ff',oc.mode==='fullframe'&&o!=='stage');sc.classList.toggle('bo',!!oc.blackout);
    const cv=$('.canvas',sc);cv.setAttribute('style',brandVars(PROFILE));if(fresh) cv.classList.add('noanim');
    reconcile(cv,listFor(s,o,PROFILE));if(fresh) requestAnimationFrame(()=>cv.classList.remove('noanim'))});
  OUTS.forEach(([o])=>{const n=(s.onAir[o]||[]).length;$$(`[data-cnt="${o}"]`).forEach(e=>{e.textContent=n?n+' on air':'Clear';e.className='pill'+(n?' live':'')})});
  const anyOn=OUTS.some(([o])=>(s.onAir[o]||[]).length);const pw=$('.win[data-app="program"]');if(pw) pw.classList.toggle('onair',anyOn);
  setConn();tick();
}
function refreshLive(){const s=st(),it=s.items[SEL];const cur=$('[data-cur]');
  if(cur){cur.textContent=it?tplLabel(it):'Nothing selected';const ch=$('[data-curchips]');ch.innerHTML=it?OUTS.map(([o,l])=>`<button class="chip" data-act="tgt" data-out="${o}" aria-pressed="${it.targets[o]}" ${can('producer')?'':'disabled'}>${l}</button>`).join('')+(isOn(s,it.id)?'<span class="pill live">On air</span>':'<span class="pill cue">Cued</span>'):''}
  $$('.tcard').forEach(c=>{const n=+c.dataset.tpl;const on=Object.values(s.items).some(x=>x.n===n&&isOn(s,x.id));const p=$('.on',c);if(p) p.hidden=!on;c.setAttribute('aria-current',it&&it.n===n?'true':'false')});
  const eh=$('[data-edstate]');if(eh&&it){eh.innerHTML=isOn(s,it.id)?'<span class="pill live">On air</span>':'<span class="pill cue">Cued</span>'}
  const ub=$('[data-act="update-live"]');if(ub&&it){const dirty=JSON.stringify(stripT(it.data))!==JSON.stringify(stripT(it.live));ub.hidden=!(isOn(s,it.id)&&dirty)}
  $$('[data-act="tgt"][data-out]').forEach(c=>{const y=s.items[c.dataset.item||SEL];if(y) c.setAttribute('aria-pressed',y.targets[c.dataset.out])});
  renderOrderMarks();
}
const stripT=d=>{const {target,...r}=d||{};return r};

/* ================= App renderers ================= */
const wb=app=>$(`.win[data-app="${app}"] .wb`);
const RENDER={
 program(){const b=wb('program');if(!b) return;
   b.innerHTML=`<div class="mons">${OUTS.map(([o,l],i)=>`<section class="mon ${i===0?'big':''}" data-mon="${o}"><div class="mon-h"><b>${l}</b><span class="pill" data-cnt="${o}">0</span><span class="lat" data-lat="${o}"></span>${can('operator')?`<button class="x" data-act="clear-out" data-out="${o}" title="Clear everything on ${l}">CLEAR ALL</button>`:''}</div>${screenHTML(o)}</section>`).join('')}</div>
   <div class="takebar"><div class="cur"><span class="eyebrow">Selected</span><b data-cur></b><div class="chips" style="margin-top:6px" data-curchips></div></div>
   ${can('operator')?`<button class="btn" data-act="prev" title="Previous (←)">◀ Prev</button><button class="btn" data-act="next" title="Next (→)">Next ▶</button>
   <button class="btn danger" data-act="clear" title="Hide the selected graphic (Esc)">Clear</button>
   <button class="take" data-act="take" title="Show the selected graphic (Space)">TAKE<small>Show on air</small></button>`:'<span class="note">You have view-only access.</span>'}</div>`;
   observeScreens(b);renderOutputs(true);refreshLive();},
 library(){renderLibrary()},editor(){renderEditor()},order(){renderOrder()},timer(){renderTimer()},outputs(){renderOutputsApp()},themes(){renderThemes()},orgs(){renderOrgs()}
};
let libCat=-1,libQ='';
function renderLibrary(soft){const b=wb('library');if(!b) return;
  if(soft&&$('.tgrid',b)){refreshLive();return}
  const list=TPL.filter(t=>(libCat<0||t.cat===libCat)&&(!libQ||(t.n+' '+t.name+' '+t.comp+' '+CATS[t.cat][0]).toLowerCase().includes(libQ.toLowerCase())));
  b.innerHTML=`<div class="lib"><nav class="cats" aria-label="Categories"><button data-act="cat" data-cat="-1" aria-current="${libCat<0}"><span>All templates</span><em>227</em></button>${CATS.map((c,i)=>`<button data-act="cat" data-cat="${i}" aria-current="${libCat===i}"><span>${i+1}. ${c[0]}</span><em>${c[2]-c[1]+1}</em></button>`).join('')}</nav>
  <div class="lib-main"><input class="inp" id="libq" type="search" placeholder="Search 227 templates — try “timer”, “scripture”, “#99”" value="${esc(libQ)}" aria-label="Search templates">
  <div class="muted" style="font-size:12px">${list.length} shown · tap to select${can('operator')?' · double-tap to show on air':''}</div>
  <div class="tgrid">${list.map(t=>`<button class="tcard" data-act="sel-tpl" data-tpl="${t.n}"><div class="row"><span class="sm"><i style="${SM[t.slot]}"></i></span><span class="num">#${t.n}</span><span class="pill live on" hidden>On</span></div><span class="nm">${esc(t.name)}</span><span class="meta">${t.comp} · ${t.slot}</span></button>`).join('')}</div></div></div>`;
  refreshLive();
}
function renderEditor(){const b=wb('editor');if(!b) return;const s=st(),it=s.items[SEL];
  if(!it){b.innerHTML=`<p class="muted">${GOT?'Pick a template in the Library to start editing.':'Connecting to the room…'}</p>`;return}
  const t=T(it.n),f=FIELDS[it.comp]||[],ro=!can('operator');
  const isTimer=it.comp==='timer';
  b.innerHTML=`<div class="ed"><div class="ed-h"><div style="flex:1;min-width:220px"><div class="eyebrow">#${t.n} · ${CATS[t.cat][0]} · ${t.comp}.${t.slot}</div><h3>${esc(t.name)}</h3></div><span data-edstate></span></div>
  <div class="ed-form">${isTimer?`<div class="note">This view follows the shared speaker timer. Start, pause and set time in the Speaker Timer app.</div><button class="btn" data-act="open" data-app="timer">${ico('timer')}Open Speaker Timer</button>`:''}
   ${f.map(([k,l,ty])=>`<div class="field"><label for="f-${k}">${l}</label>${ty==='ta'?`<textarea class="inp" id="f-${k}" data-f="${k}" ${ro?'readonly':''}>${esc(it.data[k])}</textarea>`:`<input class="inp" id="f-${k}" data-f="${k}" ${ty==='num'?'type="number" min="0"':''} value="${esc(it.data[k])}" ${ro?'readonly':''}>`}</div>`).join('')}
   ${it.n===149?'<label class="switch"><input type="checkbox" id="consent"> Parental consent recorded</label><div class="note warn">Children: no photos, and show a child’s name only when consent is recorded.</div>':''}
   ${ro?'':`<label class="switch"><input type="checkbox" id="livetype" ${it.liveTyping?'checked':''}> Update on air as I type</label>`}</div>
  <div class="ed-side"><div class="eyebrow">Show on</div><div class="chips">${OUTS.map(([o,l])=>`<button class="chip" data-act="tgt" data-out="${o}" aria-pressed="${it.targets[o]}" ${can('producer')?'':'disabled'}>${l}</button>`).join('')}</div>
   <div class="ed-prev"><div class="screen noanim" data-prev="1"><div class="canvas" style="${brandVars(PROFILE)}"></div></div></div>
   ${ro?'':`<div class="ed-acts"><button class="take" data-act="take" style="min-width:120px">TAKE</button><button class="btn pri" data-act="update-live" hidden>Update on air</button><button class="btn danger" data-act="clear">Clear</button>${can('producer')?'<button class="btn" data-act="ro-add">+ Running order</button>':''}</div>`}</div></div>`;
  observeScreens(b);renderPreview();refreshLive();
}
function renderPreview(){const pv=$('[data-prev] .canvas');if(!pv) return;const s=st(),it=s.items[SEL];if(!it) return;
  const fake={...it,live:{...it.data,target:it.live.target||now()+(+it.data.minutes||10)*60000}};const [cls,html]=G(fake,fake.live,'obs',0,PROFILE,s);
  const stl=(cls.split('style="')[1]||'').replace(/"$/,'');pv.innerHTML=`<div class="g ${cls.split('"')[0]}" style="${stl}">${html}</div>`;tick()}
function renderOrder(){const b=wb('order');if(!b) return;const s=st();
  b.innerHTML=`<div class="ro-h"><h3>${esc(PROFILE.svc||'Running order')}</h3><span class="pill">${s.ro.length} items</span></div>
  <ol class="ro">${s.ro.map((r,i)=>{const it=s.items[r.id];if(!it) return '';return `<li data-ro="${i}"><button data-act="ro-go" data-i="${i}" ${can('operator')?'':'disabled'}><span class="t">${esc(r.time)}</span><span class="n">${esc(T(it.n).name)}<small>#${it.n} · ${esc(r.dur)}</small></span><span data-mark></span></button></li>`}).join('')}</ol>
  ${can('operator')?`<div class="ro-nav"><button class="btn" data-act="prev">◀ Prev</button><button class="btn pri" data-act="next">Next item ▶</button></div>
  <p class="muted" style="font-size:12px;margin:10px 0 0">Keys: Space show · Esc clear · ← → move · 1–9 jump</p>`:''}`;renderOrderMarks()}
function renderOrderMarks(){const s=st();$$('.ro li').forEach(li=>{const i=+li.dataset.ro;li.classList.toggle('now',i===s.roIdx);const m=$('[data-mark]',li);if(!m) return;const id=s.ro[i]?.id;
  m.innerHTML=isOn(s,id)?'<span class="pill live">On</span>':i===s.roIdx+1?'<span class="pill cue">Next</span>':''})}
function renderTimer(){const b=wb('timer');if(!b) return;const s=st(),t=s.timer,ti=s.items[s.timerItem];const op=can('operator');
  b.innerHTML=`<div class="tm"><div class="ring" id="ring"><svg viewBox="0 0 200 200"><circle class="trk" cx="100" cy="100" r="88"/><circle class="prg" id="ringP" cx="100" cy="100" r="88" stroke-dasharray="552.9" stroke-dashoffset="0"/></svg><div class="mid"><span class="big" id="tBig">--:--</span><span class="phase" id="tPh">On time</span></div></div>
  <div class="tm-ctl"><div class="field"><label for="tName">Speaker</label><input class="inp" id="tName" value="${esc(t.label)}" list="ppl" ${op?'':'readonly'}><datalist id="ppl">${[PROFILE.lead?.[0],...PEOPLE].filter(Boolean).map(p=>`<option value="${esc(p)}">`).join('')}</datalist></div>
   ${op?`<div class="row"><button class="btn pri" data-act="tmr-start" id="tStart">Start</button><button class="btn" data-act="tmr-add" data-ms="-60000">−1 min</button><button class="btn" data-act="tmr-add" data-ms="60000">+1 min</button><button class="btn danger" data-act="tmr-reset">Reset</button></div>
   <div class="row"><span class="eyebrow" style="margin-right:4px">Length</span>${[5,10,15,20,30,45,60].map(m=>`<button class="chip plain" data-act="tmr-dur" data-m="${m}" aria-pressed="${t.durationMs===m*60000}">${m}</button>`).join('')}</div>
   <div class="row"><span class="eyebrow" style="margin-right:4px">Warnings</span>${[5,2,1].map(m=>`<button class="chip" data-act="tmr-warn" data-m="${m}" aria-pressed="${t.warns.includes(m)}">${m} min</button>`).join('')}
   <label class="eyebrow" for="tGrace" style="margin-left:6px">Grace</label><select class="inp" id="tGrace" style="width:auto;min-height:36px;padding:4px 8px">${[0,1,2,3,5,10].map(m=>`<option value="${m}" ${t.graceMs===m*60000?'selected':''}>${m?m+' min':'None'}</option>`).join('')}</select></div>
   ${ti?`<div class="row"><span class="eyebrow" style="margin-right:4px">Show on</span>${OUTS.map(([o,l])=>`<button class="chip" data-act="tgt" data-item="${s.timerItem}" data-out="${o}" aria-pressed="${ti.targets[o]}" ${can('producer')?'':'disabled'}>${l}</button>`).join('')}<button class="btn sm" data-act="tmr-show">${isOn(s,s.timerItem)?'Hide timer':'Show timer'}</button></div>`:''}`:''}
   <div class="legend"><span><i style="background:var(--ok)"></i>On time</span><span><i style="background:var(--amber)"></i>5 min</span><span><i style="background:var(--orange)"></i>2 min</span><span><i style="background:var(--bad)"></i>1 min</span><span><i style="background:var(--grace)"></i>Grace</span><span><i style="background:var(--bad)"></i>Overtime (1 Hz flash)</span></div>
  </div></div>`;tick()}
async function loadLinks(){if(!can('admin')) return;try{const r=await fetch(`/api/orgs/${encodeURIComponent(ORG)}/display-links`);if(r.ok){LINKS=(await r.json()).links;renderOutputsApp()}}catch{}}
function renderOutputsApp(){const b=wb('outputs');if(!b) return;const s=st();const adm=can('admin');
  b.innerHTML=`<p class="muted" style="margin:0 0 12px;font-size:13px">Paste each link once: OBS Browser Source (1920×1080), FreeShow Website item, or any screen for Stage. Links are display-only.</p><div class="outs">${OUTS.map(([o,l])=>{const c=s.outputs[o];return `<section class="oc"><h4>${l}${c.blackout?'<span class="pill live">Blackout</span>':''}</h4>
   <div class="kv"><span>Mode</span><div class="seg">${['overlay','fullframe'].map(m=>`<button data-act="oset" data-out="${o}" data-k="mode" data-v="${m}" aria-pressed="${c.mode===m}" ${adm?'':'disabled'}>${m==='overlay'?'Transparent':'Full frame'}</button>`).join('')}</div></div>
   <div class="kv"><span>Quality</span><div class="seg">${['auto','lite','full'].map(m=>`<button data-act="oset" data-out="${o}" data-k="quality" data-v="${m}" aria-pressed="${c.quality===m}" ${adm?'':'disabled'}>${m[0].toUpperCase()+m.slice(1)}</button>`).join('')}</div></div>
   <div class="kv"><span>Frame rate</span><div class="seg">${[30,60].map(m=>`<button data-act="oset" data-out="${o}" data-k="fps" data-v="${m}" aria-pressed="${c.fps===m}" ${adm?'':'disabled'}>${m} fps</button>`).join('')}</div></div>
   <div class="kv"><span>Safe area ${c.safe}%</span>${can('operator')?`<label class="switch"><input type="checkbox" data-act="blackout" data-out="${o}" ${c.blackout?'checked':''}> Blackout</label>`:''}</div>
   ${adm?`<div><div class="eyebrow" style="margin-bottom:4px">Display link</div><div class="link">${LINKS?esc(LINKS[o]):'Loading…'}</div></div>
   <div class="row" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-act="copy" data-out="${o}">Copy link</button><button class="btn sm danger" data-act="rotate" data-out="${o}">Rotate key</button></div>`:'<p class="muted" style="font-size:12px;margin:0">Ask an admin for display links.</p>'}</section>`}).join('')}</div>`}
function renderThemes(){const b=wb('themes');if(!b) return;const cur=store.get('theme',null)||curTheme.id;const lite=document.body.classList.contains('lite');
  const grp=(g,lbl,sub)=>`<div class="th-group"><h4>${lbl}<span>${sub}</span></h4><div class="th-grid">${THEMES.filter(t=>t.group===g).map(t=>`<button class="th" data-act="theme" data-id="${t.id}" aria-current="${cur===t.id}"><div class="pv" style="background:radial-gradient(circle at 20% 10%,${t.w1},transparent 60%),radial-gradient(circle at 90% 30%,${t.w2},transparent 55%),radial-gradient(circle at 40% 100%,${t.w3},transparent 60%),${t.bg}"><div class="w" style="background:${t.surf2}"><b style="background:${t.acc}"></b><s style="background:${t.acc2}"></s></div><div class="d" style="background:${t.surf}"></div></div><span class="nm">${t.name}</span></button>`).join('')}</div></div>`;
  b.innerHTML=`<div class="th-top"><p>Themes change the control room only. On-air graphics always use the organisation’s brand kit, so OBS, FreeShow and Stage never change colour when you switch here.</p><label class="switch"><input type="checkbox" data-act="lite" ${lite?'checked':''}> Reduce effects (for basic computers)</label></div>
  <div class="th-top"><span class="eyebrow">Interface size</span><div class="seg">${UISIZES.map(u=>`<button data-act="uisize" data-v="${u[0]}" aria-pressed="${uiSize===u[0]}">${u[1]}</button>`).join('')}</div><p>Sets text and dock size for every window. Each window can still be made larger or smaller with A− / A+ in its title bar, and resized from any edge or corner.</p></div>
  ${grp('light','Light','10 · bright rooms, daytime, projectors')}${grp('dark','Dark','10 · dim sanctuaries, broadcast desks')}${grp('balanced','Balanced','10 · mid-tone, low glare for long services')}`}

/* ================= Organisations (platform owner only) ================= */
const RESERVED=['platform','api','auth','invite','o','control','dock','hub','admin','static','assets','test','design','healthz'];
const BRANDPRE=[['Violet & gold','#1d1238','#f7ba49','#e0337f','#f4efff'],['Navy & red','#0e2a5c','#f2c14e','#d7263d','#f4f7ff'],['Forest & cream','#14342b','#e9c46a','#2a9d8f','#f6f1e7'],['Charcoal & teal','#22262e','#2dd4bf','#f472b6','#f1f5f9'],['Maroon & gold','#4a0e1c','#e0b252','#c2410c','#fff5ee'],['Royal blue','#13308a','#ffd166','#06d6a0','#f5f8ff']];
const slugify=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9\s-]/g,'').trim().replace(/[\s_]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,32);
const initials=v=>(String(v||'').match(/[A-Za-z0-9]+/g)||['?']).slice(0,2).map(w=>w[0].toUpperCase()).join('');
function hx(h){const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255]}
function mixHex(a,b,t){const A=hx(a),B=hx(b);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('')}
function contrast(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
function brandFrom(d){return {p:d.cp,d:mixHex(d.cp,'#000000',.55),a:d.ca,f:mixHex(d.ca,d.cm,.5),m:d.cm,l:d.cl}}
const blankDraft=()=>({name:'',short:'',slug:'',slugEdited:false,loc:'',tz:'Europe/London',motto:'',web:'',depts:'',leadName:'',leadTitle:'',ownerEmail:'',pack:'church',cp:'#0e2a5c',ca:'#f2c14e',cm:'#d7263d',cl:'#f4f7ff',err:{}});
let OD=blankDraft(),orgDel=null,PORGS=null,LASTINVITE=null;
async function papi(path,opts={}){const r=await fetch('/api/platform'+path,{...opts,headers:{'content-type':'application/json'}});const j=await r.json().catch(()=>({}));if(!r.ok) throw new Error(j.error||r.statusText);return j}
async function loadOrgs(){try{PORGS=(await papi('/orgs')).orgs}catch(e){PORGS=[];toast('Could not load organisations',e.message,'var(--bad)')}renderOrgs()}
function validateOrg(d){const e={};if(!d.name.trim()) e.name='Enter the organisation’s name.';
  if(!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])$/.test(d.slug)) e.slug='Use 2–32 lowercase letters, numbers or hyphens.';
  else if((PORGS||[]).some(o=>o.slug===d.slug)) e.slug='Another organisation already uses /'+d.slug+'.';
  else if(RESERVED.includes(d.slug)) e.slug='/'+d.slug+' is reserved by MediaPort.';
  if(d.web&&!/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(d.web.replace(/^https?:\/\//,''))) e.web='Enter a web address like example.org.';
  if(d.ownerEmail&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.ownerEmail)) e.ownerEmail='Enter a valid email.';
  return e}
function draftOrgObj(d){const short=d.short.trim()||d.name.trim().split(/[,(]/)[0].slice(0,24)||'New organisation';
  return {slug:d.slug||'new',name:d.name.trim()||'New organisation',short,mk:initials(short),loc:d.loc.trim(),tz:d.tz,motto:d.motto.trim(),web:d.web.trim().replace(/^https?:\/\//,''),
    depts:d.depts.split(',').map(x=>x.trim()).filter(Boolean),lead:[d.leadName.trim()||(d.pack==='church'?'Pastor':'Host'),d.leadTitle.trim()||'Add names in People'],brand:brandFrom(d),pack:d.pack}}
function renderOrgs(){const b=wb('orgs');if(!b) return;if(!BOOT.isPlatformOwner){b.innerHTML='<p class="muted">Only the platform owner can manage organisations.</p>';return}
  if(!PORGS){b.innerHTML='<p class="muted">Loading…</p>';loadOrgs();return}
  const d=OD,ratio=contrast(d.cl,d.cp),ratio2=contrast(d.ca,mixHex(d.cp,'#000000',.55));
  const row=o=>{const sus=o.status==='suspended';return `<div class="org-row ${sus?'sus':''}"><span class="sw" style="background:var(--acc);color:var(--on-acc)">${esc(initials(o.short_name||o.name))}</span>
    <div style="min-width:0"><b>${esc(o.name)} ${o.slug===ORG?'<span class="pill cue">Open</span>':''} ${sus?'<span class="pill">Suspended</span>':''}</b><small>/${esc(o.slug)} · ${o.members} member${o.members===1?'':'s'} · ${esc((PACKS[o.pack]||PACKS.church).name)}</small></div>
    <div class="acts">${orgDel===o.slug?`<input class="inp" id="delconf" placeholder="Type ${esc(o.slug)} to delete" style="width:190px;min-height:34px"><button class="btn sm danger" data-act="org-del-go" data-slug="${esc(o.slug)}">Delete for good</button><button class="btn sm" data-act="org-del-cancel">Keep</button>`:
    `${o.slug!==ORG&&!sus?`<a class="btn sm" href="/${encodeURIComponent(o.slug)}/control">Open</a>`:''}<button class="btn sm" data-act="org-invite" data-slug="${esc(o.slug)}">Invite owner</button><button class="btn sm" data-act="org-sus" data-slug="${esc(o.slug)}" data-to="${sus?'active':'suspended'}">${sus?'Reactivate':'Suspend'}</button><button class="btn sm danger" data-act="org-del" data-slug="${esc(o.slug)}">Delete</button>`}</div></div>`};
  b.innerHTML=`<div class="eyebrow" style="margin-bottom:8px">${PORGS.length} organisations · platform owner · you see names and usage, not content</div><div class="org-list">${PORGS.map(row).join('')}</div>
  <div class="field" style="margin-bottom:10px"><label for="o-invite">Owner email (for “Invite owner”)</label><input class="inp" id="o-invite" type="email" autocomplete="off"></div>
  ${LASTINVITE?`<div class="note" style="margin-bottom:14px">Invite link (valid 7 days, single use). Send it to the new owner:<div class="link" style="margin-top:6px">${esc(LASTINVITE)}</div></div>`:''}
  <h3 style="margin:0 0 4px;font:700 22px var(--f-display)">Add an organisation</h3><p class="muted" style="margin:0 0 14px;font-size:13px">It gets its own room, links, team, brand and running order. Nothing is shared with other organisations.</p>
  <div class="of">
   <div class="field full-row"><label for="o-name">Organisation name</label><input class="inp" id="o-name" data-o="name" value="${esc(d.name)}" placeholder="e.g. Grace Chapel, Leeds">${d.err.name?`<span class="err">${d.err.name}</span>`:''}</div>
   <div class="field"><label for="o-short">Short name</label><input class="inp" id="o-short" data-o="short" value="${esc(d.short)}" placeholder="Shown on graphics, e.g. Grace Chapel"></div>
   <div class="field"><label for="o-slug">Address</label><input class="inp mono" id="o-slug" data-o="slug" value="${esc(d.slug)}" placeholder="grace-chapel"><span class="muted" style="font-size:11.5px;word-break:break-all">${esc(location.host)}/<b>${esc(d.slug||'…')}</b>/control</span>${d.err.slug?`<span class="err">${d.err.slug}</span>`:''}</div>
   <div class="field"><label for="o-loc">Location shown on air</label><input class="inp" id="o-loc" data-o="loc" value="${esc(d.loc)}" placeholder="Town, country — never a street address"></div>
   <div class="field"><label for="o-tz">Time zone</label><select class="inp" id="o-tz" data-o="tz">${['Europe/London','Europe/Dublin','Africa/Lagos','Africa/Accra','Africa/Johannesburg','America/New_York','America/Chicago','America/Toronto','Europe/Berlin','Asia/Dubai'].map(z=>`<option ${d.tz===z?'selected':''}>${z}</option>`).join('')}</select></div>
   <div class="field"><label for="o-web">Website</label><input class="inp" id="o-web" data-o="web" value="${esc(d.web)}" placeholder="example.org">${d.err.web?`<span class="err">${d.err.web}</span>`:''}</div>
   <div class="field"><label for="o-motto">Motto</label><input class="inp" id="o-motto" data-o="motto" value="${esc(d.motto)}" placeholder="Optional"></div>
   <div class="field"><label for="o-lead">Lead minister or host</label><input class="inp" id="o-lead" data-o="leadName" value="${esc(d.leadName)}" placeholder="Name"></div>
   <div class="field"><label for="o-leadt">Their title</label><input class="inp" id="o-leadt" data-o="leadTitle" value="${esc(d.leadTitle)}" placeholder="e.g. Senior Pastor"></div>
   <div class="field full-row"><label for="o-depts">Departments (comma separated)</label><input class="inp" id="o-depts" data-o="depts" value="${esc(d.depts)}" placeholder="Media, Choir, Ushering"></div>
   <div class="field full-row"><label for="o-owner">Owner email (optional — creates an invite link)</label><input class="inp" id="o-owner" type="email" data-o="ownerEmail" value="${esc(d.ownerEmail)}">${d.err.ownerEmail?`<span class="err">${d.err.ownerEmail}</span>`:''}</div>
   <div class="field full-row"><label>Starter pack</label><div class="packs">${Object.entries(PACKS).map(([k,p])=>`<button data-act="org-pack" data-v="${k}" aria-pressed="${d.pack===k}"><b>${p.name}</b><small>${p.desc}</small></button>`).join('')}</div></div>
   <div class="field full-row"><label>Brand colours</label><div class="chips" style="margin-bottom:8px">${BRANDPRE.map((p,i)=>`<button class="chip plain" data-act="org-pre" data-i="${i}"><span class="sw" style="width:14px;height:14px;border-radius:4px;background:linear-gradient(135deg,${p[2]} 50%,${p[1]} 50%)"></span>${p[0]}</button>`).join('')}</div>
     <div class="colors"><label>Primary<input type="color" data-o="cp" value="${d.cp}"></label><label>Accent<input type="color" data-o="ca" value="${d.ca}"></label><label>Highlight<input type="color" data-o="cm" value="${d.cm}"></label><label>Text<input type="color" data-o="cl" value="${d.cl}"></label></div>
     <div class="note ${ratio<4.5||ratio2<3?'warn':''}" style="margin-top:8px">Text on primary: ${ratio.toFixed(1)}:1 ${ratio<4.5?'— too low, pick a lighter text or darker primary (needs 4.5:1)':'· passes'}. Accent on dark: ${ratio2.toFixed(1)}:1 ${ratio2<3?'— too low for titles':'· passes'}.</div></div>
   <div class="full-row"><div class="eyebrow" style="margin-bottom:6px">Live preview</div><div class="screen" id="orgPrev" style="max-width:560px"><div class="canvas noanim"></div></div></div>
   <div class="full-row ed-acts"><button class="btn pri" data-act="org-create">Create organisation</button><button class="btn" data-act="org-reset">Clear form</button></div>
  </div>`;
  observeScreens(b);orgPreview()}
function renderOrgsNote(){const n=$('.colors')?.nextElementSibling;if(!n) return;const d=OD,r=contrast(d.cl,d.cp),r2=contrast(d.ca,mixHex(d.cp,'#000000',.55));n.className='note'+(r<4.5||r2<3?' warn':'');
  n.textContent=`Text on primary: ${r.toFixed(1)}:1 ${r<4.5?'— too low, pick a lighter text or darker primary (needs 4.5:1)':'· passes'}. Accent on dark: ${r2.toFixed(1)}:1 ${r2<3?'— too low for titles':'· passes'}.`}
function orgPreview(){const cv=$('#orgPrev .canvas');if(!cv) return;const o=draftOrgObj(OD);cv.setAttribute('style',brandVars(o));const fake={n:33,comp:'lowerThird',slot:'lower'};
  const [cls,html]=G(fake,{name:o.lead[0],title:o.lead[1],dept:o.depts[0]||''},'obs',0,o,null);const [c2,h2]=G({n:99,comp:'logo',slot:'watermark'},{},'obs',0,o,null);
  cv.innerHTML=`<div class="g ${cls}">${html}</div><div class="g ${c2}">${h2}</div><div class="g bn" style="top:64px"><div class="lb">LOCATION</div><div class="tx">${esc(o.loc||'Location shown on air')}</div></div>`}
async function createOrg(){OD.err=validateOrg(OD);if(Object.keys(OD.err).length){renderOrgs();toast('Check the form',Object.values(OD.err)[0],'var(--bad)');return}
  const o=draftOrgObj(OD);
  try{const j=await papi('/orgs',{method:'POST',body:JSON.stringify({name:o.name,slug:o.slug,shortName:o.short,location:o.loc,tz:o.tz,pack:o.pack,website:o.web,motto:o.motto,departments:o.depts,leadName:o.lead[0],leadTitle:o.lead[1],brand:o.brand,ownerEmail:OD.ownerEmail.trim()})});
    LASTINVITE=j.inviteUrl||null;OD=blankDraft();toast('Organisation created',o.name+' · /'+o.slug,'var(--ok)');await loadOrgs()}
  catch(e){toast('Not created',e.message,'var(--bad)')}}

/* ================= Theme engine ================= */
let curTheme=THEMES[0];
function lum(hex){const n=parseInt(hex.slice(1),16);const c=[n>>16&255,n>>8&255,n&255].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]}
function applyTheme(t,save){curTheme=t;const r=document.documentElement.style;
  ['bg','w1','w2','w3','surf','surf2','fg','mut','acc','acc2'].forEach(k=>r.setProperty('--'+k,t[k]));
  r.setProperty('--on-acc',lum(t.acc)>.42?'#111318':'#ffffff');r.setProperty('color-scheme',t.group==='light'?'light':'dark');
  r.setProperty('--shadow',t.group==='light'?'0 28px 70px -24px rgba(10,14,30,.32), 0 2px 8px rgba(10,14,30,.08)':'0 28px 70px -20px rgba(0,0,0,.7), 0 2px 8px rgba(0,0,0,.3)');
  if(save) store.set('theme',t.id);$$('.th').forEach(b=>b.setAttribute('aria-current',b.dataset.id===t.id))}

/* ================= Menus, palette, toasts ================= */
function toast(title,msg,c){const el=document.createElement('div');el.className='toast';if(c) el.style.setProperty('--tc',c);el.innerHTML=`<div><b>${esc(title)}</b><span>${esc(msg)}</span></div>`;$('#toasts').appendChild(el);setTimeout(()=>{el.style.transition='opacity .3s';el.style.opacity='0';setTimeout(()=>el.remove(),300)},4200)}
function closeMenus(){$$('.menu,.scrim').forEach(m=>m.remove())}
function menuAt(btn,html){closeMenus();const r=btn.getBoundingClientRect();const m=document.createElement('div');m.className='menu';m.innerHTML=html;document.body.appendChild(m);
  const w=m.offsetWidth;m.style.top=(r.bottom+6)+'px';m.style.left=Math.max(12,Math.min(innerWidth-w-12,r.left))+'px';return m}
function openPalette(){closeMenus();const sc=document.createElement('div');sc.className='scrim';sc.innerHTML=`<div class="pal" role="dialog" aria-label="Search"><input id="palq" placeholder="Search templates, apps and themes…" autocomplete="off"><ul id="pall" role="listbox"></ul></div>`;document.body.appendChild(sc);
  const items=[...Object.entries(APPS).map(([a,l])=>({k:'App',l:'Open '+l,run:()=>openApp(a)})),...THEMES.map(t=>({k:'Theme · '+t.group,l:t.name,run:()=>applyTheme(t,true)})),...TPL.map(t=>({k:'#'+t.n,l:t.name,sub:CATS[t.cat][0],run:()=>selTpl(t.n)})),{k:'Window',l:'Arrange windows',run:tile}];
  let sel=0,res=[];const q=$('#palq'),ul=$('#pall');
  const draw=()=>{const v=q.value.toLowerCase().trim();res=items.filter(i=>!v||(i.l+' '+i.k+' '+(i.sub||'')).toLowerCase().includes(v)).slice(0,40);sel=Math.min(sel,Math.max(0,res.length-1));
    ul.innerHTML=res.map((r,i)=>`<li role="option" data-i="${i}" aria-selected="${i===sel}"><span>${esc(r.l)}${r.sub?` <span class="muted">· ${esc(r.sub)}</span>`:''}</span><span class="k">${esc(r.k)}</span></li>`).join('')||'<li class="muted">No matches</li>';const a=$('[aria-selected="true"]',ul);if(a) a.scrollIntoView({block:'nearest'})};
  q.addEventListener('input',()=>{sel=0;draw()});q.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){sel=Math.min(res.length-1,sel+1);draw();e.preventDefault()}else if(e.key==='ArrowUp'){sel=Math.max(0,sel-1);draw();e.preventDefault()}else if(e.key==='Enter'&&res[sel]){closeMenus();res[sel].run()}else if(e.key==='Escape'){closeMenus()}});
  ul.addEventListener('click',e=>{const li=e.target.closest('[data-i]');if(li){closeMenus();res[+li.dataset.i].run()}});sc.addEventListener('click',e=>{if(e.target===sc) closeMenus()});draw();q.focus()}
/** Selects a template: reuses an item already on air or in the running order, otherwise creates one in the room. */
function selTpl(n){const s=st();
  const inRo=id=>s.ro.some(r=>r.id===id)||id===s.timerItem;
  let id=Object.values(s.items).find(x=>x.n===n&&(isOn(s,x.id)||inRo(x.id)))?.id
    ||Object.values(s.items).filter(x=>x.n===n).sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.id;
  if(!id){
    if(!can('producer')){toast('Not available','Ask a producer to add this graphic.','var(--amber)');return null}
    const t=T(n);id=newId();const data=sample(t,PROFILE);
    s.items[id]={id,n,comp:t.comp,slot:t.slot,data,live:{...data},targets:defTargets(t),liveTyping:false,updatedAt:Date.now(),updatedBy:BOOT.user.email};
    send({type:'item.upsert',item:{id,n}});
  }
  SEL=id;openApp('editor',false);renderEditor();refreshLive();return id}

/* ================= Events ================= */
let typeT=0,labelT=0;
document.addEventListener('click',async e=>{
  const a=e.target.closest('[data-act]');if(!a){if(!e.target.closest('.menu')) closeMenus();return}
  if(a.disabled) return;
  const act=a.dataset.act,s=st(),it=s.items[SEL],win=a.closest('.win');
  if(a.tagName==='INPUT'&&a.type==='checkbox'&&!['lite','blackout'].includes(act)) return;
  switch(act){
    case 'close':closeApp(win.dataset.app);break;
    case 'min':minApp(win.dataset.app);break;
    case 'max':{const w=W[win.dataset.app];w.max=!w.max;place(win,w);break}
    case 'open':{const app=a.dataset.app;const w=W[app];if(w&&w.open&&!w.min&&$('.win.focused')?.dataset.app===app&&a.classList.contains('dk')){minApp(app)}else openApp(app);break}
    case 'tile':tile();break;
    case 'take':if(it) send({type:'take',itemId:it.id});break;
    case 'clear':if(it) send({type:'clear',itemId:it.id});break;
    case 'clear-out':send({type:'clearOut',output:a.dataset.out});break;
    case 'next':if(s.ro.length){SEL=s.ro[Math.min(s.ro.length-1,s.roIdx+1)]?.id||SEL;send({type:'next'});renderEditor()}break;
    case 'prev':if(s.ro.length){SEL=s.ro[Math.max(0,s.roIdx-1)]?.id||SEL;send({type:'prev'});renderEditor()}break;
    case 'ro-go':{const i=+a.dataset.i;SEL=s.ro[i]?.id||SEL;send({type:'roGo',i});renderEditor();break}
    case 'ro-add':if(it&&!s.ro.some(r=>r.id===it.id)){send({type:'ro.add',itemId:it.id});toast('Added to running order',tplLabel(it))}break;
    case 'sel-tpl':selTpl(+a.dataset.tpl);break;
    case 'cat':libCat=+a.dataset.cat;renderLibrary();break;
    case 'tgt':{const x=s.items[a.dataset.item||SEL];if(!x) break;const o=a.dataset.out;send({type:'item.upsert',item:{id:x.id,targets:{[o]:!x.targets[o]}}});break}
    case 'update-live':if(it) send({type:'updateLive',itemId:it.id});break;
    case 'tmr-start':send({type:'timer',op:'toggle'});break;
    case 'tmr-add':send({type:'timer',op:'add',value:+a.dataset.ms});break;
    case 'tmr-reset':send({type:'timer',op:'reset'});break;
    case 'tmr-dur':send({type:'timer',op:'duration',value:+a.dataset.m});break;
    case 'tmr-warn':send({type:'timer',op:'warn',value:+a.dataset.m});break;
    case 'tmr-show':send({type:isOn(s,s.timerItem)?'clear':'take',itemId:s.timerItem});break;
    case 'theme':applyTheme(THEMES.find(t=>t.id===a.dataset.id),true);break;
    case 'lite':document.body.classList.toggle('lite',a.checked);store.set('lite',a.checked);break;
    case 'oset':{const v=a.dataset.v;send({type:'output',output:a.dataset.out,key:a.dataset.k,value:isNaN(+v)?v:+v});break}
    case 'blackout':send({type:'output',output:a.dataset.out,key:'blackout',value:a.checked});break;
    case 'copy':{const txt=LINKS&&LINKS[a.dataset.out];if(!txt) break;try{await navigator.clipboard.writeText(txt);toast('Link copied','Paste it once into '+a.dataset.out+'.')}catch{toast('Copy blocked','Select the link text and copy it by hand.')}break}
    case 'rotate':{if(a.dataset.armed!=='1'){a.dataset.armed='1';a.textContent='Tap again: old link stops';setTimeout(()=>{a.dataset.armed='';a.textContent='Rotate key'},4000);break}
      const r=await fetch(`/api/orgs/${encodeURIComponent(ORG)}/display-links/${a.dataset.out}/rotate`,{method:'POST'});
      if(r.ok){toast('Key rotated','Old link for '+a.dataset.out+' stopped. Paste the new one.','var(--amber)');loadLinks()}else toast('Not rotated','Try again.','var(--bad)');break}
    case 'conn':toast(ONLINE?'Connected':'Reconnecting',ONLINE?`Live with the ${PROFILE.short} room. Changes reach every screen at once.`:'Screens keep showing the last graphics while this reconnects.',ONLINE?'var(--ok)':'var(--amber)');break;
    case 'palette':openPalette();break;
    case 'org-menu':menuAt(a,BOOT.orgs.map(o=>`<a class="mi" href="/${encodeURIComponent(o.slug)}/control" aria-current="${o.slug===ORG}"><span class="sw" style="background:var(--acc)"></span><span>${esc(o.name)}<small>/${esc(o.slug)} · ${esc(o.role)}${o.status==='suspended'?' · suspended':''}</small></span></a>`).join('')
      +`<hr><div class="muted" style="font-size:12px;padding:6px 12px">Each organisation has its own room, links, team and brand.</div>`
      +(can('admin')?`<a class="mi" href="/${encodeURIComponent(ORG)}/team"><span class="sw" style="display:grid;place-items:center;color:var(--acc)">${ico('orgs')}</span><span>Team and invites<small>${esc(PROFILE.short)}</small></span></a>`:'')
      +(BOOT.isPlatformOwner?`<button data-act="open" data-app="orgs"><span class="sw" style="display:grid;place-items:center;color:var(--acc)">${ico('orgs')}</span><span>Manage organisations<small>Platform owner</small></span></button>`:'')
      +`<hr><form method="post" action="/auth/signout" style="margin:0"><button><span class="sw"></span><span>Sign out<small>${esc(BOOT.user.email)}</small></span></button></form>`);break;
    case 'org-pack':OD.pack=a.dataset.v;renderOrgs();break;
    case 'org-pre':{const p=BRANDPRE[+a.dataset.i];Object.assign(OD,{cp:p[1],ca:p[2],cm:p[3],cl:p[4]});$$('[data-o="cp"],[data-o="ca"],[data-o="cm"],[data-o="cl"]').forEach(i=>i.value=OD[i.dataset.o]);orgPreview();renderOrgsNote();break}
    case 'org-create':createOrg();break;
    case 'org-reset':OD=blankDraft();LASTINVITE=null;renderOrgs();break;
    case 'org-invite':{const email=($('#o-invite')?.value||'').trim();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){toast('Owner email needed','Type it in the box under the list first.','var(--amber)');$('#o-invite')?.focus();break}
      try{const j=await papi('/orgs/'+encodeURIComponent(a.dataset.slug)+'/owner-invite',{method:'POST',body:JSON.stringify({email})});LASTINVITE=j.url;renderOrgs();toast('Invite created','Copy the link and send it to '+email+'.','var(--ok)')}catch(err){toast('Not created',err.message,'var(--bad)')}break}
    case 'org-sus':{try{await papi('/orgs/'+encodeURIComponent(a.dataset.slug)+'/status',{method:'POST',body:JSON.stringify({status:a.dataset.to})});toast(a.dataset.to==='suspended'?'Suspended':'Reactivated','/'+a.dataset.slug,'var(--amber)');loadOrgs()}catch(err){toast('Not changed',err.message,'var(--bad)')}break}
    case 'org-del':orgDel=a.dataset.slug;renderOrgs();$('#delconf')?.focus();break;
    case 'org-del-cancel':orgDel=null;renderOrgs();break;
    case 'org-del-go':{const sl=a.dataset.slug;const typed=($('#delconf')?.value||'').trim();if(typed!==sl){toast('Not deleted','Type '+sl+' exactly to confirm.','var(--bad)');break}
      try{await papi('/orgs/'+encodeURIComponent(sl),{method:'DELETE',body:JSON.stringify({confirm:typed})});orgDel=null;toast('Deleted','/'+sl+' and everything in it.','var(--bad)');if(sl===ORG){location.href='/';break}loadOrgs()}catch(err){toast('Not deleted',err.message,'var(--bad)')}break}
    case 'zoom':{const app=win.dataset.app,w=W[app];const cur=w.zoom||uiZoom();let i=ZOOMS.findIndex(z=>z>=cur-.001);if(i<0) i=ZOOMS.length-1;w.zoom=ZOOMS[Math.max(0,Math.min(ZOOMS.length-1,i+(+a.dataset.d)))];applyZoom(app);saveLayout();break}
    case 'uisize':{uiSize=a.dataset.v;store.set('uisize',uiSize);Object.values(W).forEach(w=>delete w.zoom);applyUiSize();saveLayout();$$('[data-act="uisize"]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.v===uiSize));break}
    case 'themes-menu':{menuAt(a,`<div class="eyebrow" style="padding:6px 12px">Quick switch</div>${['photizo','daylight','dusk','royal','purelight','slate'].map(id=>{const t=THEMES.find(x=>x.id===id);return `<button data-act="theme" data-id="${t.id}" aria-current="${curTheme.id===t.id}"><span class="sw" style="background:linear-gradient(135deg,${t.bg} 40%,${t.acc})"></span><span>${t.name}<small>${t.group}</small></span></button>`}).join('')}<hr><button data-act="open" data-app="themes">All 30 themes…</button>`);break}
    case 'log':menuAt(a,`<div class="eyebrow" style="padding:6px 12px">Activity · ${esc(PROFILE.short)}</div><div class="log">${(s.log||[]).map(l=>`<div><time>${new Date(l.t).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time>${esc(l.msg)} <span class="muted">· ${esc(l.by)}</span></div>`).join('')||'<div class="muted">Nothing yet</div>'}</div>`);break;
  }
  if(!['org-menu','themes-menu','log'].includes(act)&&!e.target.closest('.menu')) closeMenus();
  if(act==='theme'||act==='open') closeMenus();
});
document.addEventListener('dblclick',e=>{const c=e.target.closest('.tcard');if(c&&can('operator')){const id=selTpl(+c.dataset.tpl);if(id) send({type:'take',itemId:id})}});
document.addEventListener('input',e=>{const s=st(),it=s.items[SEL];
  if(e.target.dataset.o){const k=e.target.dataset.o;OD[k]=e.target.value;
    if(k==='name'&&!OD.slugEdited){OD.slug=slugify(OD.name);const sl=$('#o-slug');if(sl) sl.value=OD.slug}
    if(k==='slug'){OD.slugEdited=true;OD.slug=slugify(e.target.value)}
    const u=$('#o-slug')?.nextElementSibling;if(u) u.innerHTML=esc(location.host)+'/<b>'+esc(OD.slug||'…')+'</b>/control';
    orgPreview();renderOrgsNote();return}
  if(e.target.id==='libq'){libQ=e.target.value;const pos=e.target.selectionStart;renderLibrary();const q=$('#libq');q.focus();q.setSelectionRange(pos,pos);return}
  if(e.target.dataset.f&&it&&can('operator')){const k=e.target.dataset.f;it.data[k]=e.target.type==='number'?+e.target.value:e.target.value;renderPreview();
    if(it.liveTyping&&isOn(s,it.id)){it.live={...it.data,target:it.live.target};renderOutputs()}refreshLive();
    clearTimeout(typeT);const id=it.id,data={...it.data};typeT=setTimeout(()=>send({type:'item.upsert',item:{id,data}}),180);return}
  if(e.target.id==='tName'){clearTimeout(labelT);const v=e.target.value;labelT=setTimeout(()=>send({type:'timer',op:'label',value:v}),300)}
});
document.addEventListener('change',e=>{
  if(e.target.id==='tGrace') send({type:'timer',op:'grace',value:+e.target.value});
  if(e.target.id==='livetype'){const it=st().items[SEL];if(it) send({type:'item.upsert',item:{id:it.id,liveTyping:e.target.checked}})}
});
document.addEventListener('pointermove',e=>{const c=e.target.closest('.tcard');if(c){const r=c.getBoundingClientRect();c.style.setProperty('--mx',(e.clientX-r.left)+'px');c.style.setProperty('--my',(e.clientY-r.top)+'px')}},{passive:true});
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();return}
  if(e.target.closest('input,textarea,select')||$('.scrim')) return;
  if(!can('operator')) return;
  const s=st(),it=s.items[SEL];
  const go=i=>{if(i<0||i>=s.ro.length) return;SEL=s.ro[i].id;send({type:'roGo',i});renderEditor()};
  if(e.key===' '){e.preventDefault();if(it&&!isOn(s,it.id)) send({type:'take',itemId:it.id});else go(Math.min(s.ro.length-1,s.roIdx+1))}
  else if(e.key==='Escape'){if($('.menu')) closeMenus();else if(it) send({type:'clear',itemId:it.id})}
  else if(e.key==='ArrowRight') go(Math.min(s.ro.length-1,s.roIdx+1));
  else if(e.key==='ArrowLeft') go(Math.max(0,s.roIdx-1));
  else if(/^[1-9]$/.test(e.key)) go(+e.key-1);
});

/* dock: magnification */
if(!BOOT.isPlatformOwner) delete APPS.orgs;
const dock=$('#dock');
dock.innerHTML=Object.entries(APPS).map(([a,l],i)=>(i===5?'<span class="sep"></span>':'')+`<button class="dk" data-act="open" data-app="${a}" aria-label="${l}">${ico(a)}<span class="tip">${l}</span><span class="run"></span></button>`).join('')+`<span class="sep"></span><button class="dk" data-act="palette" aria-label="Search">${ico('search')}<span class="tip">Search · Ctrl K</span></button>`;
dock.addEventListener('pointermove',e=>{if(isPhone()||document.body.classList.contains('lite')||matchMedia('(prefers-reduced-motion: reduce)').matches) return;$$('.dk',dock).forEach(d=>{const r=d.getBoundingClientRect();const dist=Math.abs(e.clientX-(r.left+r.width/2));const s=1+Math.max(0,.5*(1-dist/150));d.style.transform=`scale(${s.toFixed(3)}) translateY(${(-(s-1)*14).toFixed(1)}px)`})});
dock.addEventListener('pointerleave',()=>$$('.dk',dock).forEach(d=>d.style.transform=''));

/* ================= Tick ================= */
// Timer warnings are worked out on every control from the shared server-time timer, so each fires once per crossing.
let prevRem=null,prevRun=false;
function warnCheck(t){const running=!!t.startedAt&&!t.pausedAt;const r=tmrRem(t);
  if(running&&prevRun&&prevRem!==null){
    for(const m of t.warns){const th=m*60000;if(prevRem>th&&r<=th&&r>0) toast(t.label||'Speaker timer',m+' minute'+(m>1?'s':'')+' left',PHUI['warn'+m])}
    if(prevRem>0&&r<=0) toast(t.label||'Speaker timer','Time is up'+(t.graceMs?' — grace '+fmt(t.graceMs)+' begins':''),PHUI.grace);
    if(prevRem>-t.graceMs&&r<=-t.graceMs&&t.graceMs>=0&&prevRem<=0) toast(t.label||'Speaker timer','Overtime',PHUI.overtime);
  }
  prevRem=r;prevRun=running}
function tick(){
  const nowT=now();const ck=new Date(nowT).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  $('#clock').textContent=new Date(nowT).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})+'  '+ck.slice(0,5);
  $$('[data-kind="clock"]').forEach(e=>e.textContent=ck);
  $$('[data-kind="cd"]').forEach(e=>{const r=+e.dataset.t-nowT;e.textContent=r>0?fmt(r):'Starting'});
  const s=st(),t=s.timer;if(!t) return;warnCheck(t);
  const ph=tmrPhase(t),pc=PH[ph][1],used=Math.min(1,tmrEl(t)/t.durationMs);
  $$('[data-kind="timer"]').forEach(e=>e.textContent=tmrText(t,!!e.dataset.short));
  $$('[data-kind="tph"]').forEach(e=>e.textContent=PH[ph][0]);
  $$('.tphase').forEach(e=>{e.dataset.phase=ph;e.style.setProperty('--pc',pc)});
  $$('.tms .bar i').forEach(e=>e.style.width=(used*100)+'%');
  const big=$('#tBig');if(big){const ring=$('#ring'),ui=PHUI[ph];big.textContent=tmrText(t);ring.dataset.phase=ph;ring.style.setProperty('--pc',ui);$('#tPh').textContent=PH[ph][0];$('#tPh').style.setProperty('--pc',ui);
    const rem=tmrRem(t);$('#ringP').style.strokeDashoffset=String(552.9*(1-Math.max(0,Math.min(1,rem/t.durationMs))));const sb=$('#tStart');if(sb) sb.textContent=!t.startedAt?'Start':t.pausedAt?'Resume':'Pause'}
}

/* ================= Boot ================= */
$('#orgName').textContent=PROFILE.short;
document.title=PROFILE.short+' · MediaPort';
applyUiSize();
(function(){let id=store.get('theme',null);let t=THEMES.find(x=>x.id===id);
  if(!t){const dt=document.documentElement.dataset.theme;const dark=dt?dt==='dark':matchMedia('(prefers-color-scheme: dark)').matches;t=THEMES.find(x=>x.id===(dark?'photizo':'daylight'))}
  applyTheme(t,false);if(store.get('lite',false)) document.body.classList.add('lite')})();
const saved=store.get('layout',null);
if(saved&&!isPhone()&&Object.values(saved).some(w=>w.open)){Object.entries(saved).forEach(([a,w])=>{if(!APPS[a]) return;W[a]={...w,z:++zTop,open:false};if(w.open) openApp(a,false)});focusTop()}
else{tile();if(isPhone()) focusWin('program')}
setInterval(tick,250);tick();
addEventListener('resize',()=>{clearTimeout(window.__rz);window.__rz=setTimeout(()=>{if(!isPhone()){const A=area.getBoundingClientRect();Object.entries(W).forEach(([a,w])=>{if(w.x+120>A.width||w.y+44>A.height){tile()}})}},200)});
loadLinks();
connect();
