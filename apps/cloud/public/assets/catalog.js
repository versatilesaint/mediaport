// MediaPort template catalogue and broadcast renderer.
// One source for the control shell previews, the display outputs (OBS, FreeShow, Stage) and the Worker's room seeding.
// Pure data and string functions only at module level, so the Worker can import it too.
import qrcode from './vendor/qrcode.js';

export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Clock synchronised with the room: every screen adds the same server offset (brief §5.2: server time, not screen time). */
export const clock={offset:0};
export const now=()=>Date.now()+clock.offset;

export const CATS=[['Worship and praise',1,15],['Scripture and Bible study',16,30],['Sermon and preaching',31,45],['Speakers and ministers',46,57],['Announcements',58,75],['Camera overlays',76,93],['Live broadcast',94,108],['Countdowns and timers',109,120],['Offering and giving',121,130],['Welcome and opening',131,141],['Testimony and ministration',142,153],['Transitions and sections',154,164],['Backgrounds and motion',165,180],['Special overlays',181,195],['Stage display',196,205],['Branding and identity',206,217],['Speaker timers',218,227]];
/* The owner's 227 templates. "Name|component|slot" — a line with only a name inherits the line above. Slots: L lower F fullscreen B background R frame G badge N banner T ticker A bar W watermark X transition */
const RAW=`Worship Lyrics – Lower Third|lyrics|L
Worship Lyrics – Full Screen|lyrics|F
Praise Lyrics – Lower Third|lyrics|L
Hymn Display|lyrics|F
Responsive Lyrics
Choir Ministration|card|F
Solo Ministration
Worship Leader Name|lowerThird|L
Choir Name Identification
Song Title Overlay|title|L
Song Artist / Minister ID|lowerThird|L
Instrumental Worship Background|background|B
Lyrics – Word-by-Word Highlight|lyrics|L
Lyrics – Two-Line
Lyrics – Three-Line
Bible Verse – Lower Third|scripture|L
Bible Verse – Full Screen|scripture|F
Scripture Reference Overlay|scripture|L
Scripture Reading|scripture|F
Bible Passage
Multiple Bible Verses
Bible Study Teaching|points|F
Bible Study Topic Header|title|L
Bible Chapter Display|scripture|F
Bible Verse Highlight
Scripture – Split Screen
Scripture – Side-by-Side
Scripture – Scrolling
Scripture – Word Highlight
Daily Bible Reading|card|F
Sermon Title|title|L
Sermon Subtitle
Preacher ID – Lower Third|lowerThird|L
Preacher ID – Full Screen|card|F
Sermon Points|points|F
Sermon Outline
Key Points Overlay|points|L
Main Teaching Points|points|F
Bible Reference Overlay|scripture|L
Important Quote|quote|L
Teaching Notes|points|F
Sermon Series|title|F
Sermon Summary|points|F
Altar Call|card|F
Prayer Points|points|F
Pastor|lowerThird|L
Guest Minister
Guest Speaker
Assistant Pastor
Worship Leader
Host / MC
Moderator
Panelist
Interview Guest
Testimony Speaker
Minister Title and Department
Name and Position
Announcement|card|F
Weekly Activities
Upcoming Events
Special Programme
Conference
Revival Programme
Prayer Meeting
Bible Study
Sunday School
Youth Service
Workers' Meeting
Registration
Contact Information
Social Media
Website Promotion
Giving / Offering Info
QR Code Announcement
Important Notice Overlay|banner|N
Full Camera Frame|frame|R
Camera Lower Third|lowerThird|L
Camera Name Strap
Camera Location ID
Picture-in-Picture|frame|R
Dual Camera
Triple Camera
Split-Screen Camera
Vertical Camera
Portrait Video
Camera + Scripture
Camera + Lyrics
Camera + Presentation
Interview Camera
Guest Video Call
Live Camera Border
Transparent Camera Frame
Multi-Camera ID
LIVE Badge|badge|G
LIVE NOW Overlay
On-Air Indicator
Broadcast Status
Live Streaming Frame|frame|R
Church Logo Watermark|logo|W
Channel Branding|bar|A
Broadcast Header
Broadcast Footer
Streaming Information Bar
YouTube Channel ID|badge|G
Facebook Live ID
Online Service Indicator
Live Service Title Bar|bar|A
Copyright Information
Service Countdown|countdown|L
Pre-Service Countdown|countdown|F
Event Countdown|countdown|L
Worship Countdown
Prayer Countdown
Conference Countdown|countdown|F
Break Countdown|countdown|L
Speaker Time Countdown|timer|G
Sermon Timer
Session Timer
Clock|clock|G
Programme Schedule Timer|timer|G
Offering Announcement|card|F
Tithes and Offering
Bank Details Overlay|lowerThird|L
Church Account Information|card|F
Online Giving
QR Code Giving|badge|G
Giving Instructions|card|F
Donation Appeal
Thanksgiving Offering
Project Support
Welcome to Church|card|F
Welcome to Sunday Service
Welcome to Online Worship
Opening Prayer
Opening Worship
Service Theme|title|F
Theme of the Month
Welcome Guest|lowerThird|L
Service Programme Outline|card|F
Vision and Mission
Church Identity
Testimony Introduction
Testimony Speaker Lower Third|lowerThird|L
Testimony Video Frame|frame|R
Special Ministration Intro|card|F
Special Guest Intro
Thanksgiving Service
Dedication Service
Baby Dedication
Anniversary
Birthday
Memorial Service
Divine Remembrance
Worship → Word|transition|X
Prayer Session
Scripture Reading
Sermon Introduction
Offering
Announcement
Testimony
Guest Minister
Service Closing
Intermission|card|F
Coming Up Next
Animated Worship|background|B
Abstract Motion
Particles
Light Rays
Golden Dust
Blue Gradient
Church Auditorium
Bible-Themed
Cross
Clouds and Heaven
Fire
Water and Ocean
Nature
Cinematic
Looping Video
Transparent Animated
Breaking-News Style|banner|N
Important Information
Emergency Notice
Guest Welcome
Next Programme
Now Playing|bar|A
Upcoming Programme|banner|N
Social Follow
Subscribe and Like
YouTube Notification
Scrolling News Ticker|ticker|T
Contact Us|banner|N
Website URL
WhatsApp Contact
Prayer Request Info
Current Slide|stage|F
Next Slide
Speaker Notes
Current Scripture
Next Scripture
Countdown
Clock
Service Schedule
Song Chords
Presenter Notes
Logo Animation|logo|X
Logo Watermark|logo|W
Church Name Lower Third|lowerThird|L
Theme Banner|banner|N
Ministry Department ID|badge|G
Location Banner|banner|N
Vision Statement|card|F
Motto Overlay|bar|A
Branded Scripture Frame|scripture|F
Branded Worship Frame|lyrics|F
Branded Announcement Frame|card|F
Branded Broadcast Border|frame|R
Preacher Countdown Timer|timer|G
Guest Minister Speaking Timer
Sermon Time Limit Timer
Presentation Countdown
Speaker Time Remaining
5-Minute Warning Timer
2-Minute Warning Timer
1-Minute Warning Timer
Overtime Warning Timer
Speaker Grace Period Timer`;
export const SLOTN={L:'lower',F:'fullscreen',B:'background',R:'frame',G:'badge',N:'banner',T:'ticker',A:'bar',W:'watermark',X:'transition'};
export const SLOTZ={background:0,frame:10,fullscreen:20,lower:30,banner:40,ticker:45,bar:46,badge:50,watermark:55,transition:60};
export const TPL=[];{let c='',s='';RAW.split('\n').forEach((ln,i)=>{const p=ln.split('|');if(p.length>1){c=p[1];s=p[2]}const n=i+1;const cat=CATS.findIndex(x=>n>=x[1]&&n<=x[2]);TPL.push({n,name:p[0],comp:c,slot:SLOTN[s],cat})})}
export const T=n=>TPL[n-1];
export const SM={lower:'left:8%;bottom:12%;width:52%;height:17%',fullscreen:'inset:10%',background:'inset:0;opacity:.45',frame:'inset:0;background:transparent;border:2px solid var(--acc)',badge:'top:9%;right:6%;width:18%;height:14%',banner:'top:12%;left:0;right:0;height:13%',ticker:'bottom:0;left:0;right:0;height:13%',bar:'bottom:6%;left:5%;right:5%;height:10%',watermark:'bottom:9%;right:6%;width:13%;height:22%;border-radius:50%',transition:'left:32%;top:-10%;width:30%;height:120%;transform:skewX(-18deg)'};


