use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::repo::{new_id, now};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

impl Category {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Category {
            id: row.get("id")?,
            name: row.get("name")?,
            icon: row.get("icon")?,
            color: row.get("color")?,
            position: row.get("position")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct NewCategory {
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub position: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
pub struct CategoryPatch {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub position: Option<i64>,
}

pub fn list(conn: &Connection) -> AppResult<Vec<Category>> {
    let mut stmt = conn.prepare("SELECT * FROM categories ORDER BY position ASC, name ASC")?;
    let rows = stmt.query_map([], Category::from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn get(conn: &Connection, id: &str) -> AppResult<Option<Category>> {
    let mut stmt = conn.prepare("SELECT * FROM categories WHERE id = ?1")?;
    let mut rows = stmt.query_map([id], Category::from_row)?;
    match rows.next() {
        Some(c) => Ok(Some(c?)),
        None => Ok(None),
    }
}

pub fn create(conn: &Connection, input: NewCategory) -> AppResult<Category> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(crate::error::AppError::Other("category name is required".into()));
    }
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO categories (id, name, icon, color, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        rusqlite::params![
            id,
            name,
            input.icon.unwrap_or_else(|| "📁".into()),
            input.color.unwrap_or_else(|| "#8B7E6A".into()),
            input.position.unwrap_or(0),
            ts,
        ],
    )?;
    Ok(get(conn, &id)?.expect("category just inserted"))
}

pub fn update(conn: &Connection, id: &str, patch: CategoryPatch) -> AppResult<Option<Category>> {
    if let Some(name) = patch.name {
        conn.execute("UPDATE categories SET name = ?1 WHERE id = ?2", rusqlite::params![name.trim(), id])?;
    }
    if let Some(icon) = patch.icon {
        conn.execute("UPDATE categories SET icon = ?1 WHERE id = ?2", rusqlite::params![icon, id])?;
    }
    if let Some(color) = patch.color {
        conn.execute("UPDATE categories SET color = ?1 WHERE id = ?2", rusqlite::params![color, id])?;
    }
    if let Some(position) = patch.position {
        conn.execute("UPDATE categories SET position = ?1 WHERE id = ?2", rusqlite::params![position, id])?;
    }
    conn.execute("UPDATE categories SET updated_at = ?1 WHERE id = ?2", rusqlite::params![now(), id])?;
    get(conn, id)
}

/// Delete a category. Notes referencing it have `category_id` set to NULL by the
/// FK `ON DELETE SET NULL`, so notes are never lost when a category is removed.
pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM categories WHERE id = ?1", [id])?;
    Ok(())
}
