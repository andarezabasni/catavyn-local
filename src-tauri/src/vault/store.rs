use rusqlite::Connection;

use crate::error::AppResult;

/// The Vault item store (`vault/vault.db`). A normal SQLite database holding
/// ONLY non-secret metadata plus the AEAD-encrypted payload per item (§8).
/// No plaintext secret ever touches this schema.
pub struct VaultItemRow {
    pub item_id: String,
    pub item_type: String,
    pub created_at: String,
    pub updated_at: String,
    pub encrypted_payload: Vec<u8>,
}

/// Non-secret listing view (no payload).
#[derive(Debug, Clone, serde::Serialize)]
pub struct VaultItemSummary {
    pub item_id: String,
    pub item_type: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn open(path: &std::path::Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS vault_items (
            item_id           TEXT PRIMARY KEY,
            item_type         TEXT NOT NULL,
            created_at        TEXT NOT NULL,
            updated_at        TEXT NOT NULL,
            encrypted_payload BLOB NOT NULL
         );",
    )?;
    Ok(conn)
}

/// Verify the expected schema exists (used by migration verification, §19).
pub fn schema_ok(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT count(*) FROM pragma_table_info('vault_items')
         WHERE name IN ('item_id','item_type','created_at','updated_at','encrypted_payload')",
        [],
        |r| r.get::<_, i64>(0),
    )
    .map(|n| n == 5)
    .unwrap_or(false)
}

pub fn list(conn: &Connection) -> AppResult<Vec<VaultItemSummary>> {
    let mut stmt = conn.prepare(
        "SELECT item_id, item_type, created_at, updated_at FROM vault_items
         ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(VaultItemSummary {
            item_id: r.get(0)?,
            item_type: r.get(1)?,
            created_at: r.get(2)?,
            updated_at: r.get(3)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get(conn: &Connection, item_id: &str) -> AppResult<Option<VaultItemRow>> {
    let mut stmt = conn.prepare(
        "SELECT item_id, item_type, created_at, updated_at, encrypted_payload
         FROM vault_items WHERE item_id = ?1",
    )?;
    let mut rows = stmt.query_map([item_id], |r| {
        Ok(VaultItemRow {
            item_id: r.get(0)?,
            item_type: r.get(1)?,
            created_at: r.get(2)?,
            updated_at: r.get(3)?,
            encrypted_payload: r.get(4)?,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn insert(conn: &Connection, row: &VaultItemRow) -> AppResult<()> {
    conn.execute(
        "INSERT INTO vault_items (item_id, item_type, created_at, updated_at, encrypted_payload)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![row.item_id, row.item_type, row.created_at, row.updated_at, row.encrypted_payload],
    )?;
    Ok(())
}

pub fn update(conn: &Connection, item_id: &str, updated_at: &str, payload: &[u8]) -> AppResult<()> {
    conn.execute(
        "UPDATE vault_items SET updated_at = ?1, encrypted_payload = ?2 WHERE item_id = ?3",
        rusqlite::params![updated_at, payload, item_id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, item_id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM vault_items WHERE item_id = ?1", [item_id])?;
    Ok(())
}
