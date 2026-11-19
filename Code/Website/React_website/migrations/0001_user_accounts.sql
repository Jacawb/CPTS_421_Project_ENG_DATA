-- Adds user accounts, sessions and an audit log to an EXISTING database. Keeps all data.
-- Run once:  npx wrangler d1 execute database --file=migrations/0001_user_accounts.sql --remote
--   (or paste into Cloudflare dashboard -> D1 -> database -> Console)
-- Running it a second time fails on the ALTER TABLE line; that's harmless (nothing else changes).

CREATE TABLE IF NOT EXISTS users (
    id                   INTEGER PRIMARY KEY,
    email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name                 TEXT NOT NULL,
    role                 TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    password_hash        TEXT NOT NULL,          -- pbkdf2_sha256$iterations$salt$hash, never the password
    must_change_password INTEGER NOT NULL DEFAULT 1,  -- 1 = temporary password set by an admin
    disabled             INTEGER NOT NULL DEFAULT 0,
    failed_attempts      INTEGER NOT NULL DEFAULT 0,
    locked_until         INTEGER,                -- ms since epoch; set after too many failed sign-ins
    created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at        TEXT
);

-- id is a SHA-256 of the cookie token, so the table alone can't be used to sign in.
CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   INTEGER NOT NULL,               -- ms since epoch
    last_seen_at INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Who did what, for FERPA record-keeping. Never stores document text.
CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,                    -- login, login_failed, user_created, file_uploaded, ...
    detail     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Who created each annotation (NULL for annotations made before accounts existed).
ALTER TABLE annotations ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
