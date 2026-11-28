# MediaPort Broadcast Studio: audit against `MEDIAPORT_STUDIO_BUILD.md`

Audit date: 28 November 2026 · Repository `versatilesaint/mediaport` at `064bfd6` (live on `main`).
Compared with: the new spec `docs/MEDIAPORT_STUDIO_BUILD.md` (the "studio spec") and the existing
`docs/MEDIAPORT-BUILD-BRIEF.md` (the "build brief", Phase 1a in progress). No application code was changed.

Status key: **Done** · **Partial** · **Missing** · **Conflict** (the two documents disagree; owner decides).

---

## 1. What MediaPort is today

| Area | Today |
|---|---|
| Hosting | One Cloudflare Worker `mediaport` on `mediaport.koladelawal.org`; D1 `mediaport`; R2 `mediaport-media`; SQLite-backed Durable Object `OverlayRoom`, one per organisation (`idFromName(org.id)`). Workers Builds deploys `main`; `npm run deploy` applies D1 migrations first. |
| Front end | Plain ES modules served as static assets (`apps/cloud/public/assets/`): `shell.js` (control "MediaPort OS", 504 lines), `display.js` (screens, 85), `catalog.js` (templates + renderer + timer maths, 386), `graphics.css` (on-air look, 120), `shell.css`. Self-hosted fonts (Fraunces, Outfit, JetBrains Mono). No build framework. |
| Auth | Google sign-in with server sessions (hashed cookie ids); invitations by link; roles `owner > admin > producer > operator > viewer`; `/platform` for platform owners (`PLATFORM_OWNERS` secret) with optional Cloudflare Access check; `/auth/dev` only with `ENVIRONMENT=dev` on localhost. |
| Multi-tenant | `orgs`, `users`, `memberships`, `invites`, `sessions`, `display_keys`, `audit` tables; all org data through `OrgScope` in `db.ts`; isolation tests in `tests/isolation.test.mjs`. Two seeded orgs: `photizo`, `rccg-tog`. |
| Studio | `/{org}/control`: 227 named templates in 17 categories, editor, running order, speaker timer, live previews of OBS / FreeShow / Stage, 30 shell themes, team page `/{org}/team`. |
| Screens | `/{org}/o/{obs\|freeshow\|stage}?k=KEY`: read-only, rotatable 128-bit keys, keep the last picture through network loss. |
| Room | Server-authoritative: applies `item.upsert, take, clear, clearOut, updateLive, roGo/next/prev, ro.add/remove, timer.*, output`; snapshot to every screen; activity log; presence. Role checks per operation. |
| Brand | Per-org JSON in `orgs.settings.brand` with six colours (`p d a f m l` → `--bp --bd --ba --bf --bm --bl`), a text **mark** (e.g. "P", "TG"), lead person, location. **No logo images, no fonts per org, no brand editor yet** (build brief Phase 1b). |

---

## 2. Gap table: studio spec vs the code

### §0–1 Ground rules and architecture
| Spec item | Status | Notes |
|---|---|---|
| Reuse the existing stack and Google sign-in | **Done** | Keep as is. |
| Multi-tenant, everything scoped by `org_id` | **Done** | Keep `OrgScope`; new tables must follow it. |
| Canvas 1920×1080, geometry in canvas px, 4K stills ×2 | **Partial** | Screens render a 1920×1080 stage; no 4K still export. |
| Realtime < 500 ms, view-only token screens, keep last frame, full resync | **Done** | Room snapshots on every change. Measure < 500 ms in a test (none yet). |
| Versioned state (`rev`) | **Partial** | `updatedAt` only. Add a monotonic `rev` to snapshots (cheap). |
| Studio address `/platform/studio/:studioId` | **Conflict** | Studios live at `/{org}/control`; `/platform` is the platform-owner admin. One studio per org today. See decision D1. |
| Screen address `/screen/{obs\|projector\|stage}/:token` | **Conflict** | Today `/{org}/o/{obs\|freeshow\|stage}?k=`. Existing OBS/FreeShow machines already use these links. See D1. |

