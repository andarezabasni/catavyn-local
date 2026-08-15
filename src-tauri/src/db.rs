use rusqlite::Connection;

use crate::error::AppResult;

/// Ordered list of schema migrations. Each entry is applied exactly once and
/// tracked by `PRAGMA user_version`. To evolve the schema, append a new SQL
/// string — never edit or reorder existing ones.
///
/// Timestamps are ISO-8601 UTC TEXT and IDs are UUID v4 TEXT so the database is
/// fully portable across machines (no autoincrement coupling, no machine state).
const MIGRATIONS: &[&str] = &[
    // --- Migration 1: initial local schema -------------------------------
    r#"
    CREATE TABLE categories (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      icon       TEXT NOT NULL DEFAULT '📁',
      color      TEXT NOT NULL DEFAULT '#8B7E6A',
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE notes (
      id          TEXT PRIMARY KEY,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      parent_id   TEXT REFERENCES notes(id) ON DELETE CASCADE,
      title       TEXT NOT NULL DEFAULT 'Untitled',
      content     TEXT NOT NULL DEFAULT '',
      is_pinned   INTEGER NOT NULL DEFAULT 0,
      pin_hash    TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );

    CREATE TABLE tags (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      color      TEXT NOT NULL DEFAULT '#A89B8C',
      created_at TEXT NOT NULL
    );

    CREATE TABLE note_tags (
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
      PRIMARY KEY (note_id, tag_id)
    );

    CREATE TABLE tasks (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      due_date     TEXT,
      due_time     TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0,
      priority     TEXT NOT NULL DEFAULT 'low' CHECK (priority IN ('low','medium','high')),
      position     INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );

    CREATE TABLE attachments (
      id                TEXT PRIMARY KEY,
      note_id           TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      original_filename TEXT NOT NULL,
      stored_filename   TEXT NOT NULL,
      relative_path     TEXT NOT NULL,
      mime_type         TEXT NOT NULL,
      file_size         INTEGER NOT NULL,
      width             INTEGER,
      height            INTEGER,
      description       TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );

    CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX idx_notes_category_id ON notes(category_id);
    CREATE INDEX idx_notes_parent_id   ON notes(parent_id);
    CREATE INDEX idx_notes_deleted_at  ON notes(deleted_at);
    CREATE INDEX idx_notes_is_pinned   ON notes(is_pinned);
    CREATE INDEX idx_tasks_due_date    ON tasks(due_date);
    CREATE INDEX idx_attachments_note_id ON attachments(note_id);
    "#,
    // --- Migration 2: FTS5 full-text search over notes -------------------
    // External-content FTS5 index mirrors notes(title, content). Triggers keep
    // it in sync so search stays fast offline with many notes. The backfill
    // populates the index for any notes created before this migration.
    r#"
    CREATE VIRTUAL TABLE notes_fts USING fts5(
      title,
      content,
      content='notes',
      content_rowid='rowid'
    );

    INSERT INTO notes_fts (rowid, title, content)
      SELECT rowid, title, content FROM notes;

    CREATE TRIGGER notes_fts_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts (rowid, title, content)
        VALUES (new.rowid, new.title, new.content);
    END;

    CREATE TRIGGER notes_fts_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts (notes_fts, rowid, title, content)
        VALUES ('delete', old.rowid, old.title, old.content);
    END;

    CREATE TRIGGER notes_fts_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts (notes_fts, rowid, title, content)
        VALUES ('delete', old.rowid, old.title, old.content);
      INSERT INTO notes_fts (rowid, title, content)
        VALUES (new.rowid, new.title, new.content);
    END;
    "#,
];

/// Number of defined migrations (used by tests to assert the applied version).
#[cfg_attr(not(test), allow(dead_code))]
pub fn migration_count() -> usize {
    MIGRATIONS.len()
}

/// Open a SQLite connection with the pragmas the app relies on.
/// Foreign keys are enforced and WAL is used for better concurrency/durability.
pub fn open(path: &std::path::Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    Ok(conn)
}

/// Apply any pending migrations. Idempotent: uses `PRAGMA user_version` as the
/// applied-migration counter and runs each pending migration in a transaction.
pub fn migrate(conn: &mut Connection) -> AppResult<()> {
    let current: i64 =
        conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let current = current as usize;

    for (idx, sql) in MIGRATIONS.iter().enumerate() {
        let version = idx + 1;
        if version <= current {
            continue;
        }
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        // PRAGMA user_version does not accept bound params.
        tx.pragma_update(None, "user_version", version as i64)?;
        tx.commit()?;
    }

    Ok(())
}
