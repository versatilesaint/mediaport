// Room pages: Control (studio launcher), Platform (sign-in and organisations), Kits, Help, Guidelines.
import { esc, ICON, roomHead, type SiteUser } from './site';

export interface OrgRow { slug: string; name: string; role: string; status: string }

const orgCard = (o: OrgRow) => `<div class="card tile">
  <div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(o.name)}</h3><span class="pill${o.status === 'suspended' ? ' orange' : ' teal'}">${esc(o.role)}${o.status === 'suspended' ? ' · suspended' : ''}</span></div>
  <span class="mut mono">/${esc(o.slug)}</span>
  <div class="row" style="margin-top:6px">
    <a class="btn pri sm" href="/${esc(o.slug)}/control">${ICON.control}Open the studio</a>
    <a class="btn sm" href="/${esc(o.slug)}/team">${ICON.team}Team & screen links</a>
  </div></div>`;

// ---------------------------------------------------------------- Control
export function controlRoomBody(orgs: OrgRow[]) {
  const list = orgs.length
    ? `<div class="cols">${orgs.map(orgCard).join('')}</div>`
    : `<div class="card"><h3>No studio yet</h3><p class="mut">You're signed in, but not part of an organisation. Ask your organisation's owner or admin for an invite link, then open it while signed in.</p><a class="btn" href="/help#invites">How invites work</a></div>`;
  return `${roomHead('control', 'Control', 'Your studios', 'Pick an organisation to open its control room: the template library, editor, running order, speaker timer and live previews of OBS, FreeShow and the stage screen.')}
${list}
<h2>Before a service</h2>
<ol class="steps">
  <li><b>Screens linked.</b> Each screen (OBS, FreeShow, Stage) has its own read-only link under <b>Team & screen links</b>. Paste it once; it keeps working.</li>
  <li><b>Running order ready.</b> Load your templates into the running order and check names, songs and Bible references.</li>
  <li><b>Timer set.</b> Set the speaker timer's length, warnings and grace period.</li>
  <li><b>Practice.</b> Show and hide one graphic on each screen before people arrive.</li>
</ol>
<p class="mut" style="margin-top:16px">Keyboard: <b>Ctrl/⌘ K</b> search templates by name or number · <b>Space</b> show / hide · <b>←/→</b> previous / next · <b>Esc</b> hide. More in <a href="/help#keys">Help</a>.</p>`;
}

// ---------------------------------------------------------------- Platform
export function platformSignedOut(googleReady: boolean, next: string) {
  return `${roomHead('platform', 'Platform', 'Sign in to MediaPort', 'MediaPort is invite-only. Use the Google account your organisation invited.')}
<div class="cols">
  <div class="card"><h3>Sign in</h3><p class="mut">Already invited? Sign in with Google to reach your organisation's studio.</p>${
    googleReady
      ? `<a class="btn pri" style="width:100%" href="/auth/google/start?next=${encodeURIComponent(next)}">Continue with Google</a>`
      : `<p class="err">Google sign-in isn't set up yet. The platform owner needs to add the Google client ID and secret.</p>`
  }</div>
  <div class="card"><h3>Got an invite link?</h3><p class="mut">Open the link from your email or message. You'll be asked to sign in with the same address the invite was sent to, then you join the organisation straight away.</p></div>
  <div class="card"><h3>New organisation?</h3><p class="mut">Organisations are added by the MediaPort platform owner. Ask them to create yours; you'll get an owner invite link.</p><a class="btn" href="/help#start">Getting started</a></div>
</div>`;
}

export function platformMember(user: SiteUser, orgs: OrgRow[], isOwner: boolean) {
  return `${roomHead('platform', 'Platform', 'Your organisations', `Signed in as <b>${esc(user.email)}</b>. Open a studio, manage your team and copy screen links.`)}
