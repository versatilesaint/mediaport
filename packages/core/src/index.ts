// Shared types and constants used by the cloud Worker, the Hub and the front end.

export const PROTOCOL_VERSION = 1 as const;

export const OUTPUTS = ['obs', 'freeshow', 'stage'] as const;
export type OutputId = (typeof OUTPUTS)[number];
export const isOutput = (v: unknown): v is OutputId => typeof v === 'string' && (OUTPUTS as readonly string[]).includes(v);

/** Organisation roles, highest first (brief §3.3). */
export const ROLES = ['owner', 'admin', 'producer', 'operator', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);
const RANK: Record<Role, number> = { owner: 5, admin: 4, producer: 3, operator: 2, viewer: 1 };
/** True when `have` is at least as powerful as `need`. */
export const roleAtLeast = (have: Role, need: Role): boolean => RANK[have] >= RANK[need];

export const STARTER_PACKS = ['church', 'conference', 'general'] as const;
export type StarterPack = (typeof STARTER_PACKS)[number];

/** Organisation address slugs: 2–32 lowercase letters, digits or hyphens, not starting or ending with a hyphen. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])$/;
/** First path segments the platform uses itself; no organisation may take them. */
export const RESERVED_SLUGS = ['platform', 'api', 'auth', 'invite', 'o', 'control', 'dock', 'hub', 'admin', 'static', 'assets', 'test', 'design', 'healthz', 'kits', 'help', 'guidelines', 'screen', 'studio'];

export interface OrgSettings {
  location: string;
  motto: string;
  departments: string[];
  website: string;
  connectors: { icalUrl?: string; liveStatusUrl?: string };
}

/** Messages on the room WebSocket (brief §4.2). Phase 0 implements hello, snapshot, ping/pong and error. */
export type ClientMessage =
  | { v: 1; type: 'ping'; t: number }
  | { v: 1; type: 'patch'; ops: unknown[] }
  | { v: 1; type: 'take'; itemId: string }
  | { v: 1; type: 'clear'; target: OutputId | 'all' }
  | { v: 1; type: 'next' }
  | { v: 1; type: 'prev' };

export type ServerMessage =
  | { v: 1; type: 'hello'; role: 'display' | 'control'; output?: OutputId; serverTime: number }
  | { v: 1; type: 'snapshot'; state: RoomState }
  | { v: 1; type: 'pong'; t: number; serverTime: number }
  | { v: 1; type: 'error'; code: string; message: string };

export interface RoomState {
  v: 1;
  items: Record<string, unknown>;
  updatedAt: number;
}

export const WRITE_MESSAGES = ['patch', 'take', 'clear', 'next', 'prev', 'page'] as const;
