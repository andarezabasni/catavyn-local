use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::repo::{new_id, now};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

impl Tag {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Tag {
            id: row.get("id")?,
            name: row.get("name")?,
            color: row.get("color")?,
            created_at: row.get("created_at")?,
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct NewTag {
    pub name: String,
    pub color: Option<String>,
}

/// A single note↔tag link, used to rebuild the frontend's `noteTagsMap`.
#[derive(Debug, Clone, Serialize)]
pub struct NoteTagLink {
    pub note_id: String,
    pub tag_id: String,
}

pub fn list(conn: &Connection) -> AppResult<Vec<Tag>> {
    let mut stmt = conn.prepare("SELECT * FROM tags ORDER BY name ASC")?;
    let rows = stmt.query_map([], Tag::from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn get(conn: &Connection, id: &str) -> AppResult<Option<Tag>> {
    let mut stmt = conn.prepare("SELECT * FROM tags WHERE id = ?1")?;
    let mut rows = stmt.query_map([id], Tag::from_row)?;
    match rows.next() {
        Some(t) => Ok(Some(t?)),
        None => Ok(None),
    }
}

/// All note↔tag links (the junction table). The frontend groups these by
/// note_id, exactly like the original Supabase `note_tags` fetch.
pub fn list_links(conn: &Connection) -> AppResult<Vec<NoteTagLink>> {
    let mut stmt = conn.prepare("SELECT note_id, tag_id FROM note_tags")?;
    let rows = stmt.query_map([], |row| {
        Ok(NoteTagLink { note_id: row.get(0)?, tag_id: row.get(1)? })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn create(conn: &Connection, input: NewTag) -> AppResult<Tag> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(AppError::Other("tag name is required".into()));
    }
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO tags (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, name, input.color.unwrap_or_else(|| "#A89B8C".into()), ts],
    )
    .map_err(|e| match e {
        // UNIQUE(name) violation -> friendly error, no panic.
        rusqlite::Error::SqliteFailure(err, _)
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            AppError::Other(format!("a tag named \"{name}\" already exists"))
        }
        other => AppError::Database(other),
    })?;
    Ok(get(conn, &id)?.expect("tag just inserted"))
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    // note_tags rows are removed by ON DELETE CASCADE; notes are untouched.
    conn.execute("DELETE FROM tags WHERE id = ?1", [id])?;
    Ok(())
}

/// Attach a tag to a note (idempotent thanks to the composite PK + OR IGNORE).
pub fn attach(conn: &Connection, note_id: &str, tag_id: &str) -> AppResult<()> {
    conn.execute(
        "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
        rusqlite::params![note_id, tag_id],
    )?;
    Ok(())
}

pub fn detach(conn: &Connection, note_id: &str, tag_id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM note_tags WHERE note_id = ?1 AND tag_id = ?2",
        rusqlite::params![note_id, tag_id],
    )?;
    Ok(())
}