${orgs.length ? `<div class="cols">${orgs.map(orgCard).join('')}</div>` : `<div class="card"><p class="mut">You're not in an organisation yet. Ask its owner for an invite link.</p></div>`}
${isOwner ? '' : `<p class="mut" style="margin-top:20px">Need a new organisation? The MediaPort platform owner adds organisations and sends the first owner invite.</p>`}`;
}

// ---------------------------------------------------------------- Kits
type KitRow = OrgRow & { kit?: { ready: { at: number; files: { name: string; size: number }[] } | null; current: boolean } | null };
const KIT_GROUPS: [string, RegExp, string][] = [
  ['Stings and overlays', /^(intro-sting|transition-stinger|corner-logo|lower-third)/, 'Transparent WebM (VP9 + alpha) for OBS and FreeShow, with still PNGs'],
  ['Backgrounds', /^(bg-|still-)/, 'Motion loops (20 s) and stills at 1080p and 4K'],
  ['Camera frames', /^frame-/, 'Transparent PNGs, Bold and Flat; the animated border as WebM'],
  ['Other', /./, ''],
];
const size = (n: number) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
function kitFiles(o: KitRow) {
  const k = o.kit;
  if (!k || !k.ready) return `<p class="mut" style="margin:0">Your kit is being made in your brand colours and logo. It appears here within the hour after your organisation is added or its brand changes.</p>`;
  const groups = KIT_GROUPS.map(([title, re, note]) => {
    const files = k.ready!.files.filter((f) => re.test(f.name) && !KIT_GROUPS.slice(0, KIT_GROUPS.findIndex((g) => g[0] === title)).some((g) => g[1].test(f.name)));
    return files.length ? `<details class="faq"><summary>${esc(title)} · ${files.length} files</summary><div>${note ? `<p class="mut" style="font-size:14px">${esc(note)}</p>` : ''}<div class="tw"><table>${files.map((f) => `<tr><td class="mono">${esc(f.name)}</td><td class="mut">${size(f.size)}</td><td><a class="btn sm" href="/${esc(o.slug)}/kit/${esc(f.name)}" download>Download</a></td></tr>`).join('')}</table></div></div></details>` : '';
  }).join('');
  return `${k.current ? '' : `<p class="note" style="margin:0 0 8px">Your brand changed: a fresh kit is on its way (within the hour). These files use the previous brand.</p>`}<p class="mut" style="margin:0 0 8px;font-size:14px">Made ${new Date(k.ready.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.</p>${groups}`;
}
const KIT_ITEMS: [string, string, string][] = [
  ['Templates', '230 on-air templates in 17 categories, used live from the studio: lyrics, Scripture, sermon, names, announcements, camera overlays, live graphics, countdowns, giving, welcome, testimony, transitions, backgrounds, special overlays, stage display, branding and speaker timers.', 'In the studio'],
  ['Camera frames', '17 layouts with see-through windows (full, picture-in-picture, dual, split, triple, quad, camera + Scripture, lyrics, slides, interview, video call, vertical, border, corners, announcement, countdown, camera IDs), Bold and Flat, with OBS positions in the studio.', 'In your kit'],
  ['Backgrounds', 'Motion backgrounds (standard and dark, 20-second loops) and still backgrounds at 1080p and 4K, in your brand colours.', 'In your kit'],
  ['Stings and overlays', 'Intro sting (7 s), transition stinger (2.5 s, OBS cut at 1.2 s), animated corner logo (12 s loop) and lower third (8 s loop, no text baked in), all transparent.', 'In your kit'],
  ['OBS kit', 'A ready scene collection for Windows and Mac with a scene per camera frame and the stinger set up.', 'Coming next'],
  ['FreeShow kit', 'Templates and overlays to import in FreeShow 1.6.', 'Coming next'],
];
export function kitsBody(orgs: KitRow[] | null) {
  const items = KIT_ITEMS.map(([t, d, s]) => `<div class="card tile"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(t)}</h3><span class="pill ${s.startsWith('Coming') ? 'orange' : 'teal'}">${esc(s)}</span></div><p class="mut" style="margin:0">${esc(d)}</p></div>`).join('');
  const yours = orgs === null
    ? `<div class="card"><p class="mut" style="margin:0">Sign in to download your organisation's kit. <a href="/platform">Sign in</a></p></div>`
    : orgs.length
      ? `<div class="grid">${orgs.map((o) => `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">${esc(o.name)}</h3><a class="btn sm" href="/${esc(o.slug)}/team#brand">${ICON.brand}Brand</a></div>${kitFiles(o)}</div>`).join('')}</div>`
      : `<div class="card"><p class="mut" style="margin:0">Join an organisation to get its kit.</p></div>`;
  return `${roomHead('kits', 'Kits', 'Broadcast kits', 'Everything your media team needs on the OBS and FreeShow computers, made in your own brand.')}
<h2 style="margin-top:8px">Your kits</h2>${yours}
<h2>What's in a kit</h2><div class="cols">${items}</div>
<h2>Screens you can use today</h2>
<div class="cols">
  <div class="card tile"><h3 style="margin:0">OBS</h3><p class="mut" style="margin:0">Add a <b>Browser Source</b>, paste your OBS screen link, width 1920, height 1080. Untick “Shutdown source when not visible”. Camera frames: put your cameras under the Browser Source; the studio shows where.</p></div>
  <div class="card tile"><h3 style="margin:0">FreeShow</h3><p class="mut" style="margin:0">Add a <b>Website</b> item to a slide and paste your FreeShow screen link. Transparency works (tested on FreeShow for Mac).</p><a class="btn sm" href="/test/freeshow">Transparency test page</a></div>
  <div class="card tile"><h3 style="margin:0">Stage</h3><p class="mut" style="margin:0">Open the Stage link full-screen on the pulpit screen or a tablet: the speaker timer and what's next.</p></div>
</div>`;
}

