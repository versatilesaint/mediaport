// The only module that talks to D1. Organisation-owned data is reached through OrgScope,
// which binds org_id into every query, so code elsewhere can't write a cross-organisation query.

import { OUTPUTS, type OutputId, type Role, type OrgSettings, type StarterPack } from '../../../packages/core/src/index';
import { randomHex, sha256Hex } from './crypto';

export interface OrgRow {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  tz: string;
  locale: string;
  settings: string;
  pack: StarterPack;
  status: 'active' | 'suspended';
  created_at: number;
}
export interface Org extends Omit<OrgRow, 'settings'> {
  settings: OrgSettings;
}
export interface User {
  id: string;
  email: string;
  name: string | null;
}

const now = () => Date.now();
const parseOrg = (r: OrgRow | null): Org | null => (r ? { ...r, settings: JSON.parse(r.settings || '{}') as OrgSettings } : null);

// ---------- Platform-level (not organisation content) ----------

export const Platform = {
  async orgBySlug(db: D1Database, slug: string): Promise<Org | null> {
    return parseOrg(await db.prepare('SELECT * FROM orgs WHERE slug = ?').bind(slug).first<OrgRow>());
  },

  /** Metadata and usage only. The platform owner can't read an organisation's content unless invited (brief §3.3). */
  async listOrgs(db: D1Database) {
    const r = await db
      .prepare(
        `SELECT o.id, o.slug, o.name, o.short_name, o.status, o.pack, o.created_at,
                (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id) AS members
         FROM orgs o ORDER BY o.created_at, o.slug`,
      )
      .all();
    return r.results;
  },

  async createOrg(
    db: D1Database,
    o: { slug: string; name: string; shortName: string; tz: string; pack: StarterPack; settings: OrgSettings },
  ): Promise<Org> {
    const id = 'org_' + randomHex(8);
    await db
      .prepare('INSERT INTO orgs (id, slug, name, short_name, tz, settings, pack, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id, o.slug, o.name, o.shortName, o.tz, JSON.stringify(o.settings), o.pack, 'active', now())
      .run();
    return (await Platform.orgBySlug(db, o.slug))!;
  },

  async setOrgStatus(db: D1Database, orgId: string, status: 'active' | 'suspended') {
    await db.prepare('UPDATE orgs SET status = ? WHERE id = ?').bind(status, orgId).run();
  },

  async deleteOrg(db: D1Database, orgId: string) {
    // D1 enforces foreign keys, so child rows go with the organisation.
    await db.batch([
      db.prepare('DELETE FROM memberships WHERE org_id = ?').bind(orgId),
      db.prepare('DELETE FROM invites WHERE org_id = ?').bind(orgId),
      db.prepare('DELETE FROM display_keys WHERE org_id = ?').bind(orgId),
      db.prepare('DELETE FROM orgs WHERE id = ?').bind(orgId),
    ]);
  },

  async audit(db: D1Database, userId: string | null, action: string, detail?: string, orgId: string | null = null) {
    await db.prepare('INSERT INTO audit (org_id, user_id, action, detail, at) VALUES (?,?,?,?,?)').bind(orgId, userId, action, detail ?? null, now()).run();
  },
};

// ---------- Users and sessions ----------

export const Users = {
  async upsertByEmail(db: D1Database, email: string, name: string | null): Promise<User> {
    const e = email.trim().toLowerCase();
    const found = await db.prepare('SELECT id, email, name FROM users WHERE email = ?').bind(e).first<User>();
    if (found) {
      if (name && name !== found.name) await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, found.id).run();
      return { ...found, name: name ?? found.name };
    }
    const id = 'usr_' + randomHex(8);
    await db.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?,?,?,?)').bind(id, e, name, now()).run();
    return { id, email: e, name };
  },

  async createSession(db: D1Database, userId: string, token: string, ttlMs: number) {
    await db
      .prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)')
      .bind(await sha256Hex(token), userId, now(), now() + ttlMs)
      .run();
  },

  /** Returns the user for a live session and slides its expiry forward (30-day rolling). */
  async bySession(db: D1Database, token: string, ttlMs: number): Promise<User | null> {
    const h = await sha256Hex(token);
    const r = await db
      .prepare('SELECT u.id, u.email, u.name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?')
      .bind(h)
      .first<User & { expires_at: number }>();
    if (!r) return null;
    if (r.expires_at < now()) {
      await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(h).run();
      return null;
    }
    if (r.expires_at - now() < ttlMs - 24 * 3600_000) {
      await db.prepare('UPDATE sessions SET expires_at = ? WHERE id_hash = ?').bind(now() + ttlMs, h).run();
    }
    return { id: r.id, email: r.email, name: r.name };
  },

  async endSession(db: D1Database, token: string) {
    await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256Hex(token)).run();
  },

  async orgsFor(db: D1Database, userId: string) {
    const r = await db
      .prepare('SELECT o.slug, o.name, o.status, m.role FROM memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ? ORDER BY o.name')
      .bind(userId)
      .all<{ slug: string; name: string; status: string; role: Role }>();
    return r.results;
  },
};