### §2 Brand Profile
| Item | Status | Notes |
|---|---|---|
| name, short_name | **Done** | `orgs.name`, `short_name`. |
| 8 colour roles with contrast check | **Partial** | 6 colours, different names, no contrast validation. Map: `primary=p, surface_dark=d, accent=a, live=f(?)/new, secondary=m, text_on_dark=l`; add `surface_light`, `text_on_light`, `live`. |
| fonts.heading/body/scripture | **Missing** | On-air uses shell fonts; spec wants system-safe defaults plus optional uploads. |
| 4 logo variants (PNG/SVG) | **Missing** | Only a text mark. Needs R2 upload under `orgs/{orgId}/brand/`, type/size checks, metadata stripping. |
| theme standard/sober, motion full/reduced | **Partial** | A "sober" card exists for memorial templates only; output `quality` lite/full exists; no org-level sober/reduced. |
| locale, timezone | **Done** | `orgs.tz`, `orgs.locale`. |
| scripture_version, ccli_number | **Missing** | Copyright bar says "set in Settings" but no field. |
| Brand editor in Settings | **Missing** | Planned in build brief Phase 1b. |
| Three-palette test fixture | **Missing** | |

### §3 Control Room
| Item | Status | Notes |
|---|---|---|
| Library left, editor right, queue | **Done** | MediaPort OS shell. Favourites: **Missing**. |
| Preview (next) and Program (live) monitors | **Partial** | Live previews of each screen exist; no separate Preview → **Take** step. |
| Show / Hide / Next / Prev / Hide All | **Done** | `take`, `clear`, `clearOut`, `next/prev` on the running order. |
| Take (preview → program) | **Missing** | |
| Keyboard: Space, ←/→, Esc, Ctrl/Cmd+K → number, 1–9 | **Partial** | Ctrl/Cmd+K exists; check the full set and add what's missing. |
| Paged content with "page n / N" | **Missing** | Lyrics are fixed line fields; scripture is one block. |
| Auto-fit (binary search font size) | **Missing** | Text can overflow on long input. |
| Who's online | **Partial** | Presence in the room/shell; no roles/"since". |
| Activity log, filter, CSV export | **Partial** | Room log and `audit` table; no filter or CSV. |
| Roles owner/admin/operator/viewer, fail closed | **Done** (+`producer`) | Keep `producer`. |
| Rate limiting on control actions | **Missing** | |

### §4 Template library 01–18
The studio spec numbers **18 template types**; MediaPort numbers **227 templates in 17 categories** (the owner's
list). They describe the same thing at different levels: each spec type is a category or a component. **Decision D2.**

| Spec | MediaPort today | Status |
|---|---|---|
| 01 Worship/Lyrics (paste a song, auto-split pages, Next/Prev) | #1–15, component `lyrics` with 3 fixed line fields | **Partial**: no song paste, no paging |
| 02 Scripture (paginate, version label, FreeShow import) | #16–30, `scripture` | **Partial**: no pagination, no FreeShow link |
| 03 Sermon · 04 Names · 05 Announcement | #31–75, `title`, `lowerThird`, `card` | **Done** (basic); **Where** field and image/real QR **Missing** |
| 06 Camera overlays (17 frames) | #76–93, `frame` = a 2 px border and one fixed hole | **Missing** in substance (see §5) |
| 07 Live graphics (LIVE, watermark, copyright + CCLI) | #94–108 | **Partial**: CCLI field missing; watermark uses the text mark, not a logo |
| 08 Countdowns (to a local date/time, weekly schedule) | #109–120, counts from "minutes from Take" | **Partial**: no date/time target, no schedule |
| 09 Welcome/Holding · 15 Title card · 16 Coming up | #131–141, #154–164, #58–75 | **Partial** (generic cards) |
| 10 Sermon points (reveal one at a time) | `points` with "show how many" | **Done** (basic) |
| 11 Giving/CTA with QR from URL | #121–130 | **Partial**: `qr()` is a **decorative pattern, not a scannable QR code** — must be replaced |
| 12 Social & contact (rotating) | banners/cards | **Partial**: no rotation |
| 13 Prayer/Testimony (consent rules) | #142–153 | **Partial**: consent tick only mentioned in UI copy |
| 14 News ticker (pause on Hide) | #191 `ticker` | **Done** (basic) |
| 17 Speaker timers (one engine, warnings, overtime, grace) | #218–227, shared timer | **Done** |
| 18 Announcement scrolls incl. **Emergency pre-emption** | banners incl. "Emergency" names | **Missing**: no pre-emption rule; emergency can be pushed off |
| In/out animations; reduced motion 200 ms fades; sober theme | `.out` exit class; sweeps | **Partial** |

