# Deploying MediaPort

| Resource | Name |
|---|---|
| Worker | `mediaport`, custom domain `mediaport.koladelawal.org` |
| D1 | `mediaport` |
| R2 | `mediaport-media` |
| Durable Object | `OverlayRoom` (SQLite-backed, one per organisation) |

## Workers Builds (automatic deploys from `main`)
In the Cloudflare dashboard: Workers & Pages → `mediaport` → Settings → Build → connect `versatilesaint/mediaport`.
- Branch: `main`
- Root directory: `/`
- Build command: `npm ci`
- Deploy command: `npm run deploy` (bundles `apps/cloud/public/assets` into the Worker, applies D1 migrations, deploys)
- The build's API token needs Workers Scripts Edit and D1 Edit (the dashboard's "Create new token" option gives both).
- Check it works: every commit on `main` gets a Cloudflare build check on GitHub, and https://mediaport.koladelawal.org/kits shows the Broadcast kits page. "Not found" there means the live Worker is an old deploy.

`KIT_BUILD_TOKEN` (Secret, 32+ random characters) must have the same value here and in GitHub → Settings → Secrets and variables → Actions. The "Kit builder" commit status on GitHub says whether it matches.

## Settings to add in the dashboard (Workers & Pages → mediaport → Settings → Variables and Secrets)
| Name | Type | Value |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Text | From Google Cloud Console → Credentials → OAuth client (Web application) |
| `GOOGLE_CLIENT_SECRET` | Secret | Same OAuth client |
| `PLATFORM_OWNERS` | Secret | The Google email(s) allowed into `/platform`, comma separated |
| `SESSION_SECRET` | Secret | Already set. Changing it only cancels in-progress sign-ins. |
| `KIT_BUILD_TOKEN` | Secret | Random, 32+ characters; same value as the GitHub Actions secret |

Google OAuth client settings: authorised redirect URI `https://mediaport.koladelawal.org/auth/google/callback`.

Optional: protect `/platform*` with a Cloudflare Access application, then set `ACCESS_TEAM_DOMAIN` (e.g. `yourteam.cloudflareaccess.com`) and `ACCESS_AUD` (the application's AUD tag). The Worker then also requires a valid Access token there.

## Rotating display links
Control page → Display links → Rotate key. The old link stops at once; paste the new one into OBS or FreeShow.

## Local testing
`npm install`, then `npm test`. It starts a local Worker with a local database and runs the isolation tests. No Cloudflare account is used.