export const OUTS=[['obs','OBS'],['freeshow','FreeShow'],['stage','Stage']];
export const PEOPLE=['Rev. Grace Mensah','Minister David Cole','Sis. Funmi Adeyemi','Bro. Samuel Kingsley','Dcn. Ruth Oladele'];
export const JN316='For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';

export function sample(t,org){
  const nm=t.name;
  switch(t.comp){
    case 'lowerThird':{
      if(/Pastor|Preacher|Church Name/.test(nm)&&!/Assistant/.test(nm)) return /Church Name/.test(nm)?{name:org.name,title:org.loc,dept:''}:{name:org.lead[0],title:org.lead[1],dept:org.depts[0]||''};
      if(/Bank/.test(nm)) return {name:'Give by bank transfer',title:'Account details come from Settings → Giving',dept:''};
      if(/Location/.test(nm)) return {name:'Main Auditorium',title:org.loc,dept:''};
      if(/Choir/.test(nm)) return {name:org.short+' Mass Choir',title:'Ministering in song',dept:''};
      const role=nm.replace(/ – .*| Name| Lower Third| Identification| ID$/g,'');
      return {name:PEOPLE[t.n%PEOPLE.length],title:role,dept:org.depts[(t.n)%Math.max(1,org.depts.length)]||''};
    }
    case 'lyrics':return {song:'Amazing Grace · John Newton (public domain)',line1:'Amazing grace! how sweet the sound,',line2:'That saved a wretch like me!',line3:'I once was lost, but now am found,'};
    case 'scripture':return {ref:'John 3:16',tr:'KJV',text:JN316,reader:'Sis. Funmi Adeyemi'};
    case 'title':return /Song/.test(nm)?{kicker:'Now singing',title:'Amazing Grace',sub:'John Newton'}:/Theme/.test(nm)?{kicker:nm,title:'Arise and Shine',sub:'Isaiah 60:1'}:{kicker:/Topic/.test(nm)?'Bible study':'Sermon',title:'Light for the Nations',sub:'Walking in the light · Part 3'};
    case 'points':return {heading:/Prayer/.test(nm)?'Prayer points':'Three marks of a light-bearer',points:'Shine where you stand\nCarry the Word daily\nStay connected to the source',reveal:3};
    case 'quote':return {text:'Ye are the light of the world. A city that is set on an hill cannot be hid.',by:'Matthew 5:14 (KJV)'};
    case 'card':{
      if(/Contact|Website/.test(nm)) return {kicker:'Stay connected',heading:org.web,body:'Find service times, livestreams and ways to get involved.',when:''};
      if(/Giving|Offering|Tithes|Account|Appeal|Project/.test(nm)) return {kicker:'Giving',heading:nm,body:'Give online, by bank transfer or with the QR code. Details come from your organisation settings.',when:''};
      if(/Baby Dedication/.test(nm)) return {kicker:'Dedication',heading:'Baby Dedication',body:'The child’s name stays hidden until “parental consent recorded” is ticked.',when:''};
      if(/Memorial|Remembrance/.test(nm)) return {kicker:'In loving memory',heading:'A life well lived',body:'Psalm 23:1 — The LORD is my shepherd; I shall not want.',when:''};
      if(/Welcome/.test(nm)) return {kicker:org.short,heading:'Welcome home',body:'We’re glad you’re here, in the room and online.',when:org.svc+' · 10:00'};
      if(/Vision|Identity/.test(nm)) return {kicker:'Our vision',heading:org.motto||'Add your vision statement in Settings',body:org.name,when:''};
      return {kicker:org.short,heading:nm,body:'Edit this card in the Editor. Fields, dates and QR codes all come from here.',when:'Wednesday · 19:00'};
    }
    case 'banner':{const lb=/Emergency/.test(nm)?'EMERGENCY':/Breaking/.test(nm)?'BREAKING':/Follow|Subscribe|YouTube/.test(nm)?'FOLLOW':/WhatsApp|Contact|Prayer/.test(nm)?'CONTACT':/Location/.test(nm)?'LOCATION':'INFO';
      return {label:lb,text:/Location/.test(nm)?org.loc:/Emergency/.test(nm)?'Please follow the stewards to the nearest exit.':/Website/.test(nm)?org.web:/Theme/.test(nm)?'Theme of the month: Arise and Shine':'Midweek service moves to 19:30 this Wednesday.'};}
    case 'ticker':return {label:'NEWS',text:'Midweek service Wednesday 19:00  •  Youth night Friday 18:30  •  Prayer line open daily  •  More at '+org.web};
    case 'bar':return {left:/Motto/.test(nm)?(org.motto||'Add your motto in Settings'):/Copyright/.test(nm)?'Amazing Grace — Public domain':/Now Playing/.test(nm)?'Now playing · Amazing Grace':org.name,right:/Copyright/.test(nm)?'CCLI licence: set in Settings':org.loc};
    case 'badge':return {label:/LIVE NOW/.test(nm)?'LIVE NOW':/LIVE/.test(nm)?'LIVE':/On-Air/.test(nm)?'ON AIR':/Status/.test(nm)?'Starting soon':/YouTube/.test(nm)?'YouTube':/Facebook/.test(nm)?'Facebook':/Online/.test(nm)?'Online service':/QR/.test(nm)?'Scan to give':/Department/.test(nm)?(org.depts[1]||'Department'):'Badge'};
    case 'countdown':return {label:/Pre-Service|Service/.test(nm)?'Service starts in':nm.replace(' Countdown','')+' in',minutes:/Conference/.test(nm)?90:10};
    case 'timer':return {label:'Speaker timer'};
    case 'clock':return {};
    case 'frame':return {label:/Interview/.test(nm)?'Interview':/Guest Video/.test(nm)?'Guest on call':'Main camera'};
    case 'background':return {caption:/Instrumental/.test(nm)?'Instrumental':''};
    case 'transition':return {title:nm};
    case 'stage':return {current:'Amazing grace! how sweet the sound,',next:'That saved a wretch like me!'};
    case 'logo':return {};
  }
  return {};
}
export function defTargets(t){
  if(t.cat===14||t.cat===16||[116,117,118,120].includes(t.n)||t.comp==='stage') return {obs:false,freeshow:false,stage:true};
  if(t.comp==='frame'||t.comp==='logo'&&t.slot==='watermark') return {obs:true,freeshow:false,stage:false};
  if(t.comp==='scripture'||t.comp==='lyrics') return {obs:true,freeshow:true,stage:true};
  return {obs:true,freeshow:true,stage:false};
}
export const FIELDS={
 lowerThird:[['name','Name'],['title','Title or role'],['dept','Department']],
 lyrics:[['song','Song'],['line1','Line 1'],['line2','Line 2'],['line3','Line 3 (three-line layouts)']],
 scripture:[['ref','Reference'],['tr','Translation'],['text','Verse text','ta']],
 title:[['kicker','Small heading'],['title','Title'],['sub','Subtitle']],
 points:[['heading','Heading'],['points','Points (one per line)','ta'],['reveal','Show how many','num']],
 quote:[['text','Quote','ta'],['by','Attribution']],
 card:[['kicker','Small heading'],['heading','Heading'],['body','Body','ta'],['when','When / where'],['link','QR code link (giving and registration cards)']],
 banner:[['label','Label'],['text','Text']],
 ticker:[['label','Label'],['text','Items (separate with •)','ta']],
 bar:[['left','Left'],['right','Right']],
 badge:[['label','Label']],
 countdown:[['label','Label'],['minutes','Minutes from Take','num']],
 timer:[['label','Label']],clock:[],frame:[['label','Camera label']],background:[['caption','Caption (optional)']],
 transition:[['title','Title']],stage:[['current','Current'],['next','Next']],logo:[]
};