// ---------------------------------------------------------------- Help
export function helpBody() {
  return `${roomHead('help', 'Help', 'How to use MediaPort', 'Short guides for the media team. Start at the top if you are new.')}
<ul class="toc"><li><a href="#start">Getting started</a></li><li><a href="#invites">Invites and roles</a></li><li><a href="#screens">Screen links</a></li><li><a href="#obs">OBS</a></li><li><a href="#freeshow">FreeShow</a></li><li><a href="#studio">The studio</a></li><li><a href="#paging">Songs and pages</a></li><li><a href="#countdowns">Countdowns</a></li><li><a href="#frames">Camera frames</a></li><li><a href="#kit">Your kit</a></li><li><a href="#emergency">Emergency</a></li><li><a href="#timer">Speaker timer</a></li><li><a href="#keys">Keyboard</a></li><li><a href="#trouble">When something goes wrong</a></li></ul>

<h2 id="start">Getting started</h2>
<ol class="steps">
  <li><b>Get your organisation added.</b> The MediaPort platform owner creates it and sends the first owner an invite link.</li>
  <li><b>Accept the invite.</b> Open the link and sign in with Google using the invited email address.</li>
  <li><b>Invite your team.</b> Platform › your organisation › <b>Team & screen links</b> › Invite someone. Choose a role.</li>
  <li><b>Link the screens.</b> Copy the OBS, FreeShow and Stage links into those computers once (see below).</li>
  <li><b>Open the studio.</b> Control › <b>Open the studio</b>. Add templates to the running order and press Show.</li>
</ol>

<h2 id="invites">Invites and roles</h2>
<div class="card tw"><table>
<tr><th>Role</th><th>Can do</th></tr>
<tr><td><b>Owner</b></td><td>Everything, including inviting admins and other owners.</td></tr>
<tr><td><b>Admin</b></td><td>Invite producers, operators and viewers; manage screen links and settings.</td></tr>
<tr><td><b>Producer</b></td><td>Prepare content and the running order, and run graphics.</td></tr>
<tr><td><b>Operator</b></td><td>Show and hide graphics and run the timer during a service.</td></tr>
<tr><td><b>Viewer</b></td><td>Watch the studio without changing anything.</td></tr>
</table></div>
<p class="mut" style="margin-top:10px">Invite links work once, for the email address they were sent to, and expire after 7 days.</p>

<h2 id="screens">Screen links</h2>
<p>Each organisation has three read-only links: <b>OBS</b> (the livestream), <b>FreeShow</b> (the projector) and <b>Stage</b> (the screen facing the speaker). A link can only show graphics; it can't change anything. If a link leaks, rotate it under Team & screen links: the old link stops at once, and you paste the new one.</p>

<h2 id="obs">OBS</h2>
<ol class="steps">
  <li>In each scene that needs graphics: <b>Sources › + › Browser</b>.</li>
  <li>Paste the OBS link. Width <b>1920</b>, height <b>1080</b>.</li>
  <li>Untick <b>Shutdown source when not visible</b> and <b>Refresh browser when scene becomes active</b>.</li>
  <li>Keep the Browser Source at the <b>top</b> of the source list, above cameras.</li>
</ol>

<h2 id="freeshow">FreeShow</h2>
<ol class="steps">
  <li>Make a slide (or a template) with a <b>Website</b> item filling the whole slide.</li>
  <li>Paste the FreeShow link. The background stays see-through, so your slide shows behind the graphics.</li>
  <li>Not sure transparency works on your computer? Open the <a href="/test/freeshow">transparency test page</a> in a Website item first.</li>
</ol>

<h2 id="studio">The studio</h2>
<p>The studio is a desktop of windows: the <b>template library</b> (search by name or number), the <b>editor</b>, the <b>running order</b>, the <b>speaker timer</b> and live previews of each screen. Each graphic has its own switches for OBS, FreeShow and Stage, so the stream and the projector can show different things.</p>

<h2 id="paging">Songs, Scripture and pages</h2>
<p>Paste a whole song into a lyrics template (one line per line, a blank line between verses) and choose how many lines show at once. Long Bible passages split into pages by themselves. While a song or passage is on screen, <b>Next</b> and <b>Prev</b> (or the arrow keys) move through its pages; at the last page, Next moves on in the running order. A small "2 / 5" shows which page is up. Long text always shrinks to fit its box.</p>

<h2 id="countdowns">Countdowns</h2>
<p>A countdown can run for a number of minutes from Show, to a set time (<code>18:00</code> today, or <code>2026-12-24 18:00</code>), or to the next service in a weekly schedule (<code>Sun 10:30, Wed 19:00</code>). Times use your organisation's time zone, including clock changes.</p>

<h2 id="frames">Camera frames</h2>
<p>Camera overlays include 17 frames with see-through windows: full, picture-in-picture, dual, split, triple, quad, camera with Scripture, lyrics, slides, interview, video call, vertical, live border, corners, announcement, countdown and camera IDs. Choose <b>Bold</b> or <b>Flat</b>, and change the margin, gap, sizes and labels in the editor.</p>
<p>Under the editor, <b>OBS positions</b> lists where each camera goes on the 1920×1080 canvas. Copy the numbers into the camera source's <i>Edit Transform</i> in OBS (Position, then Size), and put the MediaPort browser source above the cameras.</p>
<h2 id="kit">Your kit</h2>
<p>Kits shows files made in your own colours and logo: motion and still backgrounds, the intro sting, the transition stinger, the corner logo, the lower third and every camera frame as a PNG. They are rebuilt automatically within the hour after you change your brand.</p>
<p>Stinger in OBS: add a <i>Stinger</i> transition, choose <span class="mono">transition-stinger.webm</span>, and set the transition point to 1200 ms.</p>
<h2 id="emergency">Emergency notices</h2>
<p>The Emergency Notice (#183) goes to every screen and stays on top. Other graphics never push it off; only Hide or Clear removes it.</p>

<h2 id="timer">Speaker timer</h2>
<p>Set the length, warnings (5, 2 and 1 minutes) and a grace period. Every screen shows the same second. After zero the timer shows the grace period, then counts up in overtime.</p>

<h2 id="keys">Keyboard</h2>
<div class="card tw"><table>
<tr><th>Keys</th><th>Does</th></tr>
<tr><td><b>Ctrl/⌘ K</b></td><td>Search templates and actions; type a number to jump to a template</td></tr>
<tr><td><b>Space</b></td><td>Show or hide the selected graphic</td></tr>
<tr><td><b>← / →</b></td><td>Previous / next page of the song or passage on screen, then the running order</td></tr>
<tr><td><b>Esc</b></td><td>Hide</td></tr>
</table></div>

<h2 id="trouble">When something goes wrong</h2>
<details class="faq"><summary>A screen shows nothing</summary><div><p>Check the link is the latest one (links stop working after a rotate). In OBS, check the Browser Source is at the top and visible. The screen keeps its last picture through network loss and reconnects by itself.</p></div></details>
<details class="faq"><summary>The page says I'm not a member</summary><div><p>Sign in with the address you were invited with, or ask your owner for a new invite.</p></div></details>
<details class="faq"><summary>Everything must come off screen now</summary><div><p>Use <b>Clear</b> for the screen in the studio. Each screen can be cleared on its own.</p></div></details>
<details class="faq"><summary>Who do I ask for help?</summary><div><p>Your organisation's owner or admin first, then the MediaPort platform owner.</p></div></details>`;
}