// ---------- Invites (looked up by token, then scoped to their organisation) ----------

export const Invites = {
  async byToken(db: D1Database, token: string) {
    return db
      .prepare(
        `SELECT i.id, i.org_id, i.email, i.role, i.expires_at, i.accepted_at, o.slug, o.name AS org_name, o.status
         FROM invites i JOIN orgs o ON o.id = i.org_id WHERE i.token_hash = ?`,
      )
      .bind(await sha256Hex(token))
      .first<{ id: string; org_id: string; email: string; role: Role; expires_at: number; accepted_at: number | null; slug: string; org_name: string; status: string }>();
  },
};

// ---------- Organisation scope ----------

export class OrgScope {
  constructor(
    private db: D1Database,
    readonly org: Org,
  ) {}

  get id() {
    return this.org.id;
  }

  async roleOf(userId: string): Promise<Role | null> {
    const r = await this.db.prepare('SELECT role FROM memberships WHERE org_id = ? AND user_id = ?').bind(this.id, userId).first<{ role: Role }>();
    return r?.role ?? null;
  }

  async members() {
    const r = await this.db
      .prepare('SELECT u.email, u.name, m.role, m.created_at FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.created_at')
      .bind(this.id)
      .all();
    return r.results;
  }

  async addMember(userId: string, role: Role) {
    await this.db
      .prepare('INSERT INTO memberships (org_id, user_id, role, created_at) VALUES (?,?,?,?) ON CONFLICT(org_id, user_id) DO UPDATE SET role = excluded.role')
      .bind(this.id, userId, role, now())
      .run();
  }

  async pendingInvites() {
    const r = await this.db
      .prepare('SELECT id, email, role, created_at, expires_at FROM invites WHERE org_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY created_at DESC')
      .bind(this.id, now())
      .all();
    return r.results;
  }

  /** Creates an invite and returns the raw token. Only its hash is stored. */
  async createInvite(email: string, role: Role, createdBy: string | null, token: string, ttlMs = 7 * 24 * 3600_000) {
    await this.db
      .prepare('INSERT INTO invites (id, org_id, email, role, token_hash, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind('inv_' + randomHex(8), this.id, email.trim().toLowerCase(), role, await sha256Hex(token), createdBy, now(), now() + ttlMs)
      .run();
  }

  async markInviteAccepted(inviteId: string) {
    await this.db.prepare('UPDATE invites SET accepted_at = ? WHERE id = ? AND org_id = ?').bind(now(), inviteId, this.id).run();
  }

  /** Display keys, created on first request so none are ever seeded or committed. */
  async displayKeys(): Promise<Record<OutputId, string>> {
    const r = await this.db.prepare('SELECT output, key FROM display_keys WHERE org_id = ?').bind(this.id).all<{ output: OutputId; key: string }>();
    const out = Object.fromEntries(r.results.map((x) => [x.output, x.key])) as Partial<Record<OutputId, string>>;
    for (const o of OUTPUTS) if (!out[o]) out[o] = await this.rotateDisplayKey(o);
    return out as Record<OutputId, string>;
  }

  async rotateDisplayKey(output: OutputId): Promise<string> {
    const key = randomHex(16);
    await this.db
      .prepare('INSERT INTO display_keys (org_id, output, key, created_at) VALUES (?,?,?,?) ON CONFLICT(org_id, output) DO UPDATE SET key = excluded.key, created_at = excluded.created_at')
      .bind(this.id, output, key, now())
      .run();
    return key;
  }

  async displayKeyValid(output: OutputId, key: string): Promise<boolean> {
    const r = await this.db.prepare('SELECT 1 AS ok FROM display_keys WHERE org_id = ? AND output = ? AND key = ?').bind(this.id, output, key).first();
    return !!r;
  }

  async audit(userId: string | null, action: string, detail?: string) {
    await Platform.audit(this.db, userId, action, detail, this.id);
  }

  /** Merges keys into this organisation's settings JSON (only this organisation's row). Returns the new settings. */
  async updateSettings(patch: Record<string, unknown>): Promise<OrgSettings> {
    const next = { ...(this.org.settings as unknown as Record<string, unknown>), ...patch } as unknown as OrgSettings;
    await this.db.prepare('UPDATE orgs SET settings = ? WHERE id = ?').bind(JSON.stringify(next), this.id).run();
    (this.org as { settings: OrgSettings }).settings = next;
    return next;
  }
}
