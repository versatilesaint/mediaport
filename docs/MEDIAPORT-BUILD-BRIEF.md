# MediaPort (live overlays for churches and organisations): build brief for Claude Code

Product: **MediaPort**, at **https://mediaport.koladelawal.org**. Owner: Kolade Lawal.

It's a multi-organisation product. The first two organisations are **Photizo-Fire Global Ministries** (photizofiregm.org) and **RCCG Throne of Grace, Hessle** (rccgthroneofgracehessleuk.org), and any other church or organisation can be added and branded.

Prepared 23 November 2026. Revision 2 adds multi-organisation support (§3.3), the OBS dock (§3.4) and speaker timers (§5.2, category 17).

Revision 3 (23 November 2026) fixes risks found in review:
- Phase 1 is split into 1a (prove the pipeline) and 1b (dock, brand editor, remaining core templates) (§13).
- The FreeShow transparency test moves to Phase 0, because its result changes the design work (§9, §13).
- The sync model is made consistent: id-keyed collections, and the cloud room as the single authority (§4.2).
- The KJV text is served as a static asset, not bundled into the Worker script (§6).
- The Hub's address is the IP and QR code first, with mDNS as a bonus (§3).
- A rule is added for when the Hub computer is off or asleep (§3).
- Answered open questions are recorded in §16.

Revision 4 (23 November 2026) redesigns the control page as an operating-system-style shell, "MediaPort OS" (§7.1), with 30 control-room themes. It doesn't change any on-air graphic, sync rule or phase. A clickable prototype is in `docs/design/mediaport-os.html`.

Read all of this before writing code. Build in the phase order in §13 and stop at each phase's acceptance check for the owner to review.

**Naming:** where this brief says "Photizo", read it as "the first organisation". Nothing Photizo-specific may be hard-coded. Brand, texts, departments, location, socials, giving details and team all come from each organisation's settings.

---

## 0. One-paragraph summary

Build a broadcast graphics system for churches and organisations: **227 overlay templates** (lyrics, Scripture, sermon, names, announcements, countdowns, live badges, camera frames, backgrounds, transitions, stage display, branding).