// ---------------------------------------------------------------- Guidelines
export function guidelinesBody() {
  return `${roomHead('guidelines', 'Guidelines', 'Guidelines for media teams', 'How to use MediaPort well: brand, on-air good practice, safeguarding, privacy and licensing.')}
<ul class="toc"><li><a href="#brand">Your brand on air</a></li><li><a href="#onair">On-air good practice</a></li><li><a href="#safe">Safeguarding</a></li><li><a href="#privacy">Privacy and location</a></li><li><a href="#licences">Scripture and song licences</a></li><li><a href="#access">Accessibility</a></li><li><a href="#mediaport">The MediaPort brand</a></li></ul>

<h2 id="brand">Your brand on air</h2>
<div class="grid">
<div class="note do"><b>Do</b> use your organisation's own colours and logo for every graphic; MediaPort's orange and navy never appear on your broadcast.</div>
<div class="note do"><b>Do</b> use light (white) logos on dark backgrounds and video, and dark or colour logos on light backgrounds.</div>
<div class="note"><b>Check</b> text contrast: text on colour must be easy to read on a phone at the back of the room (at least 4.5 : 1).</div>
<div class="note"><b>Use the sober look</b> for funerals and solemn services: muted colours, no sparkles, slower movement.</div>
</div>

<h2 id="onair">On-air good practice</h2>
<ol class="steps">
  <li><b>One message at a time.</b> Hide a graphic when its moment has passed.</li>
  <li><b>Short text.</b> Names and titles on one line; long Scripture goes over several pages.</li>
  <li><b>Check spellings</b> of names and titles before the service, and ask people how they want to be introduced.</li>
  <li><b>Practise</b> showing a lyric, a verse and a name before people arrive.</li>
  <li><b>Emergency messages</b> override everything and stay on until cleared.</li>
</ol>

<h2 id="safe">Safeguarding</h2>
<div class="grid">
<div class="note"><b>Children:</b> no photos of children by default. A child's name may be shown only when the "parental consent recorded" tick is set for that graphic.</div>
<div class="note"><b>Prayer and testimony:</b> only show names with the person's agreement. Never show private details (illness, family matters) without explicit permission.</div>
</div>

<h2 id="privacy">Privacy and location</h2>
<p>Show your town and country only (for example "Leeds, United Kingdom"), never a street, venue address or postcode. Screen links are private: keep them in OBS and FreeShow, don't post them, and rotate a link if it leaks.</p>

<h2 id="licences">Scripture and song licences</h2>
<p>Use a public-domain Bible translation (KJV or WEB) unless your organisation holds a licence for another. When lyrics are on screen, show the song credits and your CCLI licence number on the copyright bar. Your team is responsible for having the right licences.</p>

<h2 id="access">Accessibility</h2>
<p>Keep text large and high-contrast, avoid flashing graphics, and use the reduced-motion setting if anyone watching is sensitive to movement.</p>

<h2 id="mediaport">The MediaPort brand</h2>
<p class="mut">For MediaPort's own pages and materials (not your broadcast).</p>
<div class="cols">
  <div class="card tile"><span style="width:72px;height:72px;display:block">${'<img src="/favicon.svg" alt="MediaPort mark" width="72" height="72">'}</span><h3 style="margin:0">The mark</h3><p class="mut" style="margin:0">An M and a P whose bowl holds a play button. Keep clear space of a quarter of its height around it; tile corners are 23% of its side.</p></div>
  <div class="card tile"><h3 style="margin:0">Colours</h3><p class="mut" style="margin:0"><b style="color:#e8552b">Port Orange #E8552B</b> (actions, live) · <b>Harbour Ink #0F1E2E</b> (header, tile) · Cream #F7F4EF (letters, page) · <b style="color:var(--signal-teal)">Signal Teal #167F74</b> (success, ready), used sparingly next to orange.</p></div>
  <div class="card tile"><h3 style="margin:0">Type</h3><p class="mut" style="margin:0">Inter, bold for headings (display 48 px, h1 32 px, h2 24 px) and regular for body (16 px). Uppercase labels at 12 px for tags such as LIVE.</p></div>
</div>`;
}