The renderer `G()` in `catalog.js` draws all 227 templates from ~20 generic layouts by component. That is fine for
Phase 1, but the spec's quality bar (per-template layouts, alignments, auto-fit, paging) needs a richer renderer.

### §5 Camera frames
| Item | Status | Notes |
|---|---|---|
| 17 frames with computed geometry (margin 60, gap 24) | **Missing** | Today one hard-coded hole at 1380,700,480×270 for any "picture/split/interview" frame. |
| Default geometry = spec table (unit tests) | **Missing** | A tested geometry engine exists in the sister studio (tog-broadcast `packages/core/frames.ts`): with margin 60 it already reproduces F02, F03, F05, F06, F12 exactly; F07/F08/F15/F16 are the same layouts at the spec's ratios (58 %, 72.2 %, 60 %, 60 %); F09/F11 need a "big + small 16:9" rule; F13/F14 use margin 30. Port it to plain JS in `catalog.js` (or a new `frames.js`). |
| Bold / Flat looks from the brand | **Missing** | |
| Live, editable labels | **Partial** | One "Camera label" field. |
| OBS position box + steps | **Missing** | |
| Automatic placement (Link agent) | **Missing** | Phase 5. |
| Export PNG / WebM / .fsoverlay per frame | **Missing** | Part of the kit (§8). |

### §6 Generated backgrounds, overlays and stings
| Item | Status |
|---|---|
| Motion backgrounds (standard, dark), 20 s loops ≤ 1 MB | **Missing** (CSS "background" template only) |
| Still backgrounds 1080p + 4K | **Missing** |
| Intro sting 7 s, transition stinger 2.5 s (cover 0.9–1.5 s, cut 1.2 s) | **Missing** (a CSS swipe "transition" template exists) |
| Corner logo 12 s loop + PNG; lower third 8 s loop + PNG | **Missing** |
| Regenerate on brand change; sober and reduced variants | **Missing** |

A proven pipeline exists in the sister kit (`versatilesaint/throne-of-grace-freeshow`): deterministic HTML scenes with
`renderAt(t)`, Playwright frame capture with 4 workers, VP9 + alpha encoding, alpha verification. It's currently
hard-wired to one brand and a logo image; it needs to read a Brand Profile instead.

### §7 Output screens
| Item | Status |
|---|---|
| OBS screen (transparent, lower thirds, frames, tickers, countdowns, LIVE, corner logo, copyright) | **Done** (basic graphics) |
| Projector screen with backgrounds | **Partial** (FreeShow output; `mode: overlay` confirmed by the transparency test) |
| Stage screen: big timer, current/next, message-to-speaker, colour states | **Partial**: timer and current/next exist; message-to-speaker **Missing** |
| Links panel: copy, **QR**, regenerate, **revoked state**, **last connected** | **Partial**: copy + rotate exist; QR, revoked screen state and last-connected **Missing** |
| Tokens stored hashed | **Conflict** | Keys are stored as issued so they can be copied again (migration 0001 comment). Hashing means a link can only be shown once. Decision D5. |
| Standalone `countdown.html` | **Missing** |

