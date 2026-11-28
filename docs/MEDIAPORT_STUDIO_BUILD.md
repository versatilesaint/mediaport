# MediaPort Broadcast Studio — Build & Upgrade Instructions for Claude Code

> **Target:** `https://mediaport.koladelawal.org/platform`
> **Purpose:** Build (or upgrade) a brand-neutral, multi-tenant live-graphics broadcast studio inside MediaPort: one web control room that drives OBS stream overlays, full-screen projector output (FreeShow), and a stage/speaker timer, plus a downloadable broadcast kit (templates, overlays, camera frames, backgrounds, stings, OBS scene collection).
> **Reference designs studied:** two church broadcast studios built on the same pattern (a sign-in-protected `/control` app + public Broadcast Kit). This spec takes their *feature set and geometry only*. **Do not copy their names, logos, colours, file names, or media.** Everything here is parameterised by an organisation's own brand.

---

## 0. Ground rules for Claude Code

1. **Audit before building.** `/platform` already exists behind Google sign-in (`/auth/google/start?next=/platform`, "Use the Google account your organisation invited"). Before writing code:
   - Map the repo: framework, routing, auth/session handling, database, hosting/deploy target, existing `/platform` pages.
   - Write `docs/STUDIO_AUDIT.md` listing what already exists vs. this spec, then work through the gaps in the phase order in §12.
   - **Reuse the existing stack and auth.** Don't replace Google sign-in or introduce a second auth system.
2. **Brand-neutral by construction.** No organisation name, colour, font or logo is hard-coded anywhere. All of it comes from a per-organisation **Brand Profile** (§2). Ship a neutral default profile ("MediaPort Default").
3. **Multi-tenant.** Every studio, template, asset, screen link and log entry is scoped to an `org_id`. A user only sees the orgs they were invited to.
4. **Canvas = 1920×1080** everywhere (16:9). Store all geometry in canvas pixels; scale at render time. Support 4K export of stills (3840×2160) by ×2.
5. **Small, reviewable commits**, one feature per commit, with tests. Update `docs/STUDIO_AUDIT.md` as items close.
6. **Ask the owner before:** changing the database schema in a destructive way, changing the auth flow, adding a paid service, or changing the deploy target.

---

## 1. Architecture

```
            ┌──────────────────────────── MediaPort /platform ─────────────────────────────┐
 Operator → │  Control Room (signed in, media-team role)                                   │
            │   ├─ Template library (01–18) ─ editor ─ queue                               │
            │   ├─ Playback: Show / Hide / Next / Prev  (+ keyboard)                       │
            │   ├─ Camera-frame designer + OBS position box                                │
            │   ├─ Brand Profile, Assets, Screen links, Activity log, Who's online          │
            └───────────────┬──────────────────────────────────────────────────────────────┘
                            │  realtime state channel (WebSocket / SSE), per org + studio
          ┌─────────────────┼──────────────────────┬──────────────────────────┐
          ▼                 ▼                      ▼                          ▼
   /screen/obs/:token  /screen/projector/:token  /screen/stage/:token   (optional) Link agent
   transparent bg,     full-screen slides,       speaker timer,          desktop helper: FreeShow →
   OBS Browser Source  FreeShow / any browser    confidence monitor      scripture import, OBS
                                                                         camera switching (§9)
```

