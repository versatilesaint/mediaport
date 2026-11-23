# MediaPort

Live broadcast graphics for churches and organisations: 227 overlay templates for OBS, FreeShow and a Stage display, controlled from one page, online through Cloudflare or offline through a local Hub.

Live: https://mediaport.koladelawal.org

## Status: Phase 0
- Cloudflare Worker with D1, R2 and a per-organisation Durable Object room.
- Organisations, roles, invites, Google sign-in, platform admin at `/platform`.
- Read-only display links (`/{org}/o/{obs|freeshow|stage}?k=…`) that render a transparent page, with key rotation.
- FreeShow transparency test page at `/test/freeshow` (see `docs/SETUP-FREESHOW.md`).
- Isolation tests: `npm test`.

## Layout
- `apps/cloud`: Worker, Durable Object, D1 migrations.
- `packages/core`: shared types and protocol.
- `tests`: isolation and access tests.
- `docs`: build brief, deploy guide, FreeShow setup, control-shell prototype (`docs/design/mediaport-os.html`).