### §8 Broadcast Kit
**Missing entirely**: kit page, per-org ZIPs, OBS scene collections (Win/Mac), FreeShow `.fstemplate/.fsoverlay`,
countdown page, README files. The sister kit has working, tested generators for all of these (OBS importer
behaviour, FreeShow 1.6.x import format and its traps, zip size limits). They must be re-parameterised by Brand
Profile and served from R2 per organisation (not GitHub Pages, which can't be multi-tenant or private).

### §9 Link agent
**Missing.** The sister studio's link program (Bun-compiled, FreeShow REST polling, OBS WebSocket v5, fail-safe,
automatic camera placement, GitHub Release workflow) can be adapted: pairing by one-time code per org instead of a
single-tenant link token.

### §10–11 Security, accessibility, performance
| Item | Status |
|---|---|
| Fail closed (sign-in + media team) | **Done** |
| CSRF / same-origin on mutations | **Done** (repo rule) — verify on new endpoints |
| Rate limiting | **Missing** |
| Strict CSP on screen pages | **Partial** — verify headers |
| Child consent tick stored with who/when | **Missing** (UI copy only) |
| Public-domain scripture default; licence recorded | **Missing** (no field) |
| Upload validation + metadata stripping | **Missing** (no uploads yet) |
| WCAG 2.2 AA, keyboard reach, reduced motion | **Partial** — needs an audit pass |
| OBS screen < 150 KB JS, first paint < 1 s | **Likely done** (~0.5k lines JS) — measure |

---

## 3. Risks

1. **Changing live links.** Moving screens to `/screen/...` or hashing keys would break every OBS/FreeShow machine
   already set up. Keep old links working (aliases) if addresses change.
2. **Two numbering systems.** Publishing "01–18" next to the owner's 227 numbers will confuse operators. Pick one
   public numbering (D2) before building more templates.
3. **Server-side asset generation on Cloudflare.** Rendering video needs a headless browser + ffmpeg. Workers can't
   run ffmpeg; Cloudflare Browser Rendering is a paid/limited service. A build job (GitHub Actions) that renders a
   kit per organisation and uploads it to R2 is cheaper and proven, but brand changes then take minutes, not seconds.
   **Paid service → ask the owner** (studio spec §0.6).
4. **Renderer rewrite.** Paging, auto-fit, alignments, frames and per-template layouts strain the compact `G()`
   switch. Split it into per-component modules while keeping `catalog.js` as the single entry point (repo rule).
5. **OBS/FreeShow file formats** were verified from their source code, not in real apps, in the sister project. CI
   can't run OBS easily; the spec's "import into real OBS in CI" is unlikely. Fallback: validate against the
   importer's rules (as the sister kit does) plus a manual check on the owner's machines.
6. **Phase overlap.** The build brief's Phase 1b (dock, email sign-in, brand editor, 30 themes) is in progress; the
   studio spec reorders work. Agree one phase list (proposed below) so nothing is half-built twice.

---

## 4. Proposed stack choices

| Concern | Choice | Why |
|---|---|---|
| Realtime | **Keep** the per-org Durable Object room + WebSockets; add `rev` | Already live and meets the latency target |
| Front end | **Keep** plain ES modules; split the renderer into modules under `assets/render/` | Repo decision (build brief §16) |
| Brand assets | R2 `orgs/{orgId}/brand/*` via an authenticated upload endpoint (type, size, dimension checks; strip EXIF by re-encoding through `createImageBitmap` in the browser before upload) | No new service |
| Frame geometry | Port the tested geometry engine to `assets/frames.js` (pure, importable by the Worker), defaults = spec §5 table | Shared by renderer, OBS box, kit and agent |
| Generated media + kit | `kit/` workspace with the scene/render pipeline and OBS/FreeShow builders, run by a GitHub Actions workflow per organisation (manual "Rebuild kit" button triggers it via `workflow_dispatch`), uploading ZIPs and previews to R2 `orgs/{orgId}/kit/`; kit page served by the Worker | Proven pipeline; no paid service; private per org |
| Link agent | Bun-compiled binaries from `apps/agent`, released by tag; pairing code issued per org | Proven pattern |

---

## 5. Decisions (owner, 28 November 2026)