**Realtime requirements (must meet):**
- Operator action → visible on every screen in **< 500 ms**.
- Screens are **view-only**, authenticated by an unguessable token in the URL (no login, because OBS browser sources can't log in).
- On network drop, screens **keep showing the last frame** and reconnect automatically with backoff; on reconnect they fetch full current state (not just deltas).
- State is server-authoritative: one `StudioState` document per studio, versioned (monotonic `rev`), so late joiners and reconnects converge.

**Stack guidance:** use what MediaPort already runs on. If there is no realtime layer yet, a good fit is a WebSocket hub with one room per studio (e.g. Cloudflare Workers + Durable Objects, or Socket.IO / native WS on the existing Node server, or a Postgres LISTEN/NOTIFY + SSE relay). Keep screen pages as static, dependency-light HTML/JS so they load fast inside OBS.

---

## 2. Brand Profile (replaces all hard-coded branding)

Per organisation, editable in **Settings › Brand**:

| Field | Notes |
|---|---|
| `name`, `short_name` | Used in text placeholders only |
| `colors.primary`, `colors.secondary`, `colors.accent`, `colors.surface_dark`, `colors.surface_light`, `colors.text_on_dark`, `colors.text_on_light`, `colors.live` (default red) | Validate contrast ≥ 4.5:1 for text pairs; warn if not |
| `fonts.heading`, `fonts.body`, `fonts.scripture` | Default to system-safe fonts (Arial / Arial Black / Georgia) so OBS and FreeShow machines render identically; allow uploaded webfonts |
| `logos.full_light`, `logos.full_dark`, `logos.mark_light`, `logos.mark_dark` | PNG/SVG with transparency. Rule: light ("white") logos on dark backgrounds & video, dark/colour logos on light backgrounds |
| `theme` | `standard` \| `sober` (muted palette, no sparkles/particles, slower easing — for funerals/solemn services) |
| `motion` | `full` \| `reduced` (crossfades only, no 3D, no loops) |
| `locale`, `timezone` | Default `en-GB`, `Europe/London`. All times shown in org timezone |
| `scripture_version` | Default a public-domain translation (KJV/WEB). Others only if the org records that it holds a licence |
| `ccli_number` | For the copyright bar |

Expose the profile to every renderer as CSS custom properties (`--brand-primary`, etc.). Every template, frame, background and sting must look correct with **any** profile — include a test fixture with three very different palettes.

---

## 3. Control Room (`/platform/studio/:studioId`)

### 3.1 Layout
- **Left:** template library (numbered 01–18, searchable, favourites).
- **Centre:** Preview (next) and Program (live) monitors rendered from the same renderer as the OBS screen, scaled down.
- **Right:** editor for the selected item + **queue** (run-of-show list, drag to reorder, items can be pre-loaded before service).
- **Bottom bar:** playback controls, current output status per screen (OBS / Projector / Stage: connected ●, last seen), On Air indicator.

### 3.2 Playback
- Buttons: **Show**, **Hide**, **Next**, **Prev**, plus **Hide All** (panic) and **Take** (preview → program).
- Large touch targets (≥ 44×44 px); works on a tablet.
- Keyboard: `Space` Show/Hide, `→`/`←` Next/Prev, `Esc` Hide All, **`Ctrl/Cmd+K` then template number** to jump to a template (command palette with fuzzy search), `1–9` fire queue items.
- Paged content (lyrics, scripture, scrolls) pages with Next/Prev; show `page n / N`.
- **Auto-fit:** long text shrinks to fit its box (binary-search font size between min/max), never overflows or clips.

### 3.3 Team & audit
- **Who's online** list (avatar, name, role, since).
- **Activity log**: every Show/Hide/edit/link regeneration with user and timestamp in org timezone; filter + CSV export.
- Roles: `owner`, `admin`, `operator`, `viewer`. Only `operator`+ can push to air. Access requires **both** a verified sign-in **and** membership of the org's media team; if either check fails the page stays closed (fail closed).

---

## 4. Template library (01–18)

Each template = `{ id, number, name, category, fields schema, layouts[], default animation, outputs[] }`. Render with HTML/CSS (not canvas) so text stays crisp and editable. Every template supports placements where relevant: **lower third**, **full screen**, **left/centre/right alignment**.

| # | Template | Fields / behaviour |
|---|---|---|
| 01 | **Worship / Lyrics** | Lower third, 1 or 2 lines per page; paste a song and auto-split into pages; Next/Prev paging; full-screen variant for projector |
| 02 | **Scripture** | Reference + verse text; lower third or full screen; auto-paginate long passages; import from FreeShow (via Link agent, §9) or type/paste; version label |
| 03 | **Sermon** | Sermon title, series, preacher name + role |
| 04 | **Names (name strap)** | Name, title, department; align left / centre / right |
| 05 | **Announcement card** | Kicker, heading, body, *When*, *Where*, optional image/QR |
| 06 | **Camera overlays** | The 17 camera frames (§5), controlled from here |
| 07 | **Live graphics** | LIVE badge, logo watermark/corner bug, copyright bar (song credits + CCLI licence number) |
| 08 | **Countdowns** | Service countdown to a local date/time (recurring weekly schedule supported); speaker countdown |
| 09 | **Welcome / Holding** | Starting Soon, Be Right Back, Ending — text + background + optional countdown |
| 10 | **Sermon points** | Numbered key points, revealed one at a time |
| 11 | **Giving / Call to action** | Heading, details, QR code generated from a URL |
| 12 | **Social & contact** | Handles, website, phone — rotating or static |
| 13 | **Prayer / Testimony** | Title + name (respect consent rules, §10) |
| 14 | **News ticker** | Scrolling ticker; items list; speed; loop; pause on Hide |
| 15 | **Title card / Bumper** | Full-screen title with background and sting-in |
| 16 | **Coming up / Event promo** | Event name, date, image; can rotate several |
| 17 | **Speaker timers** | Preacher, guest minister, finish-by (clock time), presentation, with warning thresholds, overtime (counts up, colour change) and grace period — **all share one timer engine** |
| 18 | **Announcement scrolls** | Channels: General, Weekly, Daily, News, Service Updates, **Emergency**. Emergency pre-empts everything and is never pushed off screen by other content until explicitly cleared |

> Templates 01–08, 14, 17, 18 mirror the reference studios; 09–13, 15, 16 fill the numbering gaps and are suggestions — confirm with the owner and keep numbers stable once published.

**Animations:** each template has in/out (slide, wipe, fade; ≤ 400 ms). With `motion: reduced` all become 200 ms fades. `theme: sober` swaps to muted palette and removes particle/sparkle effects.

---

## 5. Camera frames (17 layouts)

Branded frames with **see-through windows**; OBS places cameras *behind* the frame so they show through. Defaults: canvas 1920×1080, **margin 60**, **gap 24**. Geometry must be **computed** from margin/gap (not hard-coded) so the designer can change them; the table below is the default output and doubles as test fixtures.

| ID | Frame | Windows at default settings (X, Y, W×H) |
|---|---|---|
| F01 | Full Camera Frame | Cam1: 60,60, 1800×960 |
| F02 | Picture-in-Picture | Cam1: 0,0, 1920×1080 · Cam2: 1322,718, 538×302 |
| F03 | Dual Camera | Cam1: 60,290, 888×500 · Cam2: 972,290, 888×500 |
| F04 | Split Screen | Cam1: 60,60, 888×960 · Cam2: 972,60, 888×960 |
| F05 | Triple Camera | Cam1: 60,203, 1198×674 · Cam2: 1282,203, 578×325 · Cam3: 1282,552, 578×325 |
| F06 | Quad Multi-Camera | Cams1–4: x∈{116,972} × y∈{60,552}, each 832×468 |
| F07 | Camera + Scripture | Cam1: 60,60, 1030×960 (scripture panel fills remainder) |
| F08 | Camera + Lyrics | Cam1: 60,60, 1800×676 (lyrics band below) |
| F09 | Camera + Presentation | Slides: 60,182, 1272×716 · Cam1: 1356,182, 504×284 (+ caption) |
| F10 | Interview / Testimony | Cam1: 60,290, 888×500 · Cam2: 972,290, 888×500 (+ Name 1 / Name 2 labels) |
| F11 | Guest Video Call | Guest: 60,192, 1236×696 · Cam1: 1320,192, 540×304 (+ "Joining us from" label) |
| F12 | Vertical Camera | Cam1: 690,60, 540×960 (9:16) |
| F13 | Live Camera Border | Cam1: 30,30, 1860×1020 |
| F14 | Corners | Cam1: 30,30, 1860×1020 (corner brackets only) |
| F15 | Camera + Announcement | Cam1: 60,60, 1066×960 |
| F16 | Camera + Countdown | Cam1: 60,60, 1066×960 |
| F17 | Multi-Camera ID | as F06, plus per-camera ID labels |

**Requirements**
- Two looks per frame: **Bold** (thicker border, accent glow, optional 3D bevel) and **Flat** (thin line, no effects). Colour from Brand Profile.
- Labels on frames (e.g. "Live", "Speaker", "Guest", camera IDs) are **editable** and rendered live by the OBS screen, not baked in.
- **OBS position box**: for the selected frame + current margin/gap, show each window's X, Y, W, H with copy buttons, and the OBS steps: *Edit Transform → Position X/Y → Bounding Box Type "Scale to outer bounds" → width/height → tick "Crop to Bounding Box"*.
- **Automatic placement** setting: when enabled and the Link agent is running, OBS camera sources are moved/resized under the windows whenever the frame changes (via obs-websocket).
- Export per frame: `frame-<slug>-<bold|flat>.png` (transparent, 1920×1080), `frame-<slug>-<bold|flat>.webm` (animated border loop, VP9 + alpha), `.fsoverlay`.

---

## 6. Backgrounds, overlays & stings (generated from the Brand Profile)

Generate these **server-side or with a build script** (headless browser render → ffmpeg) so every org gets its own set automatically when the Brand Profile changes. All video with transparency = **WebM VP9 with alpha** (`yuva420p`).

| Asset | Spec |
|---|---|
| Motion background — standard | 1920×1080, **20 s seamless loop**, slow abstract gradient/light field in brand colours, ≤ 1 MB |
| Motion background — dark | Same, darker/lower contrast, for Scripture and quiet moments |
| Still backgrounds | Welcome, Lyrics, Scripture, Announcement, Sermon — each at **1080p and 4K JPG**, with clear empty space where text goes |
| Intro sting | **7 s**, transparent; logo enters, light burst, exits; auto-clears at 7 s |
| Transition sting (stinger) | **2.5 s**, transparent; full cover from 0.9–1.5 s; **OBS cut point 1.2 s** |
| Corner logo (animated) | 800×500, **12 s seamless loop**, transparent; plus static PNG |
| Lower third (animated) | **8 s loop**, transparent, **no baked-in text**; name box at 420,828 (880×84), title box at 420,922 (780×60); plus static PNG |
| Logo watermark | Transparent PNG, small mark variant |

- `theme: sober` set: desaturated colours, no light bursts/sparks, gentler stings.
- `motion: reduced`: still images substitute for every loop; stings become 0.5 s fades.
- Keep file sizes small (OBS machines are often modest); report sizes in the kit page.

---

## 7. Output screens

All three are public routes authenticated by token: `/screen/{obs|projector|stage}/:token`.

- **OBS screen:** transparent background, 1920×1080, intended as an OBS *Browser Source* (width 1920, height 1080, "Shutdown source when not visible" **off**, "Refresh browser when scene becomes active" **off**). Renders lower thirds, frames' live labels, tickers, countdowns, LIVE badge, corner logo, copyright bar.
- **Projector screen:** full-screen slides with backgrounds (lyrics, scripture, announcements, welcome) for FreeShow or any browser on the projector machine.
- **Stage screen:** large speaker timer (template 17), current/next item, optional message-to-speaker line; high contrast; colour states: normal → warning (amber) → overtime (red, counting up) → grace.
- **Screen links panel** (Settings › Screen links): copy link, QR code, **Regenerate** (instantly revokes the old token; connected screens with the old token show a neutral "link revoked" state), last-connected time per link.
- Optional **countdown page** usable without the studio: a standalone `countdown.html` with weekly schedule config at the top (`day: 0` = Sunday, 24-hour clock), included in the kit.

---

## 8. Broadcast Kit (`/platform/kit` + public per-org kit page)

Generated per organisation from the Brand Profile; downloadable as ZIPs:

```
<OrgShort>-Broadcast-Kit.zip        (everything)
<OrgShort>-OBS-Kit.zip
<OrgShort>-FreeShow-Kit.zip
<OrgShort>-Camera-Frames.zip

<OrgShort>/
  README.txt
  obs/
    <OrgShort>-Scenes-Windows.json
    <OrgShort>-Scenes-Mac.json
    countdown.html
    OBS-README.txt
  freeshow/
    *.fstemplate   *.fsoverlay
  backgrounds/   (1080p)   backgrounds/4K/
  overlays/      (stings, corner logo, lower third: .webm + .png)
  frames/        frames/freeshow/
  brand/         (logo variants)
```

### 8.1 OBS scene collection (generated JSON)
- Requires OBS Studio 30+; canvas and output 1920×1080.
- Default install paths baked into the JSON: `C:\<OrgShort>` (Windows) and `/Users/Shared/<OrgShort>` (Mac); README explains *Missing Files → Search Directory → Apply* if moved.
- Shared sources (edit once, update everywhere): `Camera 1–4`, `Slides`, `Guest`, `Studio Graphics` (Browser Source → OBS screen link), `[Overlay] Corner Logo`, `[Overlay] Lower Third` (hidden by default), `Countdown`, Stinger transition at 1.2 s.
- Scenes: **Starting Soon**, **Intro**, **Live**, **Sermon**, **Sermon Title**, **Announcements**, **Be Right Back**, **Ending**, plus one **`Frame • <name>`** scene per camera frame (17) with cameras pre-positioned under the windows → 25+ scenes.
- Optional NDI: note the free DistroAV plugin; add an NDI source above Camera in Live.
- Validate the generated JSON by importing it into a real OBS 30+ in CI if feasible, or at least against a captured known-good schema.

### 8.2 FreeShow
- Templates: Lyrics, Lyrics – Livestream (transparent), Scripture, Scripture – Motion, Scripture – Livestream (transparent), Announcement, Sermon, Welcome.
- Overlays: Corner Logo (animated + static), Lower Third, Intro Sting, Transition Sting, all camera frames.
- Target the FreeShow **1.6.x** import format; import via *File › Import › More options › Template / Overlay*. Fallback instructions if Overlay import is missing (new overlay → Media item → .webm).
- Livestream templates are for a **second FreeShow output with NDI enabled** feeding OBS.

### 8.3 Kit page
Previews each overlay on three backgrounds (transparent checkerboard, on lyrics background, on black); file table with sizes and specs; step-by-step setup guide ending with a **practice run**: show a lyric, a verse and a name, run the countdown and the stinger.

---

## 9. Link agent (optional desktop helper — Phase 5)

Small cross-platform app (Windows/macOS/Linux; e.g. Node or Go single binary) on the OBS/FreeShow computer, paired to a studio with a one-time code:
- Reads current Scripture from FreeShow and pushes it to the studio (template 02).
- Talks to OBS via **obs-websocket v5**: switch scenes/cameras, apply automatic frame placement.
- **Fail-safe:** if the agent goes quiet for **10 s**, the studio auto-hides agent-driven Scripture.
- Shows connection status in the Control Room bottom bar.

---

## 10. Security, privacy & safeguarding

- Fail closed: no studio access without verified sign-in **and** media-team membership.
- Screen tokens: ≥ 128-bit random, stored hashed, view-only, revocable; never expose operator APIs to screen tokens.
- Rate-limit control actions; CSRF protection on all mutations; strict CSP on screen pages.
- **Children:** photos of children are **off by default**; a child's name can only be shown when a consent tick is recorded on that item (store who ticked it and when).
- Scripture: public-domain version by default; licensed versions only with the org's licence recorded.
- Song lyrics: copyright bar must show song credits and the org's CCLI number when lyrics are on air; operators are responsible for licences — surface a reminder, don't block.
- Uploaded assets: validate type/size, strip metadata from images.

---

## 11. Accessibility & quality bar

- WCAG 2.2 AA for the Control Room; all actions keyboard-reachable; visible focus.
- Reduced-motion respects both the org setting and `prefers-reduced-motion` on the Control Room.
- Screen pages: no layout shift, no scrollbars, transparent body, 60 fps animations (CSS transforms/opacity only).
- Performance: OBS screen < 150 KB JS, first paint < 1 s on a mid-range PC.

---

## 12. Delivery phases & acceptance checks

| Phase | Scope | Done when |
|---|---|---|
| **1. Foundation** | Audit; org/studio/team data model; roles; Brand Profile; realtime hub; screen tokens & links panel | Two browsers + an OBS browser source stay in sync < 500 ms; regenerating a link revokes the old one immediately; non-team user is locked out |
| **2. Core templates** | 01–08, 17 (timer engine), Show/Hide/Next/Prev, Ctrl+K, auto-fit, queue, activity log, who's online | Operator runs a mock service from a tablet; long scripture auto-fits; stage timer goes warning → overtime → grace correctly |
| **3. Frames & assets** | 17 frames (Bold/Flat), designer, OBS position box; generated backgrounds, stings, corner logo, lower third | Default geometry matches §5 table exactly (unit tests); changing margin/gap recomputes all windows; assets regenerate on brand change |
| **4. Kit** | OBS JSON (Win/Mac), FreeShow templates/overlays, ZIPs, kit page, countdown.html | Clean OBS 30+ imports the collection with no errors after "Search Directory"; FreeShow 1.6.x imports all templates/overlays |
| **5. Extras** | 09–16, 18 (incl. Emergency pre-emption), sober theme, Link agent, automatic frame placement | Emergency scroll can't be displaced; agent fail-safe hides Scripture within 10 s of silence |

Test matrix: Chrome/Edge/Safari for Control Room; OBS 30+ browser source (Windows + macOS); three contrasting brand fixtures; reduced motion on/off; network-drop simulation (screens hold last frame, then resync).

---

## 13. First prompt to give Claude Code

> Read `MEDIAPORT_STUDIO_BUILD.md`. Audit this repository against it and write `docs/STUDIO_AUDIT.md` (what exists, what's missing, risks, proposed stack choices for realtime and asset generation). Don't change application code yet. Then propose the Phase 1 task list and wait for my go-ahead.
