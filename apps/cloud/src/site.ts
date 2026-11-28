// The MediaPort website: one site, several rooms, one navigation bar.
//   /            Home (the 3D landing header)
//   /control     the studio (opens an organisation's control room)
//   /platform    signing in, your organisations, adding organisations (platform owner)
//   /kits        overlays, templates, camera frames and downloads
//   /help        how to use MediaPort
//   /guidelines  brand, on-air, safeguarding and licensing guidelines
// MediaPort's own brand only (brand/mediaport). On-air graphics never use these colours.

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export type RoomId = 'home' | 'control' | 'platform' | 'kits' | 'help' | 'guidelines';

const I = (d: string) => `<svg class="ri" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON: Record<RoomId | 'team' | 'screens' | 'brand', string> = {
  home: I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  control: I('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><circle cx="12" cy="10" r="2.2" fill="currentColor" stroke="none"/>'),
  platform: I('<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01"/>'),
  kits: I('<path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>'),
  help: I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><path d="M12 17h.01"/>'),
  guidelines: I('<path d="M4 4h11a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4Z"/><path d="M8 8h7M8 12h7"/>'),
  team: I('<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 4a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6"/>'),
  screens: I('<rect x="2" y="5" width="13" height="9" rx="1.5"/><rect x="17" y="8" width="5" height="9" rx="1"/><path d="M6 18h5"/>'),
  brand: I('<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="15.5" cy="10" r="1.2"/><path d="M12 21a3 3 0 0 1 0-6h2a3 3 0 0 0 3-3"/>'),
};

export const ROOMS: { id: RoomId; href: string; label: string; blurb: string }[] = [
  { id: 'home', href: '/', label: 'Home', blurb: 'What MediaPort is' },
  { id: 'control', href: '/control', label: 'Control', blurb: 'Run live graphics for OBS, FreeShow and the stage screen' },
  { id: 'platform', href: '/platform', label: 'Platform', blurb: 'Sign in, your organisations, team and screen links' },
  { id: 'kits', href: '/kits', label: 'Kits', blurb: 'Overlays, templates, camera frames and downloads' },
  { id: 'help', href: '/help', label: 'Help', blurb: 'Step-by-step guides and answers' },
  { id: 'guidelines', href: '/guidelines', label: 'Guidelines', blurb: 'Brand, on-air, safeguarding and licensing' },
];

/** MediaPort mark (navy tile) as inline SVG. */
export const MARK = `<svg viewBox="0 0 120 120" aria-hidden="true"><rect width="120" height="120" rx="28" fill="#e8552b"/><g transform="translate(-1.5 -1)" fill="none" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"><path d="M24 86V34l22 28 22-28v52" stroke="#F7F4EF"/><path d="M68 34h12a17 17 0 0 1 0 34H68" stroke="#0F1E2E"/><path d="M77.5 44.5v13l10-6.5z" fill="#F7F4EF" stroke="#F7F4EF" stroke-width="1.5"/></g></svg>`;

const HEAD_LINKS = `<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"><link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest"><meta name="theme-color" content="#0f1e2e">`;
export const headLinks = () => HEAD_LINKS;

export interface SiteUser { email: string }

/** The room bar shared by every page. */
export function roomBar(active: RoomId | null, user: SiteUser | null | undefined) {
  const tabs = ROOMS.map((r) => `<a href="${r.href}"${r.id === active ? ' aria-current="page"' : ''}>${ICON[r.id]}${r.label}</a>`).join('');
  const acct = user
    ? `<span class="who">${esc(user.email)}</span><form method="post" action="/auth/signout"><button class="btn-top">Sign out</button></form>`
    : `<a class="btn-top" href="/platform">Sign in</a><a class="btn-top pri" href="/platform">Get started</a>`;
  return `<header class="site-top"><div class="in"><a class="brand" href="/" aria-label="MediaPort home">${MARK}<b>Media<span>Port</span></b></a><nav class="rooms" aria-label="Rooms">${tabs}</nav><div class="acct">${acct}</div></div></header>`;
}

export const footer = () =>
  `<footer class="site-foot"><div class="in"><span>MediaPort · live graphics for churches and organisations</span><span><a href="/help">Help</a> · <a href="/guidelines">Guidelines</a></span></div></footer>`;

/** A full page in a room. `body` is trusted HTML built with esc(). `inlineScript` only on pages whose CSP allows it. */
export function sitePage(o: { title: string; room: RoomId | null; user?: SiteUser | null; body: string; inlineScript?: string; scriptSrc?: string; landing?: boolean; css?: string[] }) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(o.title)}</title>${HEAD_LINKS}<link rel="stylesheet" href="/assets/site.css">${(o.css || []).map((c) => `<link rel="stylesheet" href="${c}">`).join('')}</head><body><a class="skip" href="#main">Skip to content</a>${roomBar(o.room, o.user)}${
    o.landing ? o.body : `<main class="room" id="main">${o.body}</main>`
  }${footer()}${o.inlineScript ? `<script>${o.inlineScript}</script>` : ''}${o.scriptSrc ? `<script type="module" src="${o.scriptSrc}"></script>` : ''}</body></html>`;
}

export const roomHead = (id: RoomId, eyebrow: string, title: string, lede: string) =>
  `<div class="room-head"><span class="ic">${ICON[id].replace('class="ri"', '')}</span><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="mut">${lede}</p></div></div>`;

// ---------------------------------------------------------------- Home
const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="#2bb5a5" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
export function landingBody(signedIn: boolean) {
  const open = signedIn ? '/control' : '/platform';
  const strip = ROOMS.filter((r) => r.id !== 'home').map((r) => `<a href="${r.href}">${ICON[r.id]}<b>${r.label}</b><span>${esc(r.blurb)}</span></a>`).join('');
  return `<div class="landing" id="main"><div class="dots" aria-hidden="true"></div>
<section class="hero" id="top">
  <div class="hero-copy">
    <div class="tag"><i></i>MEDIA PLATFORM</div>
    <h1>Every clip, stream and slide.<br><span>One port.</span></h1>
    <p class="lede">MediaPort brings your media team's uploads, livestreams, slides and graphics into one place — so Sunday's service, and everything after it, runs from a single dashboard.</p>
    <div class="ctas">
      <a class="cta" href="${open}">${signedIn ? 'Open the studio' : 'Open the platform'}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
      <button type="button" class="ghost" data-motion aria-pressed="false"><svg class="pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg><svg class="play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg><span class="pause">Pause motion</span><span class="play">Play motion</span></button>
    </div>
    <div class="checks"><span>${CHECK}Invite-only team access</span><span>${CHECK}Sign in with Google</span></div>
  </div>
  <div class="stage3d" role="img" aria-label="The MediaPort MP logo in 3D, with video, livestream, audio, slides, photo and caption cards orbiting around it">
    <div class="scene"><div class="floor" aria-hidden="true"></div><div class="mark"></div><div class="orbit-tilt"><div class="orbit"></div></div></div>
    <p class="hint">Move your pointer to tilt · hover to pause the orbit</p>
  </div>
</section>
<nav class="rooms-strip" aria-label="Rooms">${strip}</nav>
</div>`;
}