**Decided:** approve all recommendations, with these corrections:
- **D1 → one website, rooms with a shared navigation tab bar:** `/` landing page (the 3D header), `/control` the
  studio, `/platform` signing in and adding organisations, `/kits` overlays, templates and downloads, plus **Help**
  and **Guidelines** tabs. Existing `/{org}/control`, `/{org}/team` and `/{org}/o/...` links keep working.
- **D2** keep the 227 numbers, grouped and numbered by category. **D3** free services only (GitHub Actions + R2).
- **D4** Phase 1 first. **D5** screen keys stay copyable (stored as issued). **D6** keep direct Show for now
  (Preview/Take in Phase 2). **D7** Help and Guidelines are their own tabs.

### Options that were put to the owner

- **D1 Addresses.** Keep `/{org}/control` and `/{org}/o/{output}?k=` (recommended), and add the spec's addresses as
  aliases? Or move to `/platform/studio/:id` and `/screen/...` with redirects from the old ones?
- **D2 Numbering.** Keep the 227 template numbers and present the spec's 01–18 as the category list (recommended), or
  renumber to 01–18 types with variants?
- **D3 Asset generation.** GitHub Actions build job per organisation → R2 (recommended, free), or a paid
  server-side renderer (Cloudflare Browser Rendering or a small VM) for instant regeneration?
- **D4 Phase order.** Use the merged phase list below (recommended), or finish the build brief's Phase 1b first?
- **D5 Screen keys.** Keep keys copyable (stored as issued, as today), or hash them (links shown once, as the spec says)?
- **D6 Preview/Take.** Add a Preview monitor with a separate Take step (spec), or keep direct Show (today)?
- **D7 Landing navigation.** Platform / How it works / For teams / Help: sections on the home page (recommended for now) or separate pages?

---

## 7. MediaPort's own brand (owner uploads, 28 November 2026)

