-- Full schema for a NEW, empty database.
-- Run once:  npx wrangler d1 execute database --file=schema.sql --remote
--   (or paste into Cloudflare dashboard -> D1 -> database -> Console)
-- WARNING: the DROP lines below delete ALL data. Only run this on an empty database.
-- To add accounts to a database that already has documents, run migrations/0001_user_accounts.sql instead.
DROP TABLE IF EXISTS audit_log; DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS annotations; DROP TABLE IF EXISTS annotation_groups; DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS corpora; DROP TABLE IF EXISTS users;

-- ---------- accounts ----------
CREATE TABLE users (
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
CREATE TABLE sessions (
    id           TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   INTEGER NOT NULL,               -- ms since epoch
    last_seen_at INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Who did what, for FERPA record-keeping. Never stores document text.
CREATE TABLE audit_log (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    detail     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- documents ----------
CREATE TABLE corpora (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE files (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    content    TEXT NOT NULL,          -- the file's plain text (D1 caps a value at ~2 MB; API allows 1 MB)
    size_bytes INTEGER NOT NULL,
    corpus_id  INTEGER REFERENCES corpora(id) ON DELETE SET NULL,   -- NULL = Unassigned
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A group is identified by its name ("Names" and "names" are the same group).
CREATE TABLE annotation_groups (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT NOT NULL               -- palette name or hex, your choice
);

-- One row per individual tag (one range in one file).
-- start_offset/end_offset both NULL = the tag applies to the whole document.
CREATE TABLE annotations (
    id            INTEGER PRIMARY KEY,
    file_id       INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    group_id      INTEGER NOT NULL REFERENCES annotation_groups(id) ON DELETE CASCADE,
    start_offset  INTEGER,
    end_offset    INTEGER,            -- exclusive, UTF-16 code units (matches JS slice)
    selected_text TEXT NOT NULL,      -- copy of the text, to detect drift ('' for whole-document)
    created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((start_offset IS NULL AND end_offset IS NULL)
           OR (start_offset >= 0 AND end_offset > start_offset))
);

CREATE INDEX idx_annotations_file  ON annotations(file_id);
CREATE INDEX idx_annotations_group ON annotations(group_id);
