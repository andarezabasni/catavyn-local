use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};

use crate::error::AppResult;

/// Attachment metadata only (Phase 1). The binary file itself lives on the
/// filesystem under the data directory's `attachments/` folders — never as a
/// SQLite BLOB. Actual file storage/serving is a later phase.
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
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Attachment {
    #[allow(dead_code)]
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
            description: row.get("description")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

/// List attachment metadata for a note. Kept for forward compatibility; the
/// full attachment feature (upload/serve/thumbnails) arrives in a later phase.
#[allow(dead_code)]
pub fn list_for_note(conn: &Connection, note_id: &str) -> AppResult<Vec<Attachment>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM attachments WHERE note_id = ?1 ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([note_id], Attachment::from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}
