-- Run once:  npx wrangler d1 execute annotator-db --file=schema.sql --remote
-- If you already created the earlier tables and have no data yet, drop them first:
DROP TABLE IF EXISTS annotations; DROP TABLE IF EXISTS annotation_groups; DROP TABLE IF EXISTS files;

CREATE TABLE files (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    r2_key     TEXT NOT NULL,          -- sha256 hex of the content = R2 object key
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A group is identified by its name ("Names" and "names" are the same group).
CREATE TABLE annotation_groups (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT NOT NULL               -- palette name or hex, your choice
);

-- One row per individual tag (one range in one file).
CREATE TABLE annotations (
    id            INTEGER PRIMARY KEY,
    file_id       INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    group_id      INTEGER NOT NULL REFERENCES annotation_groups(id),
    start_offset  INTEGER NOT NULL,
    end_offset    INTEGER NOT NULL,   -- exclusive, UTF-16 code units (matches JS slice)
    selected_text TEXT NOT NULL,      -- copy of the text, to detect drift
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (start_offset >= 0 AND end_offset > start_offset)
);

CREATE INDEX idx_annotations_file  ON annotations(file_id);
CREATE INDEX idx_annotations_group ON annotations(group_id);
