-- MediaPort core schema. Every organisation-owned table carries org_id (brief §3.3).

CREATE TABLE orgs (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  short_name  TEXT NOT NULL,
  tz          TEXT NOT NULL DEFAULT 'Europe/London',
  locale      TEXT NOT NULL DEFAULT 'en-GB',
  settings    TEXT NOT NULL DEFAULT '{}',      -- JSON: location, motto, departments, website, connectors
  pack        TEXT NOT NULL DEFAULT 'church',
  status      TEXT NOT NULL DEFAULT 'active',  -- active | suspended
  plan        TEXT,                            -- reserved for billing later
  created_at  INTEGER NOT NULL
);

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,            -- lower-cased
  name        TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE memberships (
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,                   -- owner | admin | producer | operator | viewer
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX memberships_user ON memberships(user_id);

CREATE TABLE invites (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,            -- SHA-256 of the token in the invite link
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  accepted_at INTEGER
);
CREATE INDEX invites_org ON invites(org_id);

CREATE TABLE sessions (
  id_hash     TEXT PRIMARY KEY,                -- SHA-256 of the cookie value
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Display keys are read-only and must be copyable from the control page, so they are stored as issued.
CREATE TABLE display_keys (
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  output      TEXT NOT NULL,                   -- obs | freeshow | stage
  key         TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (org_id, output)
);

CREATE TABLE audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id      TEXT,                            -- NULL for platform-level events
  user_id     TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  at          INTEGER NOT NULL
);
CREATE INDEX audit_org ON audit(org_id, at);