- Templates render on a transparent 1920×1080 web page.
- The page is used as a **Browser Source in OBS** and a **Website item in FreeShow**.
- Everything is edited from one **control page**, on any tablet or laptop.
- Changes reach every screen in real time.
- It must work **with internet** (through Cloudflare, so editors can be anywhere) and **without internet** (through a small local **Hub** program on Windows or Mac that serves the same pages on the church's Wi-Fi).
- One design system is used everywhere. Each graphic can be switched on or off separately for **OBS**, **FreeShow** and an optional **Stage** output.
- It must run smoothly on **basic computers**.
- It's **multi-organisation**: each church or organisation has its own brand, team and links. Photizo and RCCG Throne of Grace come first.
- The control panel also works **docked inside OBS**.

---

## 1. Non-negotiable requirements

1. **One link per output, pasted once.** OBS and FreeShow are never touched again during a service.
2. **All content and titles come from the control page.** Nothing is edited inside OBS or FreeShow.
3. **Works with and without internet.** Switching between the two is automatic, and losing the internet mid-service must not blank the screen.
4. **Same designs everywhere.** Each graphic has switches: show on OBS, show on FreeShow, show on Stage.
5. **Basic computers.** Lite mode is the default and must hold 60 fps (or a steady 30 fps) at 1080p on integrated graphics (Intel UHD 620 class, 8 GB RAM). Full mode is optional.
6. **Windows and Mac** for the Hub. The control page works in any modern browser: iPad, Android tablet, laptop.
7. **Operated by anyone,** non-technical, from a tablet or laptop, with large touch targets and plain words.
8. **Secure.** Overlay links are display-only. Editing needs a sign-in online, or the Hub PIN offline.
9. **Any organisation.** Each organisation has its own brand kit, team, templates, library, links and Hub, completely separated from the others. A new organisation can be set up in minutes without code.
10. **Dockable in OBS.** The control panel works as an OBS Custom Browser Dock, so the operator controls graphics from inside OBS itself.

---

## 2. Context: MediaPort and the existing Photizo systems

**MediaPort is its own product, independent of Photizo's systems.**
- It lives in its own repository and its own Worker, on `mediaport.koladelawal.org`.
- Photizo's systems below are **optional integrations** for the Photizo organisation only. They're set up as connectors in that organisation's settings, never hard-coded.
- RCCG Throne of Grace (and any later organisation) can connect its own calendar (an iCal URL) and live-status sources, or none.
- **Hosting:** `koladelawal.org` is on the owner's **separate personal Cloudflare account**, not the Photizo account. MediaPort's Worker, D1, R2 and Durable Object go on that personal account. Before Phase 0, confirm that `koladelawal.org` is an active zone there (its DNS must be on Cloudflare for the custom domain). If it isn't, stop and ask.
- Because MediaPort and Photizo are on different Cloudflare accounts, the Photizo connectors (calendar, live status) are reached over their **public** HTTPS endpoints only. There are no service bindings or shared D1 across accounts.

Photizo's systems are on Cloudflare account `admin@photizofiregm.org`, with code in GitHub `adminphotizo/*`.

| System | Address | Relevant to this build |
|---|---|---|
| Media Hub and Studio | media.photizofiregm.org (Worker `photizo-media`, D1 `photizo-media`) | Team list and roles. Cloudflare Access app "photizo-media studio" with reusable policy **"Photizo Media team"** (id `c7f1fa93-f14a-4a0e-ae44-6350de3b698c`). The Team page syncs the sign-in list automatically. |
| Events calendar | `media.photizofiregm.org/calendar.ics` and `/api/public/items?type=event` | Source for event countdowns, "Upcoming events" and "Next programme". Shared engine `src/cal.js` handles repeat rules. **Reuse cal.js, but make its home time zone the organisation's setting instead of fixed UK time.** Any organisation can connect any iCal feed (Google Calendar, Outlook, the Photizo feed) or enter events in MediaPort. |
| Live status | `GET media.photizofiregm.org/api/public/live` | Source for LIVE badge, On-Air and status indicators (YouTube and Facebook). |
| Website | photizofiregm.org (Worker `photizo-site`) | Settings for socials, giving, contacts. Logo pack. |
| Ledger | finance.photizofiregm.org | Not used. |

**Lessons from the existing repos. Follow them:**
- `main` always equals what is live. Deploy through **Cloudflare Workers Builds from GitHub `main`**. The Cloudflare GitHub app must have every repository selected; removing one silently stops its deploys.
- `wrangler.jsonc` must match the live Worker, with `keep_vars: true`.
- **Dashboard-API writes from Chrome automation get 403** (Cloudflare's firewall). Don't work around it. Use wrangler or the dashboard's own forms, or ask the owner.
- Keep bundled assets small. Large media goes to R2.
- **Location shown publicly** comes from each organisation's settings. For Photizo it's "Scarborough, United Kingdom" only, never a street or venue address.

---

## 3. Architecture

```
                 ┌───────────────────────── Cloudflare (online) ─────────────────────────┐
 Control page ──►│ Worker mediaport  (mediaport.koladelawal.org)                          │
 (any browser,   │   /{org}/control  /{org}/dock  (signed in)   /{org}/o/:output (token)  │
  anywhere,      │   Durable Object "OverlayRoom": one per organisation                   │
  or OBS dock)   │   D1 mediaport: every table carries org_id                             │
                 │   R2: orgs/{org}/brand, backgrounds, uploads                           │
                 └──────────────▲─────────────────────────────────────────────────────────┘
                                │ outbound WebSocket (when internet is up): sync both ways
 ┌──────────── Church local network (works with no internet) ────────────┐
 │  MediaPort Hub (Windows/Mac, single binary, port 7400)                 │
 │   serves the SAME /control and /o/:output pages from bundled files      │
 │   local WebSocket relay + state store (SQLite/JSON) + asset cache        │
 │        ▲                ▲                       ▲                       │
 │  OBS Browser Source   FreeShow Website item   Tablet/laptop control     │
 │  http://localhost:7400/{org}/o/obs?k=…   http://mediaport-hub.local:7400/{org}/o/freeshow?k=… │
 └────────────────────────────────────────────────────────────────────────┘
```

**Rules:**
- **One codebase for the pages.** The overlay renderer and control UI are a single front-end build, served by both the Worker and the Hub. They connect to whichever server delivered them (same origin), so links never change.
- **The Hub is the primary path at church.** OBS and FreeShow links point to the Hub. When the Hub has internet, it joins the cloud room, so cloud edits reach the screens and local edits reach the cloud.
- **With no Hub installed,** cloud links (`https://mediaport.koladelawal.org/{org}/o/obs?k=…`) work the same way, online only.
- **One Hub per site.** Install it on the OBS computer. If FreeShow runs on another computer, its link uses the Hub's LAN address.
- **Finding the Hub (IP first, mDNS as a bonus).** Bun has no built-in mDNS, and Windows Firewall prompts on first run, so `.local` names can't be relied on.
  - The Hub's status page shows its **IP address and a QR code** first. Tablets join by scanning the QR code.
  - Advise the church to give the Hub computer a **fixed IP** (a DHCP reservation on the router), so saved links don't change. `HUB-INSTALL.md` explains how.
  - Also advertise `mediaport-hub.local` over mDNS where it works (use a small library; test on Windows and Mac).
  - On first run, the Hub tells the operator plainly to click **"Allow access"** on the Windows Firewall prompt, for **private networks**. The status page shows a warning if other devices can't reach it.
- **When the Hub computer is off or asleep.** OBS links point to the Hub. Usually the Hub runs on the OBS computer, so they go down together. If FreeShow or Stage screens are on other computers, they'd lose their source.
  - Displays keep showing their last cached state (§4.2) and never blank the screen.
  - After 10 s without the Hub, and if internet is up, a display **falls back to the cloud room** for the same organisation and output, using the same display key. It switches back to the Hub when the Hub returns. The display shows a tiny status dot only when `debug=1`.
  - The Hub's start-at-login option is on by default. `HUB-INSTALL.md` tells the church to turn off sleep on the Hub computer during services. The Sunday checklist includes "Hub status page shows green".
- **The Hub is linked to one organisation** through that organisation's Hub token. If a computer serves more than one organisation (for example a shared venue), the Hub can hold several organisation links, and the status page lists each one's links. Offline, each organisation's state stays separate.

### 3.1 Tech choices (keep them light)

- **Language:** TypeScript everywhere.
- **Front end:** Vite + **Preact** (small) + plain CSS (custom properties). No heavy UI library.
  - Overlay page budget: **≤ 120 KB gzipped JavaScript** for Lite mode.
  - Full-mode effects load on demand.
- **3D look:**
  - **Lite:** CSS 3D transforms (perspective, rotateX/Y, translateZ), layered gradients, light sweeps (animated gradient masks), soft shadows, pre-rendered short WebM loops (VP9 with alpha) for embers and particles. **No WebGL in Lite.**
  - **Full:** a tiny WebGL layer (OGL or hand-written; avoid full three.js unless needed) for particles, god-rays and glass. It's capped and paused when no graphic is visible.
- **Cloud:** Cloudflare Worker + **Durable Object (SQLite-backed)** for the room + D1 + R2.
  - **Check at build time** whether Durable Objects are on the account's current plan (Free has offered SQLite-backed DOs). If not, tell the owner: the Workers Paid plan is about $5 a month.
- **Hub:**
  - Bun, compiled to single executables with `bun build --compile` for `bun-windows-x64`, `bun-darwin-arm64` and `bun-darwin-x64`.
  - It serves the static build (embedded), with HTTP and WebSocket on port 7400 (configurable), mDNS advertisement, and state in `bun:sqlite`.
  - Its local status page is at `http://localhost:7400/` and shows the status, IP, QR code, links, cloud connection, and a "Start with this computer" toggle.
  - Start at login: Windows writes a shortcut to the Startup folder; macOS writes a LaunchAgent plist.
  - **No Electron.**
  - Binaries are unsigned at first. Document the SmartScreen ("More info → Run anyway") and Gatekeeper (right-click → Open) steps, and say in the README that code signing is optional later (Apple Developer about $99 a year; a Windows certificate about £100 or more a year).
- **Fonts:** bundle the font files (WOFF2) in the build. **No Google Fonts or CDN**, because offline must work.

### 3.2 Repository layout (new private repository `mediaport`; the owner confirms the GitHub account)

```
/packages/core        shared types, state model, sync protocol, template registry, theme tokens, cal.js (copied from photizo-media)
/packages/renderer    overlay page (/o/:output), all template components, effects (lite/full)
/packages/control     control page (/control), library, running order, previews
/apps/cloud           Worker + Durable Object + D1 migrations + R2 handlers (wrangler.jsonc)
/apps/hub             Bun server, mDNS, local store, cloud bridge, status page, build scripts per OS
/brand/{org}          source/ (owner's images, untouched) and processed/ (generated, optimised), one folder per organisation
/docs                 design/mediaport-os.html (clickable shell prototype), OPERATOR-GUIDE.md, SETUP-OBS.md, SETUP-FREESHOW.md, HUB-INSTALL.md, ARCHITECTURE.md
/tests                unit, sync, Playwright visual + transparency + performance
CLAUDE.md             repository rules (copy §2's lessons + §12 security rules)
```

### 3.3 Multi-organisation design (any church or organisation)

- **Organisation (tenant):**
  - `id`, `slug` (used in addresses, for example `photizo`, `rccg-tog`), name, short name;
  - time zone, locale and date format;
  - location text, motto, departments;
  - social handles, website, WhatsApp, giving details, CCLI licence number;
  - connectors (iCal URL, live-status source), status (active or suspended).
- **Isolation:**
  - every D1 table has `org_id`, and every query is scoped by it through one data-access layer; never write raw cross-organisation queries;
  - R2 keys are prefixed `orgs/{orgId}/`;
  - there's one Durable Object room per organisation (`idFromName(orgId)`);
  - display keys and Hub tokens belong to one organisation.
  - **Test:** a user of organisation A can never read or affect organisation B, whether through the API, WebSocket or links.
- **Brand kit (per organisation, edited in Settings → Brand):**
  - logos (full, mark and white versions), colours (primary, accent, light, dark, plus auto-derived tints with a contrast check);
  - fonts (choose from the bundled open fonts, or upload WOFF2 files the organisation is licensed to use);
  - background images and videos, default theme, lower-third style, corner watermark position;
  - **live preview** of sample templates while editing.
- **Template customisation (per organisation):**
  - switch templates on or off; rename how they appear in the control page; set default text and fields; set default output switches;
  - pin favourites;
  - duplicate a preset to make a variant (for example "Guest Minister – Conference").
  - The 227 built-in templates are the shared base. An organisation's overrides are stored separately, so base improvements reach everyone.
- **Starter packs:** at set-up, choose "Church", "Conference" or "General organisation". Each switches on a sensible subset of templates, a theme and sample running orders. A church gets services, worship, Scripture and giving; a general organisation gets talks, panels, announcements and timers.
- **Platform roles:**
  - **Platform owner** (Kolade Lawal) creates, suspends and deletes organisations and sees usage. **The platform owner can't read an organisation's content unless invited.**
  - **Organisation roles:** Owner, Admin (settings, team, links), Producer (all content and Take), Operator (Take/Clear/Next and editing on-air text only), Viewer (preview only).
- **Sign-in (replaces Cloudflare Access for organisation users):** Cloudflare Access doesn't suit open multi-organisation sign-up, and Access seats are limited on the free plan. Build application-level sign-in instead:
  - **Google sign-in** (OAuth; works with Google Workspace accounts such as Photizo's and RCCG's);
  - **email one-time code** for anyone else. This needs an email-sending service: propose Resend or the organisation owner's own SMTP, ask the owner to choose, and keep the API key as a Worker secret;
  - sessions are HttpOnly, Secure, SameSite=Lax cookies, signed, 30-day rolling;
  - organisation owners invite people by email.
  - **Keep Cloudflare Access only on `/platform*`** (the platform owner's admin area).
- **Data portability:** each organisation can export everything (JSON plus media zip) and delete its organisation.
- **First two organisations to seed:**
  - **Photizo-Fire Global Ministries** (`photizo`): Europe/London; location "Scarborough, United Kingdom"; motto "The Nations Are Taken."; departments Administration, Media, Finance, Compliance, Publicity, Lit Nation; connectors to media.photizofiregm.org (calendar and live status).
  - **RCCG Throne of Grace, Hessle** (`rccg-tog`): Europe/London; location "Hessle, United Kingdom" (confirm the wording with the owner); brand kit from the images the owner attaches; no connectors at first.
- **Later, optional:** an organisation's own domain (for example `live.theirchurch.org`) through Cloudflare for SaaS custom hostnames. That has a cost per hostname above a free allowance, so it's **not in this build**; leave room in the routing for it.
- **No billing in this build.** Organisations are created by the platform owner. Leave a `plan` field for later.

### 3.4 OBS dock (control from inside OBS)

- Add a **dock view** at `/{org}/dock`: the same control features in a compact single column, designed for 300–500 px width.
  - **Shows:** output preview (small), quick Take/Clear, the running order with Next, a search, and the speaker-timer controls.
  - **Hides:** wide editors (opened as a pop-up instead).
- **How the operator adds it:** in OBS, use the **Docks → Custom Browser Docks** menu, give it a name ("MediaPort") and paste the dock URL. It then sits beside the Scenes and Sources panels.
- **Works offline too:** `http://localhost:7400/{org}/dock` from the Hub.
- **Sign-in inside the dock:**
  - OBS docks are embedded browsers, so Google pop-up sign-in may not work there.
  - Support a **device-link sign-in**: the dock shows a 6-digit code and QR, and the user approves it from their phone, already signed in. This creates a long-lived dock session limited to the Operator role, which the Admin can revoke.
  - On the Hub, the dock uses the Hub PIN.
- **Hotkeys in the dock** work while the dock is focused. Global OBS hotkeys aren't required.
- **Optional (Phase 4+):** OBS WebSocket integration, so a running-order item can also switch an OBS scene. It's off by default and needs the operator to enter the OBS WebSocket password in the dock, stored locally only. FreeShow has no dock, so its operators use the control page in a browser or tablet.

---

## 4. State model and sync protocol

### 4.1 Core entities (packages/core)

```ts
type OutputId = 'obs' | 'freeshow' | 'stage';
interface OutputConfig {
  id: OutputId; enabled: boolean;
  mode: 'overlay' | 'fullframe';     // fullframe = opaque branded background (FreeShow fallback, see §9)
  quality: 'auto' | 'lite' | 'full'; fps: 30 | 60;
  safeArea: number;                  // % inset, default 5 (screens), 0 (stream)
  theme: string;                     // theme key; default same for all outputs
  blackout: boolean;                 // master clear for this output
}
interface Item {                     // one graphic instance on air or cued
  id: string; template: TemplateKey; // e.g. 'lowerThird.pastor'
  data: Record<string, unknown>;     // content fields, validated by the template's schema
  targets: Record<OutputId, boolean>;// per-output switch (the owner's main requirement)
  state: 'cued' | 'on' | 'off';
  slot: Slot;                        // layering slot, from the template
  autoOutMs?: number;                // optional timed hide
  updatedAt: HLC; updatedBy: string; // hybrid logical clock + who
}
type Slot = 'background' | 'frame' | 'fullscreen' | 'lower' | 'banner' | 'ticker' | 'badge' | 'watermark' | 'transition';
```

**Layering, bottom to top:** background (0), frame (10), fullscreen (20), lower (30), banner (40), ticker (45), badge (50), watermark (55), transition (60).

**Default collision rule:** one `on` item per slot per output. Taking a new one animates the previous one out. These slots may hold several items at once: `badge` (up to 3, auto-arranged in a corner) and `banner` (stacked, up to 2).

### 4.2 Sync

- **Transport:** WebSocket, JSON messages, protocol version `v: 1`.
- **Messages:**
  - `hello {role:'display'|'control'|'hub', output?, token}`;
  - `snapshot {state}`;
  - `patch {ops:[{path, value, hlc}]}`;
  - `take {itemId}`, `clear {output|all}`, `next`, `prev`;
  - `presence`, `ping`/`pong`.
- **Authority:** the **cloud room** is the single source of truth when it can be reached. When the Hub is offline, the **Hub** is the authority for its local screens.
- **Data shape (so merges can't corrupt lists):** never store editable lists as arrays.
  - Every collection (items, running-order entries, song sections and lines, points) is a **map keyed by id**.
  - Order is stored separately as a fractional `order` key on each entry (for example `"a0"`, `"a0V"`), so two people inserting or reordering don't overwrite each other.
  - Deletes are tombstones (`deleted: true` with an HLC), purged after 30 days.
- **Conflicts:** last writer wins **per field**, by Hybrid Logical Clock, on that map structure.
- **Reconnect, displays and controls:** state is small (well under 1 MB), so they always receive a full **snapshot** on every (re)connect. Displays and controls never merge.
- **Reconnect, Hub to cloud:** the Hub keeps an **outbound queue** of the operations made while offline. On reconnect it receives the cloud snapshot, replays its queued operations to the room (the room applies them by the per-field HLC rule), then takes the room's resulting snapshot. There's no two-way op-log exchange.
- **Live actions are not replayed.** Take, Clear, Next and timer start/pause made offline are **not** replayed to the cloud later, because replaying them would change what's on air. On reconnect the Hub's current on-air state is sent once and **wins**, because the church's screens follow the Hub.
- **Displays** cache the last snapshot in `localStorage`. On reload or disconnect they keep showing the last state and reconnect with backoff (0.5 s → 5 s max). Never blank the screen because of a network error.
- **Hub ↔ cloud:** the Hub keeps one outbound WebSocket to the room, authenticated with a **Hub token**. The token is created in the cloud control page, shown once, pasted into the Hub, and stored hashed in D1. On reconnect it follows the queue-and-replay rule above.
- **Assets:** the Hub mirrors R2 brand and background assets into a local cache on connect, so offline graphics never show missing images. Show the cache size and a "refresh assets" button on the Hub status page.
- **Target latency:** under 150 ms on LAN and under 500 ms through the cloud, measured from Take to first frame.

### 4.3 Links

- **Display links:** `/{org}/o/{output}?k={displayKey}`. A display key is read-only, 128-bit random, and can be rotated from the control page; rotating it invalidates old links.
- **Control:** `/{org}/control` (full) and `/{org}/dock` (compact, for OBS; §3.4).
  - **Cloud:** MediaPort sign-in (Google or email code; §3.3), checked against the organisation's team and roles.
  - **Hub:** a PIN screen (see §12).
- **Platform admin:** `/platform` (owner only; Cloudflare Access).
- **Query options on display links:**
  - `quality=lite|full|auto`
  - `fps=30|60`
  - `debug=1` shows the FPS meter and safe-area guides

---

## 5. Template system

Each template is a **component plus a preset**. A preset is a named configuration of a component: layout, theme accents, which fields are shown, and animation. Define all 227 presets in `packages/core/templates.ts`. Each entry holds:
- `key`, `name`, `category`
- `component`, `preset`, `slot`
- `fields` (a zod schema)
- `defaultTargets`
- `sampleData` (used by visual tests and the gallery)
- optional `sources` (for example: calendar, live status, settings, Bible)

### 5.1 Base components (19)

| Component | What it draws | Key fields |
|---|---|---|
| `lowerThird` | Name strap with optional second line and department; 3D slab with light sweep | name, title, department, accent, align (L/C/R), size (slim/standard/large) |
| `lyrics` | Song lines in layouts lowerThird / full / twoLine / threeLine, styles worship / praise / hymn (stanza numbers) / responsive (leader vs congregation colours), highlight none / line / word | songId, sectionIndex, lineIndex, layout, highlight |
| `scripture` | Verses in layouts lowerThird / full / reference / reading / passage (paged) / multiple / chapter / highlight / split / sideBySide / scroll / wordHighlight | reference, translation, verses[], emphasis[], layout, reader |
| `title` | Big title, optional subtitle and artwork: sermon, series, topic, song, theme | title, subtitle, kicker, image |
| `points` | Numbered or bulleted points with reveal-one-by-one: sermon points, outline, prayer points, notes, summary | heading, points[], revealIndex, style |
| `quote` | Pull quote with attribution | text, by |
| `card` | Full-screen or panel slide: announcements, welcome, giving, programme, celebration, intro cards. Optional image, list, QR, date and time, progress bar | heading, kicker, body, list[], image, qr, when, where, cta, theme |
| `banner` | Strip banner across the top or bottom: breaking, info, emergency, follow, contact | style, text, icon, url |
| `ticker` | Continuous scrolling ticker at constant speed (GPU-friendly translate3d) | items[], speed |
| `bar` | Persistent header / footer / title / info / copyright bar | left, centre, right, style |
| `badge` | Small indicator: LIVE, On-Air, platform icons, department, status. Can bind to live status | kind, label, bind |
| `countdown` | Countdown to a time or event, or a duration; styles inline / full; warning colours | target (time or event id or duration), style, label, warnAt[] |
| `timer` | Count-up or speaker timer with thresholds (green, amber, red, flash); programme timer showing current item and remaining time | mode, durationMs, thresholds, scheduleId |
| `clock` | Time of day in a chosen time zone, 12 or 24 hour | tz, format |
| `frame` | Camera layouts: opaque branded panels with **transparent holes** for camera sources, plus labels and borders | layout, labels[], border, holes (exported coordinates, see §8) |
| `background` | Full-frame motion backgrounds: procedural CSS/canvas, owner images, looping videos, or a transparent particle overlay | preset, mediaId, intensity |
| `transition` | Section stinger (1.5–3 s) with a title sweep, then auto-out | title, preset |
| `stage` | Stage display: current/next slide, notes, scripture now/next, countdown, clock, schedule, chords. **Opaque, high contrast, large type** | panels[] |
| `logo` | Logo animation sting and corner watermark | variant, position, opacity |

### 5.2 Full mapping of the owner's 227 templates

Format: `#  Name → component.preset (slot)`. Numbers match the owner's list. Where two numbers are the same graphic, they share a preset (noted "= #n"), and the control page lists both names.

**1. Worship and praise**
1 Worship Lyrics – Lower Third → lyrics.ltWorship (lower)
2 Worship Lyrics – Full Screen → lyrics.fullWorship (fullscreen)
3 Praise Lyrics – Lower Third → lyrics.ltPraise (lower), with brighter and faster motion
4 Hymn Display → lyrics.hymn (fullscreen), with stanza number and hymn number
5 Responsive Lyrics → lyrics.responsive (fullscreen), with Leader and All lines in two colours
6 Choir Ministration → card.ministrationChoir (fullscreen), introducing choir name and song
7 Solo Ministration → card.ministrationSolo (fullscreen), introducing minister name, song and photo
8 Worship Leader Name → lowerThird.worshipLeader (lower)
9 Choir Name Identification → lowerThird.choir (lower)
10 Song Title Overlay → title.song (lower)
11 Song Artist / Minister Identification → lowerThird.songMinister (lower)
12 Instrumental Worship Background → background.instrumental (background), with an optional "Instrumental" caption
13 Worship Lyrics – Word-by-Word Highlight → lyrics.wordHighlight (lower or fullscreen); the operator taps "next word" or uses timing
14 Lyrics – Two-Line → lyrics.twoLine (lower)
15 Lyrics – Three-Line → lyrics.threeLine (lower)

**2. Scripture and Bible study**
16 Bible Verse – Lower Third → scripture.lt (lower)
17 Bible Verse – Full Screen → scripture.full (fullscreen)
18 Scripture Reference Overlay → scripture.reference (lower), reference only
19 Scripture Reading → scripture.reading (fullscreen), with reader name and passage, paged
20 Bible Passage → scripture.passage (fullscreen), auto-paged by length
21 Multiple Bible Verses → scripture.multiple (fullscreen), 2–4 references stacked
22 Bible Study Teaching → points.teaching (fullscreen), points with a Scripture panel
23 Bible Study Topic Header → title.topic (lower)
24 Bible Chapter Display → scripture.chapter (fullscreen), scrollable with a verse cursor
25 Bible Verse Highlight → scripture.highlight (fullscreen), one verse emphasised within its context
26 Scripture – Split Screen → scripture.split (frame + fullscreen): camera hole on the left, text on the right
27 Scripture – Side-by-Side → scripture.sideBySide (fullscreen): two translations or two passages
28 Scripture – Scrolling → scripture.scroll (fullscreen), slow auto-scroll the operator can pause
29 Scripture – Word Highlight → scripture.wordHighlight (fullscreen)
30 Daily Bible Reading → card.dailyReading (fullscreen), with date, plan name and references

**3. Sermon and preaching**
31 Sermon Title → title.sermon (lower or fullscreen)
32 Sermon Subtitle → title.sermonSubtitle (lower)
33 Preacher ID – Lower Third → lowerThird.preacher (lower)
34 Preacher ID – Full Screen → card.preacher (fullscreen), with photo, name and title
35 Sermon Points → points.sermon (fullscreen), revealed one by one
36 Sermon Outline → points.outline (fullscreen)
37 Key Points Overlay → points.keyLower (lower), one point at a time
38 Main Teaching Points → points.main (fullscreen)
39 Bible Reference Overlay → = #18 scripture.reference
40 Important Quote → quote.standard (lower or fullscreen)
41 Teaching Notes → points.notes (fullscreen), denser text, smaller type
42 Sermon Series → title.series (fullscreen), with series artwork
43 Sermon Summary → points.summary (fullscreen)
44 Altar Call → card.altarCall (fullscreen), gentle and reverent motion, optional prayer text
45 Prayer Points → points.prayer (fullscreen), revealed one by one

**4. Speaker and minister identification** (all lowerThird, slot lower)
46 Pastor → lowerThird.pastor · 47 Guest Minister → lowerThird.guestMinister · 48 Guest Speaker → lowerThird.guestSpeaker · 49 Assistant Pastor → lowerThird.assistantPastor · 50 Worship Leader → = #8 · 51 Host / MC → lowerThird.host · 52 Moderator → lowerThird.moderator · 53 Panelist → lowerThird.panelist · 54 Interview Guest → lowerThird.interviewGuest · 55 Testimony Speaker → lowerThird.testimony · 56 Minister Title and Department → lowerThird.titleDept · 57 Name and Position → lowerThird.namePosition

**5. Church announcements** (card, fullscreen, unless noted)
58 Announcement → card.announcement · 59 Weekly Activities → card.weekly (list) · 60 Upcoming Events → card.upcomingEvents (**source: calendar**) · 61 Special Programme → card.specialProgramme · 62 Conference → card.conference · 63 Revival Programme → card.revival · 64 Prayer Meeting → card.prayerMeeting · 65 Bible Study → card.bibleStudy · 66 Sunday School → card.sundaySchool · 67 Youth Service → card.youth · 68 Workers' Meeting → card.workers · 69 Registration → card.registration (QR) · 70 Contact Information → card.contact (**source: settings**) · 71 Social Media → card.social (**source: settings**) · 72 Website Promotion → card.website · 73 Giving / Offering Info → card.giving (**source: settings**) · 74 QR Code Announcement → card.qr · 75 Important Notice Overlay → banner.notice (banner)

**6. Broadcast camera overlays** (frame, frame slot, unless noted; see §8)
76 Full Camera Frame → frame.full · 77 Camera Lower Third → lowerThird.camera (lower) · 78 Camera Name Strap → lowerThird.slim (lower) · 79 Camera Location ID → lowerThird.location (lower) · 80 Picture-in-Picture → frame.pip · 81 Dual Camera → frame.dual · 82 Triple Camera → frame.triple · 83 Split-Screen Camera → frame.split · 84 Vertical Camera → frame.vertical (centred 9:16 hole) · 85 Portrait Video → frame.portrait · 86 Camera + Scripture → frame.camScripture (camera hole plus scripture panel, data from scripture) · 87 Camera + Lyrics → frame.camLyrics · 88 Camera + Presentation → frame.camPresentation (camera hole plus slide hole) · 89 Interview Camera → frame.interview (two holes and name labels) · 90 Guest Video Call → frame.videoCall · 91 Live Camera Border → frame.border · 92 Transparent Camera Frame → frame.corners (corner brackets only) · 93 Multi-Camera ID → frame.camLabels (labels only)

**7. Live broadcast graphics**
94 LIVE Badge → badge.live (badge; **source: live status**, or manual) · 95 LIVE NOW Overlay → badge.liveNow (badge, larger, animated) · 96 On-Air Indicator → badge.onAir · 97 Broadcast Status → badge.status (Live / Starting soon / Offline / Recording; **source: live status**) · 98 Live Streaming Frame → frame.liveStream (branded border with a LIVE badge) · 99 Church Logo Watermark → logo.watermark (watermark) · 100 Channel Branding → bar.channel (bar) · 101 Broadcast Header → bar.header · 102 Broadcast Footer → bar.footer · 103 Streaming Information Bar → bar.info · 104 YouTube Channel ID → badge.youtube · 105 Facebook Live ID → badge.facebook · 106 Online Service Indicator → badge.online · 107 Live Service Title Bar → bar.title · 108 Copyright Information → bar.copyright (CCLI licence number, song copyright line; **source: song**)

**8. Countdowns and timers**
109 Service Countdown → countdown.service (lower; **source: calendar**, next service) · 110 Pre-Service Countdown → countdown.preServiceFull (fullscreen, with background) · 111 Event Countdown → countdown.event (choose an event from the calendar) · 112 Worship Countdown → countdown.worship · 113 Prayer Countdown → countdown.prayer · 114 Conference Countdown → countdown.conference (days, hours, minutes, seconds) · 115 Break Countdown → countdown.break (duration) · 116 Speaker Time Countdown → timer.speaker (thresholds; **default targets: Stage on, OBS off**) · 117 Sermon Timer → timer.sermon (count-up) · 118 Session Timer → timer.session · 119 Clock → clock.standard · 120 Programme Schedule Timer → timer.programme (from the running order)

**9. Offering and giving** (card, fullscreen, unless noted)
121 Offering Announcement → card.offering · 122 Tithes and Offering → card.tithes · 123 Bank Details Overlay → lowerThird.bank (lower; **source: settings**, the organisation's published account details) · 124 Church Account Information → card.account · 125 Online Giving → card.onlineGiving · 126 QR Code Giving → badge.qrGiving (corner QR, badge slot) · 127 Giving Instructions → card.givingSteps · 128 Donation Appeal → card.appeal · 129 Thanksgiving Offering → card.thanksgivingOffering · 130 Project Support → card.project (optional progress bar)

**10. Welcome and service opening** (card, fullscreen, unless noted)
131 Welcome to Church → card.welcome · 132 Welcome to Sunday Service → card.welcomeSunday · 133 Welcome to Online Worship → card.welcomeOnline · 134 Opening Prayer → card.openingPrayer · 135 Opening Worship → card.openingWorship · 136 Service Theme → title.serviceTheme · 137 Theme of the Month → title.monthTheme · 138 Welcome Guest → lowerThird.welcomeGuest (lower) · 139 Service Programme Outline → card.programme (**source: running order**) · 140 Vision and Mission → card.vision · 141 Church Identity → card.identity

**11. Testimony and special ministration** (card, fullscreen, unless noted)
142 Testimony Introduction → card.testimonyIntro · 143 Testimony Speaker Lower Third → = #55 · 144 Testimony Video Frame → frame.testimonyVideo · 145 Special Ministration Intro → card.specialMinistration · 146 Special Guest Intro → card.specialGuest (photo) · 147 Thanksgiving Service → card.thanksgiving · 148 Dedication Service → card.dedication · 149 Baby Dedication → card.babyDedication (**safeguarding: show a child's name only if the "parental consent recorded" box is ticked; no child photos by default**) · 150 Anniversary → card.anniversary · 151 Birthday → card.birthday · 152 Memorial Service → card.memorial (**sober theme: muted colours, slow fades, no particles or fire**) · 153 Divine Remembrance → card.remembrance (same sober rules)

**12. Transitions and sections**
154 Worship → Word · 155 Prayer Session · 156 Scripture Reading · 157 Sermon Introduction · 158 Offering · 159 Announcement · 160 Testimony · 161 Guest Minister · 162 Service Closing → transition.{key} (transition slot, 1.5–3 s, auto-out) · 163 Intermission → card.intermission (with an optional break countdown) · 164 Coming Up Next → card.comingUp (**source: running order**, next item)

**13. Backgrounds and motion graphics** (background slot)
165 Animated Worship → background.worship · 166 Abstract Motion → background.abstract · 167 Particles → background.particles · 168 Light Rays → background.lightRays · 169 Golden Dust → background.goldDust · 170 Blue Gradient → background.blueGradient · 171 Church Auditorium → background.auditorium (**owner's photo**) · 172 Bible-Themed → background.bible · 173 Cross → background.cross · 174 Clouds and Heaven → background.clouds · 175 Fire → background.fire · 176 Water and Ocean → background.water · 177 Nature → background.nature (owner's images or video) · 178 Cinematic → background.cinematic (owner's video) · 179 Looping Video → background.loop (any uploaded MP4 or WebM) · 180 Transparent Animated → background.alphaParticles (transparent: particles and light over the camera)

Procedural presets (165–170, 172–176) are built in CSS or canvas, so they need no media and work offline. Photo and video presets use the owner's images. **Never fetch random stock media from the internet:** licensing is unknown.

**14. Special broadcast overlays** (banner slot, unless noted)
181 Breaking-News Style → banner.breaking · 182 Important Information → banner.info · 183 Emergency Notice → banner.emergency (**highest priority: shows above everything except the transition slot; high-contrast red and white; never auto-hides**) · 184 Guest Welcome → banner.guestWelcome · 185 Next Programme → banner.nextProgramme (**source: calendar**) · 186 Now Playing → bar.nowPlaying (bar) · 187 Upcoming Programme → banner.upcoming · 188 Social Follow → banner.follow · 189 Subscribe and Like → banner.subscribe (animated button) · 190 YouTube Notification → banner.ytBell · 191 Scrolling News Ticker → ticker.news (ticker) · 192 Contact Us → banner.contact · 193 Website URL → banner.website · 194 WhatsApp Contact → banner.whatsapp · 195 Prayer Request Info → banner.prayerRequest

**15. Stage and presenter display** (stage component; **default targets: Stage only**)
196 Current Slide · 197 Next Slide · 198 Speaker Notes · 199 Current Scripture · 200 Next Scripture · 201 Countdown · 202 Clock · 203 Service Schedule · 204 Song Chords · 205 Presenter Notes → stage.{key}.

These panels can be combined into stage layouts: for example "Preacher" (current scripture, timer, clock, notes) and "Worship team" (current and next lyric lines with chords).

**16. Branding and identity**
206 Logo Animation → logo.sting (transition slot, about 3 s) · 207 Logo Watermark → = #99 · 208 Church Name Lower Third → lowerThird.churchName · 209 Theme Banner → banner.theme · 210 Ministry Department ID → badge.department (departments from the organisation's settings; Photizo: Administration, Media, Finance, Compliance, Publicity, Lit Nation) · 211 Location Banner → banner.location (text from the organisation's settings; Photizo: **"Scarborough, United Kingdom", never a street address**) · 212 Vision Statement → = #140 (statement variant) · 213 Motto Overlay → bar.motto (from the organisation's settings; Photizo: "The Nations Are Taken.") · 214 Branded Scripture Frame · 215 Branded Worship Frame · 216 Branded Announcement Frame → **theme skins**: decorative frames wrapped around scripture, lyrics and card components when the skin is on (`skin: 'branded'`) · 217 Branded Broadcast Border → frame.brandedBorder

**17. Speaker and preacher timers** (added in revision 2; numbered 218–227 here, and listed as 26–35 in the owner's timer list)

All ten are presets of one **speaker-timer engine** (component `timer`, mode `speaker`). Its phases run in order:

*running → 5-minute warning → 2-minute warning → 1-minute warning → time up → grace period → overtime*

218 Preacher Countdown Timer → timer.preacher (countdown from the allotted time, with the preacher's name)
219 Guest Minister Speaking Timer → timer.guestMinister (shows the guest's name, from People)
220 Sermon Time Limit Timer → timer.sermonLimit (countdown plus a progress bar of the limit used)
221 Presentation Countdown → timer.presentation (for talks or slides; neutral wording for non-church organisations)
222 Speaker Time Remaining → timer.remaining (compact "12:40 left"; also usable as a small corner on OBS if switched on)
223 5-Minute Warning Timer → timer.warn5 (automatic amber alert at 5:00 remaining: a pulse and the words "5 minutes")
224 2-Minute Warning Timer → timer.warn2 (automatic orange alert at 2:00)
225 1-Minute Warning Timer → timer.warn1 (automatic red alert at 1:00, with a stronger pulse)
226 Overtime Warning Timer → timer.overtime (after the grace period: counts up in red, "+02:15 over", with a slow flash)
227 Speaker Grace Period Timer → timer.grace (after time up: a grace countdown, default 2:00, in a distinct purple, "Grace 1:30"; then overtime begins)

Engine rules:
- **One timer, many views.** Starting a timer once drives all its views: stage, dock, control page, and OBS or FreeShow if switched on. Each preset is a view or style of the same running timer. Several timers can run at once (for example sermon and session).
- **Server time, not screen time.** Store `startedAt`, `durationMs`, `pausedTotalMs` and `graceMs` in state, and calculate the remaining time on each screen from a clock synchronised with the server or Hub (an NTP-style offset taken at connect). Every screen then shows the same second, and a reconnecting screen shows the right time at once.
- **Controls (control page and dock):**
  - Start, Pause/Resume, +1 min, −1 min, Reset;
  - duration presets: 5, 10, 15, 20, 30, 45, 60 minutes, or custom;
  - the grace length (0–10 minutes; 0 = none);
  - which warnings are active, with editable thresholds (default 5, 2 and 1 minutes).
- **Warnings:** each threshold fires once, as an alert on the chosen outputs: Stage by default; the control page and dock always show it. It's visual only by default, with an optional chime on the control device and **never** on OBS or FreeShow audio.
- **Default output switches:** **Stage on; OBS and FreeShow off.** Viewers don't see a preacher's clock unless the operator chooses.
- **Pulpit view:** the stage output can show a "Preacher" layout: a huge timer, the current Scripture and a clock. A tablet on the pulpit can open just the stage link full-screen.
- **Colour language** (also tied to the organisation's palette, but meaning must stay clear): normal = the organisation's light colour; 5 min = amber; 2 min = orange; 1 min = red; grace = purple; overtime = red flashing slowly. Flashing is limited to 1 Hz, and replaced by a steady thick border under reduced motion.
- **Existing timers #116–#118 now use this same engine.** #116 Speaker Time Countdown = timer.remaining with warnings on; #117 Sermon Timer = count-up mode; #118 Session Timer = a plain countdown with no grace period.
- **Tests:** phase changes at exact thresholds; pause, resume and ±1 minute across thresholds (a warning must not fire twice); clock offset correction; disconnect and reconnect during overtime.

Total: 227 named templates, built from about 160 distinct presets, because duplicates share one.

---

## 6. Content library (control page, stored in D1 and mirrored to the Hub)

- **People** (per organisation): name, title, department, photo, default lower-third preset. Pre-seed Photizo with the Setman ("Prophet Segun Adebayo, the Setman"); everyone else, and all of RCCG's people, are added by each team.
- **Songs:**
  - title, artist or minister, CCLI song number, copyright line;
  - sections (Verse 1, Chorus, Bridge…) with lines and optional chords for the stage;
  - order and arrangement.
  - Lyrics are split into lines automatically and the operator can adjust. **Don't ship any copyrighted lyrics:** the library starts empty.
  - **Import:** paste plain text, with `[Chorus]` style headings becoming sections.
  - **Optional (investigate first):** importing FreeShow show files. If they turn out to be readable JSON, build an importer; if not, skip it and say so.
- **Bible:**
  - bundle the **King James Version (public domain)** for offline lookup. It's several MB, more than the Worker script size limit (3 MB compressed on Free, 10 MB on Paid), so **never import it into the Worker script**:
    - cloud: serve it as **Workers Static Assets**, split into one JSON file per book, loaded only when needed;
    - Hub: embed the same per-book files in the binary;
    - control page: cache the books it has used, for offline lookup;
  - parse references such as "John 3:16-18", "Ps 23", "1 Cor 13:4–7";
  - other translations are typed or pasted manually and labelled with their name. **Don't bundle copyrighted translations** (NKJV, NIV, ESV and others need licences).
- **Announcements:** reusable cards with dates and an expiry.
- **Settings:** pulled from the website and Media Hub where possible and cached: social handles, website URL, WhatsApp number, contact emails and phones, giving and bank details, CCLI licence number, motto, logos.
- **Running order (service schedule):**
  - an ordered list of items, each with a planned start time and duration;
  - this drives #120, #139, #164, #203 and the **Next** button;
  - can be saved as a template ("Sunday Service", "GOAS", "Prayer night") and loaded.
- **Presets:** saved sets of item configurations and per-output switches.

---

## 7. Control page (UX requirements)

- **Layout (tablet landscape first, then works on laptop and phone):**
  - **Top:** live previews of each enabled output (OBS / FreeShow / Stage), drawn as scaled iframes of the real display page at 25% with transparency shown as a checkerboard;
  - **Left:** the library and template gallery (categories 1–17, with a search box);
  - **Centre:** the item editor (fields from the template schema);
  - **Right:** the running order.
- **Big buttons:** **TAKE** (green), **CLEAR** (per item), **CLEAR ALL** (per output), **NEXT / PREV** (running order, lyric line, scripture page, point reveal).
- **Per-item output switches:** three toggle chips, **OBS · FreeShow · Stage**, always visible on each item. This is the owner's key feature.
- **Live typing option:** "Update on air as I type" on or off per item; off by default.
- **Hotkeys** (laptop): Space = Take/Next, Esc = Clear, ←/→ = Prev/Next, 1–9 = jump to running-order item.
- **Accessibility and ease of use:**
  - touch targets ≥ 48 px;
  - plain English labels and no jargon ("Show", not "Take", in tooltips);
  - clear connection status ("Online · Hub · 3 screens connected");
  - who else is controlling, as presence avatars.
- **Activity log:** who showed what, and when.
- **Settings screen:**
  - output configuration (mode, quality, fps, safe area, theme);
  - display-link management (copy, rotate);
  - Hub tokens (create, revoke);
  - PIN change (on the Hub).

### 7.1 Control shell: "MediaPort OS" (revision 4)

The control page (§7) and dock (§3.4) run inside one shell that behaves like a small operating system. Every feature in §7 stays; only the frame around it changes.

**Shell parts**
- **Menubar** (top): MediaPort mark, organisation switcher, "Arrange windows", connection status ("Online · Hub · 3 screens"; tap for details), presence avatars, search (Ctrl/⌘ K), theme quick-switch, activity log, clock.
- **Desktop:** each feature is an app in its own window: **Program** (the three output previews, TAKE / CLEAR / NEXT), **Library** (227 templates, 17 categories, search, a slot thumbnail per card), **Editor**, **Running Order**, **Speaker Timer**, **Outputs & Links**, **Themes**.
  - Windows can be dragged, resized, minimised, maximised (double-click the title bar) and closed. Layout is saved per device (`localStorage`, convenience only).
  - **Arrange** tiles the core five: Program top-left, Editor and Timer under it, Library and Running Order on the right.
  - The Program window gets a moving border beam while anything is on air, so "live" is visible at a glance.
- **Dock** (bottom): one icon per app, magnifies on hover (pointer devices only), dot under open apps. Tapping the focused app's icon minimises it.
- **Resizing:** every window resizes from all four edges and four corners (minimum 320 × 200 px). Each title bar has A− / A+ to change text size in that window only (80–140 %). Sizes and text sizes are saved per device with the layout.
- **Interface size** (Themes app): Small, Standard, Large, Extra large. It sets the default text size for every window and the dock icon size (46–70 px). A window's own A− / A+ choice overrides it until the interface size changes again.
- **Command palette** (Ctrl/⌘ K): open apps, switch themes, find any of the 227 templates by name, number or category.
- **Toasts** for timer warnings, link rotation and connection changes. Each is also written to the activity log.

**Organisations app (platform owner only)**
- Opened from the organisation switcher ("Add organisation…", "Manage organisations") or Ctrl/⌘ K. It's the shell form of the `/platform` area (§3.3), still behind Cloudflare Access.
- **List:** every organisation with its address, location, starter pack and status. Actions: Open, Suspend / Reactivate, Delete. The seeded organisations (`photizo`, `rccg-tog`) can't be deleted from here.
- **Add form:** name, short name (shown on graphics), address slug, on-air location, time zone, website, motto, lead minister or host and title, departments, starter pack (Church, Conference, General organisation), and four brand colours (primary, accent, highlight, text) with six presets.
  - The slug fills in from the name and can be edited. It must be 2–32 lowercase letters, numbers or hyphens, unique, and not reserved (`platform`, `api`, `o`, `control`, `dock`, `hub`, `admin`, `static`, `assets`).
  - The deep shade and the fire colour are derived from the four chosen colours.
  - A live contrast check shows text-on-primary (needs 4.5:1) and accent-on-dark (needs 3:1) and warns when they fail.
  - A live preview shows a lower third, the watermark and a location banner in the new brand.
- **Create** makes the organisation, seeds its room with the starter pack's running order and a speaker timer, and switches to it.
- **Suspend** stops that organisation's links and sign-in. **Delete** needs the slug typed exactly and removes everything, including R2 media and D1 rows.
- On the real platform, creating an organisation also invites its first Owner by email. The prototype keeps new organisations in the browser only.

**Responsive rules (requirement 7 comes first)**
- **Desktop (≥ 1000 px):** free windows.
- **Tablet (760–1000 px):** Arrange tiles Program across the top, Editor and Running Order under it. Library and Timer open as large centred windows.
- **Phone (< 760 px):** one app at a time, full screen. The dock becomes a scrolling bottom tab bar. No dragging.
- **OBS dock (`/{org}/dock`)** doesn't use the shell. It stays the compact single column from §3.4, because a 300–500 px panel can't hold windows.
- Touch targets stay ≥ 48 px for TAKE, CLEAR, NEXT/PREV and the output chips. Window controls are secondary and may be smaller, with a ≥ 24 px hit area.

**Themes: 30, in three groups**
- **Light (10):** Daylight, Porcelain, Mint Studio, Sky Glass, Sakura, Citrus, Lavender Mist, Arctic, Sandstone, Pure Light.
- **Dark (10):** Photizo Fire, Royal, Obsidian, Neon Ring, Carbon, Deep Ocean, Ember, Aurora, Graphite Mono, Nebula.
- **Balanced (10):** Dusk, Slate, Storm, Olive Grove, Clay, Twilight Steel, Moss, Harbor, Mauve, Fog. These are mid-tone surfaces with lower glare for long services.
- Each theme is 10 tokens: background, three wallpaper colours, glass surface, solid surface, text, muted text, accent, second accent. Text on the accent is picked automatically by luminance.
- The default follows the device: a dark system gets Photizo Fire (or the organisation's own dark theme), a light system gets Daylight. A user's choice is remembered per device.
- **Hard rule: shell themes never touch on-air output.** OBS, FreeShow and Stage graphics use only the organisation's brand-kit tokens (§3.3, §10). The output previews inside the shell render with brand tokens, not shell tokens. Visual tests must prove that switching shell theme leaves output pixels unchanged.
- Each organisation admin can set a default shell theme for their team (Settings → Brand). This is optional and users can still override it.

**Motion and effects (a plain-CSS synthesis of Magic UI-style patterns)**
- Magic UI is React/Tailwind/Framer Motion, and this build is Preact with plain CSS (§3.1). So its patterns are re-implemented in CSS, not imported:
  - **border beam:** an `@property` angle and a masked conic gradient, on the live Program window;
  - **shimmer button:** TAKE;
  - **spotlight card:** a pointer-tracked radial gradient on Library cards;
  - **marquee:** the ticker template;
  - **dot pattern and a 3D perspective grid floor:** wallpaper;
  - **blur-fade / 3D-tilt window open:** windows;
  - **dock magnification.**
- Gradient-text wordmark in the menubar.
- **Reduce effects** switch (Themes app, remembered per device): turns off blur, wallpaper motion, beam, shimmer and sweeps, and uses solid surfaces. It's on automatically when the control page's own frame time goes over budget (the same p95 > 20 ms rule as §11), and always under `prefers-reduced-motion`.
- The shell budget is separate from the overlay budget: **≤ 90 KB gzipped JS** for the shell plus apps, with each app's code split.

**Acceptance (added to Phase 1b)**
- The shell works on iPad Safari, Android Chrome and a basic Windows laptop. Arrange, minimise and maximise work, and on a phone it's one app at a time.
- All 30 themes pass WCAG AA contrast for body text and controls on their own surfaces. Checked automatically.
- Switching shell theme leaves the OBS, FreeShow and Stage output pixels unchanged.
- An operator who has never seen it can find a template with Ctrl/⌘ K and TAKE it in under 15 seconds.

---

## 8. Camera frames (#76–93, #26, #86–90, #98, #144)

- The overlay never handles camera video. **OBS carries the cameras.** Frames are branded panels and borders with transparent holes, plus labels.
- Each frame preset exports its holes in 1920×1080 pixels, for example `pip: [{x:1380,y:700,w:480,h:270}]`.
- The control page shows these numbers with a "Copy OBS transform" button, and `SETUP-OBS.md` explains how to place camera sources under the overlay. Keep the hole coordinates identical across themes, so changing theme never needs any OBS change.
- **Guest video call (#90):** the frame is the same; the call window (for example a Zoom or Teams capture, or VDO.Ninja) is an OBS source under the hole.

---

## 9. FreeShow specifics

- **Setup:** in FreeShow, create an **Overlay**, add a **Website item** filling 1920×1080 with the FreeShow display link, and set the overlay to show on the outputs that need it.
- **Test first (in Phase 0, before any template design):** does FreeShow render the page with a transparent background over slides? Use a plain static test page (a transparent background with one coloured box) on the church's actual FreeShow version, on Windows and Mac if both are used. Record the FreeShow version and the result in `SETUP-FREESHOW.md`.
  - **Yes:** use `mode: overlay`.
  - **No:** use `mode: fullframe` for the FreeShow output. Each fullscreen graphic then gets an opaque branded background, and lower thirds sit on a branded strip instead of over the slide. That's a per-output setting, so OBS stays transparent.
- FreeShow's own lyric and slide system can still be used. Our lyrics templates are mainly for OBS consistency, and for FreeShow when the team prefers one control point.
- Don't rely on FreeShow refreshing: the page updates itself through its live connection.
- **Stage output:** the `stage` link can be opened on any screen or browser (a confidence monitor or a tablet on the pulpit), or as a FreeShow stage layout's website item if supported.

---

## 10. Design system and brand

- **Brand images:** the owner will supply them, per organisation. Put them untouched in `/brand/{org}/source/`. Then:
  - generate optimised WebP/AVIF and transparent PNGs into `/brand/{org}/processed/`, and upload them to R2 under `orgs/{org}/brand/`;
  - extract the palette;
  - check contrast.
  - For Photizo, also use the existing Photizo logo pack (3D gold, chrome, royal blue, neon ring; Photizo Nation and Photizo Fire Global marks). Ask the owner for its files if they aren't in the brand upload.
- **Each organisation's default theme comes from its brand kit (§3.3).** The Photizo organisation's theme is **"Photizo Fire"**:
  - deep violet `#0b0618` / `#1d1238`, gold `#f7ba49`, fire orange `#ff8a3d`, magenta `#e0337f`, light text `#f4efff`;
  - glass panels at 12–18% white with blur only in Full (Lite uses a solid tint, since blur is expensive);
  - a gold light-sweep accent.
- **Built-in themes available to every organisation** (switchable per output, same layouts; each one picks up the organisation's logo and accent colour):
  - "Royal" (navy and gold);
  - "Pure Light" (white panels, violet text, good for daytime projection);
  - "Sober" (charcoal and silver), used automatically by memorial and remembrance presets.
- **Typography:**
  - a strong display font for titles and a highly legible sans for body text, both bundled as WOFF2 and open-licence (for example Fraunces or Playfair Display, and Outfit or Inter; check the licences);
  - lower-third name 44–56 px, title 28–34 px, full-screen verse 54–72 px with auto-fit (shrink to fit, never overflow; split into pages beyond the maximum length);
  - text stroke and shadow tuned for readability over any camera image.
- **Motion:**
  - entrances 450–700 ms with an ease-out-back feel and a 3D tilt;
  - exits 300–400 ms;
  - light sweep every 6–8 s on idle lower thirds (Lite: CSS gradient mask);
  - honour `prefers-reduced-motion` and a per-output "Reduce motion" setting.
- **Safe areas:** title-safe 5% inset by default on the FreeShow and Stage outputs, 0–3% on OBS.

---

## 11. Performance (basic computers)

- **Lite is the default.**
  - Animate only `transform` and `opacity`.
  - Use `will-change` only during animation.
  - No `backdrop-filter`, no large blur filters, no WebGL.
  - Particles and embers come from short pre-rendered WebM-with-alpha loops (VP9), at most one playing at a time.
- **Auto quality:** measure frame time for 3 s after load and after each Take. If the 95th percentile exceeds 20 ms, drop to Lite and/or 30 fps, and report it in the control page's output status.
- **Pause** all idle animation loops when no item is on air (important for OBS CPU).
- **Budgets** (test machine profile: Chrome with 4× CPU throttling as a proxy, plus a real low-end laptop in Phase 4):
  - Lite overlay bundle ≤ 120 KB gzipped JS plus fonts;
  - first render ≤ 1 s on LAN;
  - steady state ≤ 10% of one CPU core with one lower third on air;
  - no memory growth over 3 hours (a soak test).
- **OBS settings** to document: Browser Source 1920×1080, FPS 30 or 60 to match the output, "Shutdown source when not visible" **off**, "Refresh browser when scene becomes active" **off**. Hardware acceleration for browser sources is on by default (Settings → Advanced); explain how to check it.

---

## 12. Security and secrets

- **Never commit secrets.** That covers the Hub PIN, Hub tokens, display keys, Cloudflare tokens and any API keys.
- **Hub PIN:**
  - each organisation sets its own Hub PIN. The first organisation's owner has already chosen one. **Don't hardcode any PIN, don't write it in code, tests, docs or commit messages, and don't put it in a config file.**
  - The Hub asks for a PIN at first run (the owner types it), then stores only an **scrypt hash** in its local data folder.
  - Changing it requires the current PIN, from the control page on the Hub.
  - Lock out for 60 s after 5 wrong attempts.
  - Hub control sessions use an HttpOnly cookie, expire after 12 hours, and are scoped to LAN origins.
- **Cloud control:**
  - MediaPort's own sign-in (§3.3): Google OAuth (state and PKCE checked) or email one-time code (6 digits, 10-minute expiry, rate-limited, hashed at rest);
  - role checks on every API call and WebSocket message;
  - `/platform` is additionally behind Cloudflare Access for the platform owner only.
- **Organisation isolation** is tested (§3.3); a cross-organisation access test is part of every phase's acceptance.
- **Dock sessions** (device-link) are Operator role only, revocable, and listed under Settings → Devices.
- **Display links** are read-only, use 128-bit keys, and can be rotated. Display WebSockets reject any write messages.
- **Hub token** (Hub ↔ cloud): created in cloud control, shown once, stored hashed in D1, and revocable.
- **The Hub listens on the LAN only.** Document that it must never be port-forwarded. Allow-list request origins to the Hub's own addresses.
- **Content:** escape all text (no HTML injection from fields); URLs http(s) only; QR codes generated locally.
- **Safeguarding:** see #149. No children's photos by default; a consent tick is required for a child's name.

---

## 13. Build phases and acceptance checks

Stop after each phase, deploy or package, and give the owner a short report with screenshots.

**Phase 0: setup**
- Create the repository with its CLAUDE.md.
- Create the repository under the owner's **personal GitHub account**, with its CLAUDE.md.
- Confirm that `koladelawal.org` is an active zone on the owner's **personal Cloudflare account** (§2), and whether SQLite-backed Durable Objects are available on its plan.
- Set up the Worker `mediaport` on `mediaport.koladelawal.org`, with D1 `mediaport`, an R2 bucket `mediaport-media`, and a Durable Object class `OverlayRoom` (one per organisation).
- Build the organisation model, **Google sign-in**, invitations, roles, and `/platform` behind Cloudflare Access. (Email one-time codes move to Phase 1b, after the owner chooses an email service.)
- Seed the two organisations, `photizo` and `rccg-tog`.
- Connect Workers Builds to `main`.
- **Run the FreeShow transparency test (§9)** with a static test page, and report the result before any template design starts.
- **Acceptance:**
  - the platform owner creates a test organisation;
  - an invited user signs in with Google;
  - `/{org}/o/obs?k=` shows a transparent page;
  - the cross-organisation isolation test passes;
  - **the FreeShow transparency result is reported**, and the owner confirms `overlay` or `fullframe` for FreeShow.

**Phase 1a: prove the pipeline (small on purpose)**

The aim is to get one real graphic and one real timer onto OBS, FreeShow and Stage, end to end, as early as possible.
- Sync protocol (§4.2, including the id-keyed data shape), state, display caching, reconnect.
- Control page skeleton with Take, Clear and the per-output switches.
- Templates #33 Preacher ID, #46 Pastor, #94 LIVE Badge (manual), #99 Logo Watermark.
- The **speaker-timer engine** (§5.2, category 17) with one view: #222 Speaker Time Remaining, warnings on (this covers #116).
- Lite mode. Brand comes from the seeded organisation settings; there's no brand editor yet.
- **Acceptance:**
  - a Take appears in OBS in under 500 ms through the cloud;
  - the OBS, FreeShow and Stage switches work independently;
  - the timer passes its threshold, grace and overtime tests, with every screen showing the same second;
  - both organisations' brands render correctly on the same templates;
  - the display survives network loss without blanking;
  - the cross-organisation isolation test passes.

**Phase 1b: dock, brand editor, remaining core templates**
- The OBS dock view (§3.4) with device-link sign-in.
- Email one-time code sign-in (the owner's chosen email service).
- Brand kit editor with live preview (§3.3).
- The MediaPort OS control shell with its 30 themes (§7.1), including its acceptance checks.
- Templates #1, #16, #17, #31, #58, #109, #191, and the remaining nine timer presets #218–221 and #223–227.
- OBS and FreeShow setup guides.
- **Acceptance:**
  - the dock works inside OBS on Windows and Mac, including device-link sign-in;
  - an invited user signs in with an email code;
  - a brand change in the editor shows on air without reloading OBS;
  - all ten timer presets show the same running timer;
  - the visual tests pass;
  - the cross-organisation isolation test passes.

**Phase 2: complete catalogue + library**
- All 227 templates (§5.2), with per-organisation template customisation and starter packs.
- People, songs, Bible (offline KJV), announcements, settings, running order, presets.
- Calendar and live-status bindings.
- Themes and skins. Full mode effects.
- **Acceptance:**
  - the gallery page renders every template with its sample data;
  - every preset has a visual snapshot (transparent and fullframe);
  - Lite performance budgets are met.

**Phase 3: offline Hub**
- The Bun server, embedded build, mDNS, QR status page, PIN, local store, cloud bridge with op-log sync, asset mirroring.
- Windows and Mac binaries and the start-at-login option.
- **Acceptance:**
  - unplug the internet: OBS and FreeShow keep working and a tablet on Wi-Fi controls them;
  - plug it back in: edits made offline appear in the cloud, and cloud edits made meanwhile merge by the rules;
  - tested on Windows 10/11 and macOS (Apple silicon and Intel).

**Phase 4: test and hand over**
- A rehearsal on the church's real computers: OBS and FreeShow, a 3-hour soak test, and a basic-laptop performance check.
- Write the operator guide (one page per category, with screenshots) and a "Sunday checklist".
- Record a training walkthrough script.
- Update the project notes.
- **Acceptance:** the owner runs a full mock service from a tablet without help, once for Photizo and once for RCCG Throne of Grace, including the preacher timer on a pulpit tablet.

---

## 14. Testing

- **Unit:** state reducer, HLC ordering and conflict merge, Bible reference parser, lyric splitter, cal.js bindings, countdown and timer maths (including UK clock changes).
- **Sync:** simulate 3 controls and 4 displays with random disconnects; the final state must be identical everywhere.
- **Visual (Playwright, 1920×1080):**
  - a snapshot per preset × theme;
  - **transparency check:** the pixel alpha of empty areas must be 0 in overlay mode;
  - text-overflow check: no element exceeds its box at maximum sample text lengths.
- **Performance:** a Playwright trace for each of the 12 core templates in Lite under CPU throttling (frame-time p95), and a 3-hour soak with memory sampling.
- **Manual checklist:** OBS (Windows and Mac), FreeShow (Windows and Mac), iPad Safari, Android Chrome, a basic Windows laptop.

---

## 15. Deliverables

1. Repository `mediaport` (GitHub account confirmed by the owner), with `main` deployed to `mediaport.koladelawal.org`.
2. Hub binaries for Windows x64 and macOS (arm64 and x64) as GitHub Release assets, with a HUB-INSTALL.md.
3. Docs: SETUP-OBS.md, SETUP-FREESHOW.md, OPERATOR-GUIDE.md, ARCHITECTURE.md.
4. A template gallery page at `/{org}/control/gallery`, showing every template with sample data in that organisation's brand.
5. An "Add an organisation" guide for the platform owner, and a "Set up your brand" guide for organisation admins.
6. An update to the project notes (`photizo-live-overlays.md` in PHOTIZO - APPS, plus the RCCG project notes) recording addresses, IDs, how to deploy, how to rotate links, and how to reset the Hub PIN (delete the hash file locally, then set a new PIN at next start).

---

## 16. Open questions to raise with the owner (don't guess)

**Answered (23 November 2026):**
- Cloudflare: `koladelawal.org` is on the owner's separate personal Cloudflare account. Still to confirm in Phase 0: that its DNS is active on Cloudflare.
- GitHub: the `mediaport` repository goes under the owner's personal GitHub account (exact username to be confirmed in Phase 0).

**Answered in Phase 0 (23 November 2026):**
- `koladelawal.org` is an active zone on the owner's personal Cloudflare account. The Worker `mediaport` is deployed on `mediaport.koladelawal.org` with D1 `mediaport`, R2 `mediaport-media` and the SQLite-backed `OverlayRoom` Durable Object.
- Durable Objects work on the current plan (SQLite-backed Durable Objects are on the Workers Free plan). The $5-a-month Paid plan isn't needed unless usage passes the free daily limits.
- `/platform` access: the Worker requires a signed-in email listed in the `PLATFORM_OWNERS` secret. Cloudflare Access is an extra, optional layer: when `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are set, the Worker also verifies the Access token. This keeps `/platform` closed even before Access is configured.

**Decided in Phase 1a (23 November 2026):**
- The MediaPort OS shell (§7.1) is the real control page at `/{org}/control`. Team and invites moved to `/{org}/team`.
- The front end is plain ES modules served as Workers Static Assets (`apps/cloud/public/assets/`), not Vite + Preact (§3.1). The prototype was already plain JS and lighter than the Lite budget; a Preact port can come later without changing the protocol.
- `catalog.js` is the single source for the 227 templates, the renderer and the timer maths. The control previews, the display outputs and the room's seeding all import it.
- The room is server-authoritative: each operation is applied in arrival order and a fresh snapshot goes to every screen. Per-field HLC merging (§4.2) arrives with the offline Hub in Phase 3, where two writers can disagree.
- Fonts (Fraunces, Outfit, JetBrains Mono; OFL) are self-hosted under `/assets/fonts/`. No CDN.

**Still open:**
- Email-code sign-in (needed for Phase 1b): which email-sending service to use (Resend, or an organisation's own SMTP).
- RCCG Throne of Grace: location wording, departments, brand images and first team members.
- CCLI licence numbers, for #108 (one per organisation).
- Which department names and colours to use for #210.
- Whether FreeShow and OBS run on the same computer at Sunday services.
- The fonts the owner prefers, if any, beyond the brand images.