Two uploads define **MediaPort the platform** (not any organisation's on-air brand). Stored in the repository:

| Upload | Stored at | Use |
|---|---|---|
| Favicon set (`favicon.ico/.svg`, 16/32 PNG, Apple touch 180, Android 192/512, `site.webmanifest`, theme colour `#0f1e2e`) | `brand/mediaport/favicons/` | Served from the site root on every MediaPort page (home, sign-in, `/platform`, control shell, team, kit). Display pages don't need them. |
| Logo + wordmark SVG (orange tile, "MP" mark with play triangle) | `brand/mediaport/mediaport-logo-wordmark.svg` | Header of the home page, sign-in and the shell; the favicon SVG is the navy-tile variant. |
| Design tokens (`port-orange #e8552b/#ef6a42`, `harbour-ink #0f1e2e`, `cream #f7f4ef`, `signal-teal #167f74/#2bb5a5`, surfaces, ink, muted, hairline; Inter; type scale; radii incl. `radius-mark` 28px at 120px) | `brand/mediaport/tokens.json` | Platform/shell UI only. **Never** on-air graphics: those use each organisation's Brand Profile (repo rule). |
| 3D landing header design ("Every clip, stream and slide. One port."; 3D extruded MP mark orbited by media cards, pointer tilt, hover pauses the orbit, Pause motion button, Open the platform / Sign in / Get started) | `docs/design/landing-header/` (design export + `preview.png`; the export's bundled React runtime is left out) | Becomes the public home page `/` for signed-out visitors. |

Notes and gaps:
- `/` today is a plain server-rendered page (`pages.ts` `homePage`) listing the user's organisations. Signed-out
  visitors should get the new landing header; signed-in users keep their organisation list (restyled with the
  tokens), or see the header with "Open the platform".
- The design export runs on React. Per the repo decision (plain ES modules, small bundles) it will be rebuilt in plain
  HTML/CSS with a small vanilla-JS module: CSS 3D for the extruded mark (stacked layers, both faces), orbiting cards
  on a CSS animation, pointer tilt, **Pause motion** button and `prefers-reduced-motion` respected, light/dark
  tokens, no external CDN (Inter self-hosted like the other fonts).
- The navigation links (Platform, How it works, For teams, Help) need destinations: decide whether they are
  sections on the home page or separate pages (decision **D7**).
- "Sign in with Google" and "Invite-only team access" match the current auth, so no flow changes.

---

## 6. Proposed Phase 1 task list (no code until approved)

Phase 1 = "Foundation" of the studio spec, adjusted to what already exists. One commit per task, each with tests;
`npm test` (isolation) green before every merge.

0. **MediaPort platform brand**: favicons at the site root (Worker serves them; `<head>` tags and manifest on
   every platform page); the 3D landing header rebuilt as plain HTML/CSS/JS for `/` (signed-out), organisation list
   restyled with the MediaPort tokens (signed-in); Inter self-hosted; reduced motion and Pause motion; visual test.
1. **Brand Profile v2** (migration `0004_brand_profile.sql`, additive): colour roles per spec (map today's six),
   fonts, `theme` (standard/sober), `motion` (full/reduced), `scripture_version`, `ccli_number`; contrast check with
   warnings; CSS custom properties `--brand-*` emitted alongside today's `--bp…` tokens (no on-air regressions).
2. **Logo uploads**: R2 `orgs/{orgId}/brand/{full_light,full_dark,mark_light,mark_dark}`; upload endpoint
   (admin+, same-origin, type/size/dimension checks, browser-side re-encode to strip metadata); watermark and
   lower-third mark use the logo when present, the text mark otherwise.
3. **Settings › Brand** editor with live preview on a sample lower third, lyric and frame; **three contrasting
   palette fixtures** in tests.
4. **State `rev`** on every snapshot; screens ignore older revs; test that late joiners converge.
5. **Screen links panel**: QR codes (a real QR encoder, also replacing the decorative `qr()` in templates),
   last-connected time per output, and a neutral "link revoked" screen when a rotated key reconnects.
6. **Addresses** per D1 (aliases + redirects if chosen), with tests that old links keep working.
7. **Rate limiting** of control operations in the room (per connection token bucket) and CSV export of the activity
   log with a filter.
8. **Latency and sync tests**: Playwright, two control browsers + an OBS-sized screen; Take → visible < 500 ms;
   rotate → old screen shows "revoked" immediately; non-member is locked out.

**Phase 1 acceptance (spec §12):** two browsers + an OBS browser source stay in sync < 500 ms; regenerating a link
revokes the old one immediately; a non-team user is locked out; the three palette fixtures render the sample
graphics legibly.

Then, pending D4: **Phase 2** core templates (paging, auto-fit, song paste, scripture pagination, countdown to
date/time, Emergency pre-emption, Preview/Take), **Phase 3** camera frames + generated assets, **Phase 4** kit,
**Phase 5** extras + Link agent.

---

## 8. Phase 1 status (28 November 2026): done

| Task | Result |
|---|---|
| 0 Platform brand and rooms | `/` 3D landing page; room bar on every page (Home, Control, Platform, Kits, Help, Guidelines); favicons + manifest; `/control` opens your studio; `/platform` signs in / lists organisations / owner admin; `/kits`, `/help`, `/guidelines` |
| 1 Brand Profile v2 | Nine colour roles, contrast warnings, fonts, standard / sober look, full / reduced motion, Bible version with licence rule, CCLI (`packages/core/src/brand.ts`) |
| 2 Logos | Four variants in R2; PNG/SVG only; metadata stripped; unsafe SVG refused; sandboxed serving |
| 3 Brand editor | Team page › Brand (admins): palettes, contrast pills, live preview with the on-air renderer, logo slots; changes reach screens live |
| 4 State `rev` | Monotonic version on every save; screens ignore late, older snapshots and resync on reconnect |
| 5 Screen links panel | Real QR codes (vendored `qrcode-generator`, MIT), connected now / last seen, two-step new link; a replaced link clears the screen and says so (`access_changed` message, then close) |
| 6 Addresses | Old `/{org}/…` links unchanged; room names reserved |
| 7 Rate limit, activity | 40 operations at once then 10 a second per control connection; Team › Activity with filter and spreadsheet-safe CSV in the organisation time zone |
| 8 Tests | `npm test`: 36 tests (isolation, room, brand, Phase 1 acceptance); files now run one at a time |

Also fixed: giving and registration cards now show a **real** QR code (card link, else the organisation website)
instead of a decorative pattern; a rotated link now reliably tells a connected screen (the close frame alone
was not always delivered through the local proxy).

**Acceptance (spec §12):** two control browsers + an OBS screen in sync in under 500 ms ✔; a new link revokes the
old one immediately ✔; a non-team user is locked out ✔; three contrasting palettes save and preview, weak
contrast warned ✔.

---

## 9. Phase 2 status (28 November 2026): core templates

| Spec item | Result |
|---|---|
| Paging (01 Lyrics, 02 Scripture) | Paste a whole song (verses by blank lines, 1–4 lines per page); passages split between words (170 / 380 characters); room `page` operation; Next / Prev, Space and arrows page first, then move the running order; "n / N" tag on air |
| Auto-fit | `fit()` in the shared renderer: binary search on font size for names, lyrics and Scripture; never overflows |
| 08 Countdowns | Minutes from Show, a set time (today / tomorrow, or a date), or the next of a weekly schedule, in the organisation time zone with clock changes |
| 18 Emergency pre-emption | #183 goes to every screen, drawn on top, never pushed off by other graphics; only Hide / Clear |
| Who's online | Name, role and since when |
| Preview / Program / Take (D6) | The studio already has the Program monitors and a TAKE button; the Editor shows the selected (next) graphic |
| Tablet | Studio checked at iPad Pro 11 landscape: Take, Prev / Next, per-screen switches all reachable |
| Tests | `tests/phase2.test.mjs` (paging, roles, passage split, countdowns incl. BST, emergency, presence); 42 tests pass |

Still to do in later phases: per-template layouts for the remaining generic templates, 09–16 refinements, sober theme for every graphic (Phase 5), camera frames and generated assets (Phase 3), kit (Phase 4), Link agent (Phase 5).

## Phase 3: camera frames and generated brand assets (done)

| Spec item | Result |
|---|---|
| 17 camera frames (§5) | `apps/cloud/public/assets/frames.js`: shared geometry for the renderer, the studio, the Worker and the tests. Default geometry matches the §5 table exactly; margin, gap, ratio, size, corner, side and band recompute every window. #228 Quad, #229 Camera + Announcement, #230 Camera + Countdown added to Camera overlays |
| Bold / Flat looks | Brand tokens only; evenodd SVG backdrop with real see-through windows; animated live border; corners; camera IDs |
| OBS positions | The editor shows each camera's position and size with copy buttons |
| Generated assets (§6) | `kit/scenes.html` and `kit/frames.html` render in the organisation's brand; `kit/build.mjs` captures with Playwright and encodes VP9 with alpha via ffmpeg: motion backgrounds (standard, dark; 20 s), stills (welcome, lyrics, Scripture, announcement, sermon; 1080p and 4K), intro sting (7 s), transition stinger (2.5 s, cut at 1.2 s), corner logo (12 s loop + PNG), lower third (8 s loop + PNG, no text), 34 frame PNGs, animated border WebM, `kit.json` with OBS positions. Sober theme: no rays or sparks; reduced motion: short fades |
| Free hosting | GitHub Actions (`.github/workflows/kit-build.yml`, hourly + manual) renders; the Worker stores files in R2 under `orgs/{orgId}/kit/{brandHash}/`; a brand change makes a new hash, so the kit is rebuilt and the old one removed |
| Security | `/api/kit-builder/*` needs the `KIT_BUILD_TOKEN` bearer secret (32+ characters, constant-time compare); downloads are members only; other organisations get 404 |
| Tests | `tests/frames.test.mjs`, `tests/kit.test.mjs`; builder run end to end against a local Worker (55 files) |

Owner action: set `KIT_BUILD_TOKEN` (any random 32+ character value) as a Worker secret (`npx wrangler secret put KIT_BUILD_TOKEN` in `apps/cloud`) and as a GitHub repository secret with the same name. Until both are set the kit builder does nothing.
