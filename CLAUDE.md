# MediaPort: repository rules

Read `docs/MEDIAPORT-BUILD-BRIEF.md` before changing code. Build in the phase order in its §13 and stop at each phase's acceptance check for the owner to review.

## Deploying (brief §2)
- `main` always equals what is live. Deploys run through Cloudflare Workers Builds from `main`. The Cloudflare GitHub app must keep this repository selected; removing it silently stops deploys.
- `apps/cloud/wrangler.jsonc` must match the live Worker and keeps `keep_vars: true`, so dashboard-set variables and secrets survive deploys.
- `npm run deploy` applies D1 migrations, then deploys. Never edit an applied migration; add a new numbered file.
- Dashboard-API writes from Chrome automation get 403 from Cloudflare's firewall. Don't work around it: use wrangler, the dashboard's own forms, or ask the owner.
- Keep bundled assets small. Large media goes to R2 under `orgs/{orgId}/`.
- Location shown publicly comes from each organisation's settings. For Photizo it is "Scarborough, United Kingdom" only, never a street or venue address.

## Organisation isolation (brief §3.3)
- All D1 access goes through `apps/cloud/src/db.ts`. Organisation data is reached only through `OrgScope`, which binds `org_id` into every query. Never write a raw cross-organisation query elsewhere.
- One Durable Object room per organisation: `idFromName(org.id)`.
- `tests/isolation.test.mjs` must pass before every merge: `npm test`.

## Front end
- `apps/cloud/public/assets/catalog.js` is the single source for templates, graphics and timer maths. The shell (`shell.js`), the displays (`display.js`) and the room (`src/room.ts`) all import it. Keep it free of DOM access at module level so the Worker can import it.
- On-air graphics use only organisation brand tokens (`--bp --bd --ba --bf --bm --bl`), never shell theme tokens.
- The room is the only writer of on-air state. The shell sends operations and renders snapshots.

## Security (brief §12)
- Never commit secrets: Hub PINs, Hub tokens, display keys, Cloudflare tokens, OAuth secrets, API keys, or personal email addresses.
- Never hard-code a Hub PIN, or put one in code, tests, docs, commit messages or config files.
- Secrets live as Worker secrets: `SESSION_SECRET`, `GOOGLE_CLIENT_SECRET`, `PLATFORM_OWNERS`. `GOOGLE_CLIENT_ID` is a dashboard variable.
- `ENVIRONMENT=dev` exists only in the git-ignored `.dev.vars`. It enables `/auth/dev`, which also refuses any host but localhost.
- Display links are read-only with 128-bit keys and can be rotated. Display WebSockets reject writes.
- State-changing requests must pass the same-origin check. Escape all user text in HTML.
- Children: no photos by default; a child's name needs the "parental consent recorded" tick (template #149).