export const PACKS={
 church:{name:'Church',desc:'Services, worship, Scripture, giving',svc:'Sunday Service',plan:[[110,'10:00','15m'],[1,'10:15','25m'],[132,'10:40','5m'],[16,'10:45','5m'],[33,'10:50','1m'],[31,'10:51','2m'],[222,'10:53','40m'],[121,'11:35','10m'],[58,'11:45','8m'],[162,'11:53','1m']],cur:4},
 conference:{name:'Conference',desc:'Sessions, speakers, panels, breaks',svc:'Conference · Day 1',plan:[[114,'09:00','30m'],[51,'09:30','5m'],[31,'09:35','2m'],[48,'09:37','1m'],[218,'09:38','40m'],[53,'10:20','1m'],[163,'10:50','20m'],[191,'11:10','—'],[58,'11:15','5m'],[162,'11:20','1m']],cur:3},
 general:{name:'General organisation',desc:'Talks, announcements, timers',svc:'Main Event',plan:[[110,'18:00','15m'],[51,'18:15','5m'],[57,'18:20','1m'],[221,'18:21','20m'],[40,'18:41','2m'],[58,'18:45','5m'],[191,'18:50','—'],[102,'18:50','—']],cur:2}
};

export const MULTI={badge:3,banner:2};

export const tplLabel=it=>it?('#'+it.n+' '+T(it.n).name):'';

