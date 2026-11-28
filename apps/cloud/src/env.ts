import type { OverlayRoom } from './room';

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ROOM: DurableObjectNamespace<OverlayRoom>;
  /** Secret shared with the GitHub Actions kit builder (studio spec §6). Unset = the builder API is closed. */
  KIT_BUILD_TOKEN?: string;
  /** Secret: signs the short-lived OAuth cookie. */
  SESSION_SECRET: string;
  /** Set in the dashboard (kept by keep_vars). */
  GOOGLE_CLIENT_ID?: string;
  /** Secret. */
  GOOGLE_CLIENT_SECRET?: string;
  /** Secret: comma-separated emails allowed into /platform. */
  PLATFORM_OWNERS?: string;
  /** Optional: Cloudflare Access team domain (e.g. myteam.cloudflareaccess.com) and the /platform app's AUD tag. */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** "dev" only in .dev.vars for local testing. Never set in production. */
  ENVIRONMENT?: string;
}
