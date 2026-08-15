use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::repo::{new_id, now};

/// A note row as exposed to the frontend. Field names/shape intentionally mirror
/// the existing Catavyn `Note` type so the React hooks can be swapped in with
/// minimal changes. Timestamps are ISO-8601 UTC strings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub category_id: Option<String>,
    pub parent_id: Option<String>,
    pub title: String,
    pub content: String,
    pub is_pinned: bool,
    pub pin_hash: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

impl Note {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Note {
            id: row.get("id")?,
            category_id: row.get("category_id")?,
            parent_id: row.get("parent_id")?,
            title: row.get("title")?,
            content: row.get("content")?,
            is_pinned: row.get::<_, i64>("is_pinned")? != 0,
            pin_hash: row.get("pin_hash")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            deleted_at: row.get("deleted_at")?,
        })
    }
}

/// Input for creating a note.
#[derive(Debug, Default, Deserialize)]
pub struct NewNote {
    pub title: Option<String>,
    pub content: Option<String>,
    pub category_id: Option<String>,
    pub parent_id: Option<String>,
}

/// Partial update. Only `Some` fields are written. Nested `Option` for
/// `category_id`/`pin_hash` distinguishes "leave unchanged" (`None`) from
/// "set to NULL" (`Some(None)`).
#[derive(Debug, Default, Deserialize)]
pub struct NotePatch {
    pub title: Option<String>,
    pub content: Option<String>,
    pub category_id: Option<Option<String>>,
    pub is_pinned: Option<bool>,
    pub pin_hash: Option<Option<String>>,
    pub parent_id: Option<Option<String>>,
}

/// Query options for listing notes, mirroring the original `useNotes` options.
#[derive(Debug, Default, Deserialize)]
pub struct NoteQuery {
    /// Return trashed notes instead of active ones.
    pub deleted: Option<bool>,
    /// Return only sub-notes of this parent.
    pub parent_id: Option<String>,
    /// Return only root notes (parent_id IS NULL). Ignored if `parent_id` set.
    pub root_only: Option<bool>,
    /// Full-text search query (FTS5). Empty/absent = no text filter.
    pub search: Option<String>,
}

fn get_internal(conn: &Connection, id: &str) -> AppResult<Option<Note>> {
    let mut stmt = conn.prepare("SELECT * FROM notes WHERE id = ?1")?;
    let mut rows = stmt.query_map([id], Note::from_row)?;
    match rows.next() {
        Some(note) => Ok(Some(note?)),
        None => Ok(None),
    }
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Option<Note>> {
    get_internal(conn, id)
}

/// List notes according to `query`. When `search` is present, results are
/// matched via the FTS5 index (title + content) and ordered by recency.
pub fn list(conn: &Connection, query: NoteQuery) -> AppResult<Vec<Note>> {
    let deleted = query.deleted.unwrap_or(false);
    let search = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let mut sql = String::from("SELECT n.* FROM notes n");
    let mut clauses: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(term) = search {
        // Join against the FTS index. `notes_fts` is an external-content table
        // whose rowid matches notes.rowid.
        sql.push_str(" JOIN notes_fts f ON f.rowid = n.rowid");
        clauses.push("notes_fts MATCH ?".to_string());
        params.push(Box::new(fts_query(term)));
    }

    clauses.push(if deleted {
        "n.deleted_at IS NOT NULL".to_string()
    } else {
        "n.deleted_at IS NULL".to_string()
    });

    if let Some(pid) = &query.parent_id {
        clauses.push("n.parent_id = ?".to_string());
        params.push(Box::new(pid.clone()));
    } else if query.root_only.unwrap_or(false) {
        clauses.push("n.parent_id IS NULL".to_string());
    }

    if !clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&clauses.join(" AND "));
    }
    sql.push_str(" ORDER BY n.updated_at DESC");

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let rows = stmt.query_map(param_refs.as_slice(), Note::from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Turn a raw user search string into a safe FTS5 prefix query. Each token is
/// quoted (so punctuation can't inject FTS operators) and given a prefix match.
fn fts_query(input: &str) -> String {
    let tokens: Vec<String> = input
        .split_whitespace()
        .filter(|t| !t.is_empty())
        .map(|t| {
            let escaped = t.replace('"', "\"\"");
            format!("\"{escaped}\"*")
        })
        .collect();
    tokens.join(" ")
}

pub fn create(conn: &Connection, input: NewNote) -> AppResult<Note> {
    let id = new_id();
    let ts = now();
    let title = input.title.unwrap_or_else(|| "Untitled".to_string());
    let content = input.content.unwrap_or_default();

    conn.execute(
        "INSERT INTO notes (id, category_id, parent_id, title, content, is_pinned, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)",
        rusqlite::params![id, input.category_id, input.parent_id, title, content, ts],
    )?;

    Ok(get_internal(conn, &id)?.expect("note just inserted must exist"))
}

pub fn update(conn: &Connection, id: &str, patch: NotePatch) -> AppResult<Option<Note>> {
    let ts = now();

    if let Some(title) = patch.title {
        conn.execute("UPDATE notes SET title = ?1 WHERE id = ?2", rusqlite::params![title, id])?;
    }
    if let Some(content) = patch.content {
        conn.execute("UPDATE notes SET content = ?1 WHERE id = ?2", rusqlite::params![content, id])?;
    }
    if let Some(category_id) = patch.category_id {
        conn.execute("UPDATE notes SET category_id = ?1 WHERE id = ?2", rusqlite::params![category_id, id])?;
    }
    if let Some(is_pinned) = patch.is_pinned {
        conn.execute("UPDATE notes SET is_pinned = ?1 WHERE id = ?2", rusqlite::params![is_pinned as i64, id])?;
    }
    if let Some(pin_hash) = patch.pin_hash {
        conn.execute("UPDATE notes SET pin_hash = ?1 WHERE id = ?2", rusqlite::params![pin_hash, id])?;
    }
    if let Some(parent_id) = patch.parent_id {
        // Guard against a note becoming its own parent.
        if parent_id.as_deref() == Some(id) {
            return Err(crate::error::AppError::Other("a note cannot be its own parent".into()));
        }
        conn.execute("UPDATE notes SET parent_id = ?1 WHERE id = ?2", rusqlite::params![parent_id, id])?;
    }

    conn.execute("UPDATE notes SET updated_at = ?1 WHERE id = ?2", rusqlite::params![ts, id])?;
    get_internal(conn, id)
}

/// Soft-delete a note and its sub-notes. Soft delete does not fire the
/// ON DELETE CASCADE, so children are trashed explicitly, matching the
/// original Catavyn behavior.
pub fn soft_delete(conn: &Connection, id: &str) -> AppResult<()> {
    let ts = now();
    conn.execute(
        "UPDATE notes SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 OR parent_id = ?2",
        rusqlite::params![ts, id],
    )?;
    Ok(())
}

/// Restore a soft-deleted note and its sub-notes from the trash.
pub fn restore(conn: &Connection, id: &str) -> AppResult<()> {
    let ts = now();
    conn.execute(
        "UPDATE notes SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2 OR parent_id = ?2",
        rusqlite::params![ts, id],
    )?;
    Ok(())
}

/// Permanently remove a note. Sub-notes, note_tags, and attachments are removed
/// by ON DELETE CASCADE.
pub fn hard_delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM notes WHERE id = ?1", [id])?;
    Ok(())
}

/// Empty the trash: permanently delete every soft-deleted note.
pub fn empty_trash(conn: &Connection) -> AppResult<usize> {
    let n = conn.execute("DELETE FROM notes WHERE deleted_at IS NOT NULL", [])?;
    Ok(n)
}
