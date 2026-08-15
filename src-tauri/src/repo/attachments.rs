use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::repo::{new_id, now};

/// Attachment metadata. The binary file itself lives on the filesystem under
/// the data directory's `attachments/` folders — never as a SQLite BLOB.
/// `relative_path` is always relative to the data directory so the database
/// stays portable (no machine-specific absolute paths).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub id: String,
    pub note_id: String,
    pub original_filename: String,
    pub stored_filename: String,
    pub relative_path: String,
    pub mime_type: String,
    pub file_size: i64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    /// Relative path to a generated thumbnail, if one exists.
    pub thumbnail_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Attachment {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Attachment {
            id: row.get("id")?,
            note_id: row.get("note_id")?,
            original_filename: row.get("original_filename")?,
            stored_filename: row.get("stored_filename")?,
            relative_path: row.get("relative_path")?,
            mime_type: row.get("mime_type")?,
            file_size: row.get("file_size")?,
            width: row.get("width")?,
            height: row.get("height")?,
            thumbnail_path: row.get("thumbnail_path")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

/// Metadata for a new attachment. The file bytes are written by the filesystem
/// layer before this row is inserted; this struct only records the result.
pub struct NewAttachment {
    pub note_id: String,
    pub original_filename: String,
    pub stored_filename: String,
    pub relative_path: String,
    pub mime_type: String,
    pub file_size: i64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub thumbnail_path: Option<String>,
}

pub fn list_for_note(conn: &Connection, note_id: &str) -> AppResult<Vec<Attachment>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM attachments WHERE note_id = ?1 ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([note_id], Attachment::from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Option<Attachment>> {
    let mut stmt = conn.prepare("SELECT * FROM attachments WHERE id = ?1")?;
    let mut rows = stmt.query_map([id], Attachment::from_row)?;
    match rows.next() {
        Some(a) => Ok(Some(a?)),
        None => Ok(None),
    }
}

pub fn create(conn: &Connection, id: &str, input: NewAttachment) -> AppResult<Attachment> {
    let ts = now();
    conn.execute(
        "INSERT INTO attachments
           (id, note_id, original_filename, stored_filename, relative_path,
            mime_type, file_size, width, height, thumbnail_path, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
        rusqlite::params![
            id,
            input.note_id,
            input.original_filename,
            input.stored_filename,
            input.relative_path,
            input.mime_type,
            input.file_size,
            input.width,
            input.height,
            input.thumbnail_path,
            ts,
        ],
    )?;
    Ok(get(conn, id)?.expect("attachment just inserted"))
}

/// Generate a fresh attachment id (exposed so the command layer can reserve an
/// id before writing files, keeping filename generation and the DB row in sync).
pub fn generate_id() -> String {
    new_id()
}

pub fn delete_row(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM attachments WHERE id = ?1", [id])?;
    Ok(())
}

/// All attachment file/thumbnail relative paths (for orphan cleanup).
#[allow(dead_code)] // reserved for the orphan-cleanup pass in a later phase
pub fn all_relative_paths(conn: &Connection) -> AppResult<Vec<(String, Option<String>)>> {
    let mut stmt = conn.prepare("SELECT relative_path, thumbnail_path FROM attachments")?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// File/thumbnail paths for attachments belonging to a note or any of its
/// sub-notes (used to delete files before a cascading hard delete).
pub fn files_under_note(conn: &Connection, note_id: &str) -> AppResult<Vec<(String, Option<String>)>> {
    let mut stmt = conn.prepare(
        "SELECT a.relative_path, a.thumbnail_path FROM attachments a
         JOIN notes n ON n.id = a.note_id
         WHERE n.id = ?1 OR n.parent_id = ?1",
    )?;
    let rows = stmt.query_map([note_id], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// File/thumbnail paths for attachments of all soft-deleted notes (used before
/// emptying the trash).
pub fn files_under_trashed_notes(conn: &Connection) -> AppResult<Vec<(String, Option<String>)>> {
    let mut stmt = conn.prepare(
        "SELECT a.relative_path, a.thumbnail_path FROM attachments a
         JOIN notes n ON n.id = a.note_id
         WHERE n.deleted_at IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}