export const tmrEl=t=>t.startedAt?((t.pausedAt||now())-t.startedAt-t.pausedTotal):0;
export const tmrRem=t=>t.durationMs-tmrEl(t);
export function tmrPhase(t){if(!t.startedAt) return 'ready';const r=tmrRem(t);if(r<=0) return r>-t.graceMs?'grace':'overtime';const w=[...t.warns].sort((a,b)=>a-b);for(const m of w) if(r<=m*60000) return 'warn'+m;return 'running'}
export const PH={ready:['Ready','var(--bl)'],running:['On time','var(--bl)'],warn5:['5 minutes','#f59e0b'],warn2:['2 minutes','#f97316'],warn1:['1 minute','#ef4444'],grace:['Grace','#8b5cf6'],overtime:['Overtime','#ef4444']};
export const PHUI={ready:'var(--acc)',running:'var(--ok)',warn5:'var(--amber)',warn2:'var(--orange)',warn1:'var(--bad)',grace:'var(--grace)',overtime:'var(--bad)'};
export const fmt=ms=>{const s=Math.max(0,Math.ceil(ms/1000));const m=Math.floor(s/60);return m+':'+String(s%60).padStart(2,'0')};
export const fmtUp=ms=>{const s=Math.max(0,Math.floor(ms/1000));const m=Math.floor(s/60);return String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
export function tmrText(t,short){const r=tmrRem(t),p=tmrPhase(t);if(p==='grace') return 'Grace '+fmt(t.graceMs+r);if(p==='overtime') return '+'+fmtUp(-r)+(short?'':' over');return fmt(r)+(short?' left':'')}

const FONT={Arial:'Arial,Helvetica,sans-serif','Arial Black':'"Arial Black",Arial,sans-serif',Georgia:'Georgia,"Times New Roman",serif',Inter:'Inter,system-ui,sans-serif',Outfit:'Outfit,system-ui,sans-serif',Fraunces:'Fraunces,Georgia,serif',Verdana:'Verdana,Geneva,sans-serif','Trebuchet MS':'"Trebuchet MS",Helvetica,sans-serif'};
/** Brand Profile → CSS custom properties for a graphics canvas (colours, and fonts when the organisation chose them). */
export function brandVars(org){const b=org.brand;let v=`--bp:${b.p};--bd:${b.d};--ba:${b.a};--bf:${b.f};--bm:${b.m};--bl:${b.l}`;
  if(b.sl) v+=`;--bs:${b.sl};--bt:${b.tl};--blv:${b.lv}`;
  const f=org.kit&&org.kit.fonts;if(f){if(FONT[f.heading]) v+=`;--f-display:${FONT[f.heading]}`;if(FONT[f.body]) v+=`;--f-ui:${FONT[f.body]}`;v+=`;--f-scripture:${FONT[f.scripture]||'var(--f-ui)'}`}
  return v}
/** Look and motion classes for a graphics canvas (sober theme, reduced motion). */
export function brandClass(org){const k=org&&org.kit;return [k&&k.theme==='sober'?'sober':'',k&&k.motion==='reduced'?'reduce-motion':''].filter(Boolean).join(' ')}
/** The organisation's logo for a dark (default) or light background, or '' when none is uploaded. */
export function logoUrl(org,kind='mark',bg='dark'){const l=org&&org.kit&&org.kit.logos||{};const want=kind+'_'+(bg==='dark'?'light':'dark');return l[want]||l[kind+'_light']||l[(kind==='mark'?'full':'mark')+'_light']||''}
/** A real, scannable QR code as SVG (dark modules on white, with the quiet zone). '' when there's no text. */
export function qrSvg(text,size=220){if(!text) return '';const q=qrcode(0,'M');q.addData(String(text).slice(0,600));q.make();const n=q.getModuleCount(),m=n+8;let d='';for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c))d+=`M${c+4} ${r+4}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${m} ${m}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${m}" height="${m}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`}
/** The link a giving / registration card's QR code points to: the card's own link, else the organisation website. */
export const qrLink=(d,org)=>{const l=String(d.link||'').trim()||(org&&org.web?String(org.web):'');if(!l) return '';return /^https?:\/\//i.test(l)?l:'https://'+l.replace(/^\/+/,'')}
export function G(it,d,out,idx,org,st){
  const t=T(it.n),c=it.comp,full=it.slot==='fullscreen';
  const sw='<div class="sweep"></div>';
  switch(c){
    case 'lowerThird': return ['lt',`<div class="slab"><div class="mk">${logoUrl(org)?`<img src="${esc(logoUrl(org))}" alt="">`:esc(org.mk)}</div><div class="tx">${sw}<div class="nm ts">${esc(d.name)}</div><div class="ti">${esc(d.title)}</div>${d.dept?`<div class="dp">${esc(d.dept)}</div>`:''}</div></div>`];
    case 'lyrics': if(full) return ['full',`<div class="kk">${esc(t.n===4?'Hymn · Stanza 1':d.song)}</div><div class="verse" style="text-align:center;align-self:center">${esc(d.line1)}<br>${esc(d.line2)}</div>`];
      return ['lyl',`<div class="box">${sw}<p class="hi">${esc(d.line1)}</p><p>${esc(d.line2)}</p>${t.n===15?`<p>${esc(d.line3)}</p>`:''}</div>`];
    case 'scripture': if(full) return ['full',`<div class="kk">${esc(d.ref)} · ${esc(d.tr)}${t.n===19&&d.reader?' · Read by '+esc(d.reader):''}</div><div class="verse">${esc(d.text)}</div>`];
      if(t.n===18||t.n===39) return ['scl" style="right:auto',`<div class="box">${sw}<div class="rf" style="font-size:40px">${esc(d.ref)}</div></div>`];
      return ['scl',`<div class="box">${sw}<div class="rf">${esc(d.ref)} · ${esc(d.tr)}</div><div class="vt ts" style="font-family:var(--f-scripture,inherit)">${esc(d.text)}</div></div>`];
    case 'title': if(full) return ['full',`<div class="kk">${esc(d.kicker)}</div><h1>${esc(d.title)}</h1><div class="bd">${esc(d.sub)}</div>`];
      return ['ttl',`<div class="box">${sw}<div class="kk">${esc(d.kicker)}</div><h2>${esc(d.title)}</h2>${d.sub?`<div class="sb">${esc(d.sub)}</div>`:''}</div>`];
    case 'points':{const ps=String(d.points||'').split('\n').filter(Boolean);const rv=+d.reveal||ps.length;
      if(!full) return ['ttl',`<div class="box">${sw}<div class="kk">Key point ${Math.min(rv,ps.length)}</div><h2>${esc(ps[Math.min(rv,ps.length)-1]||'')}</h2></div>`];
      return ['full',`<div class="kk">${esc(t.name)}</div><h1 style="font-size:84px">${esc(d.heading)}</h1><ol>${ps.map((p,i)=>`<li class="${i>=rv?'dim':''}">${esc(p)}</li>`).join('')}</ol>`];}
    case 'quote': return ['ttl" style="right:110px',`<div class="box">${sw}<h2 style="font-size:52px;font-style:italic">“${esc(d.text)}”</h2><div class="sb">${esc(d.by)}</div></div>`];
    case 'card':{const sober=/Memorial|Remembrance/.test(t.name);const q=/QR|Registration|Giving|Online Giving/.test(t.name);
      return ['full'+(sober?' sober':''),`<div class="kk">${esc(d.kicker)}</div><h1>${esc(d.heading)}</h1>${d.body?`<div class="bd">${esc(d.body)}</div>`:''}${d.when?`<div class="wh">${esc(d.when)}</div>`:''}${q&&qrLink(d,org)?`<div style="position:absolute;right:170px;bottom:140px">${qrSvg(qrLink(d,org))}</div>`:''}`];}
    case 'banner':{const k=/Emergency/.test(t.name)?' emg':/Breaking/.test(t.name)?' brk':'';return ['bn'+k+(idx>0?' st2':''),`<div class="lb">${esc(d.label)}</div><div class="tx">${k?'':sw}${esc(d.text)}</div>`];}
    case 'ticker':{const txt=esc(d.text);return ['tk',`<div class="lb">${esc(d.label)}</div><div class="trk"><div class="mq"><span>${txt}</span><span>${txt}</span></div></div>`];}
    case 'bar': return ['br',`<span>${esc(d.left)}</span><span class="r">${esc(d.right)}</span>`];
    case 'badge':{const live=/LIVE|ON AIR/.test(d.label);return ['bg'+(live?'':' alt')+'" style="top:'+(64+idx*82)+'px',`<i></i>${esc(d.label)}${/Scan/.test(d.label)?'':''}`];}
    case 'countdown':{const tg=(it.live&&it.live.target)||now()+600000;if(full) return ['full" style="align-items:center;text-align:center',`<div class="kk">${esc(d.label)}</div><div class="cdv" data-kind="cd" data-t="${tg}">--:--</div><div class="bd">${esc(org.name)}</div>`];
      return ['cdl',`<span class="l">${esc(d.label)}</span><span class="v" data-kind="cd" data-t="${tg}">--:--</span>`];}
    case 'timer': if(out==='stage') return ['tms tphase',`<div class="who"><span>${esc(st.timer.label)}</span><span class="ck" data-kind="clock"></span></div><div class="v" data-kind="timer">--:--</div><div class="ph" data-kind="tph">On time</div><div class="bar"><i data-kind="tbar"></i></div>`];
      return ['tmc tphase',`<span data-kind="timer" data-short="1">--:--</span>`];
    case 'clock': return ['clk',`<span data-kind="clock"></span>`];
    case 'frame':{const pip=/Picture|Camera \+|Split|Interview|Guest Video|Testimony Video/.test(t.name);return ['frm',`${pip?'<div class="hole" style="left:1380px;top:700px;width:480px;height:270px"></div>':''}<div class="tag"><i></i>${esc(d.label)}</div>`];}
    case 'background': return ['bkg'+(t.n===180?' alpha':''),`<i></i><i></i><i></i>${d.caption?`<div class="cap">${esc(d.caption)}</div>`:''}`];
    case 'transition': return ['trn',`<div class="sw"></div><h2 class="ts">${esc(d.title)}</h2>`];
    case 'stage': return ['stg',`<div class="lb">${esc(t.name)}</div><div class="cur">${esc(d.current)}</div><div class="lb">Next</div><div class="nx">${esc(d.next)}</div>`];
    case 'logo': if(it.slot==='transition') return ['trn',`<div class="sw"></div><h2><span class="wmk" style="position:static;opacity:1"><span class="c" style="width:200px;height:200px;font-size:90px">${esc(org.mk)}</span></span></h2>`];
      return logoUrl(org,'full')?['wmk logo',`<img src="${esc(logoUrl(org,'full'))}" alt="">`]:['wmk',`<span class="c">${esc(org.mk)}</span><b>${esc(org.short)}</b>`];
  }
  return ['',''];
}
export function reconcile(cv,list){
  const have=new Map([...cv.querySelectorAll(':scope>[data-k]')].map(e=>[e.dataset.k,e]));
  list.forEach(g=>{let el=have.get(g.k);
    if(el&&el.dataset.sig!==g.sig){el.remove();el=null}
    if(!el){el=document.createElement('div');el.dataset.k=g.k;el.dataset.sig=g.sig;el.className='g '+g.cls.split('"')[0];const st=(g.cls.split('style="')[1]||'').replace(/"$/,'');el.setAttribute('style',st+';z-index:'+g.z);el.innerHTML=g.html;cv.appendChild(el)}
    else{el.style.zIndex=g.z;have.delete(g.k)}
  });
  have.forEach(el=>{if(el.classList.contains('out')) return;el.classList.add('out');setTimeout(()=>el.remove(),360)});
}
export function listFor(st,o,org,useDraft){
  const its=st.onAir[o].map(id=>st.items[id]).filter(Boolean).sort((a,b)=>(SLOTZ[a.slot]-SLOTZ[b.slot]));const cnt={};
  return its.map(it=>{const i=cnt[it.slot]=(cnt[it.slot]??-1)+1;const d=it.live;const [cls,html]=G(it,d,o,i,org,st);
    const z=(it.n===183?59:SLOTZ[it.slot]);return {k:it.id,cls,html,z,sig:cls+'|'+html.length+'|'+JSON.stringify(d).length+'|'+hash(html)}});
}
export function hash(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return h}
