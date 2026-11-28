# MediaPort

Live broadcast graphics for churches and organisations: 227 overlay templates for OBS, FreeShow and a Stage display, controlled from one page, online through Cloudflare or offline through a local Hub.

Live: https://mediaport.koladelawal.org

## Website rooms
`/` Home (3D landing) · `/control` your studio · `/platform` sign in, organisations, team, screen links, brand · `/kits` broadcast kits · `/help` · `/guidelines`.
Studio spec: `docs/MEDIAPORT_STUDIO_BUILD.md`; audit and progress: `docs/STUDIO_AUDIT.md` (Phases 1–4 done).

## Status: Phase 1a in progress
- Control room (MediaPort OS) at `/{org}/control`: 227-template library, editor, running order, speaker timer, live OBS / FreeShow / Stage previews, 30 shell themes.
- Every change goes through the organisation's room and reaches all screens live; displays keep the last picture through network loss.
- Team and invites at `/{org}/team`.

### Phase 0
- Cloudflare Worker with D1, R2 and a per-organisation Durable Object room.
- Organisations, roles, invites, Google sign-in, platform admin at `/platform`.
- Read-only display links (`/{org}/o/{obs|freeshow|stage}?k=…`) that render a transparent page, with key rotation.
- FreeShow transparency test page at `/test/freeshow` (see `docs/SETUP-FREESHOW.md`).
- Isolation tests: `npm test`.

## Broadcast kits (Phases 3–4)
`kit/build.mjs` renders each organisation's kit in its own brand, packages it (`kit/package.mjs`: OBS scene collections for Windows and Mac, FreeShow templates and overlays, countdown page, four ZIPs) and uploads it to R2 through the Worker. It runs free on GitHub Actions every hour (`.github/workflows/kit-build.yml`) and needs the secret `KIT_BUILD_TOKEN` (32+ random characters) set both as a Worker secret and as a GitHub repository secret. Local run: `KIT_BUILD_TOKEN=… MEDIAPORT_URL=http://127.0.0.1:8787 FAST=1 node kit/build.mjs` (needs Playwright and ffmpeg).

## Layout
- `apps/cloud`: Worker, Durable Object, D1 migrations.
- `packages/core`: shared types and protocol.
- `kit`: brand-driven scene pages and the kit builder.
- `tests`: isolation and access tests.
- `docs`: build brief, deploy guide, FreeShow setup, control-shell prototype (`docs/design/mediaport-os.html`).
