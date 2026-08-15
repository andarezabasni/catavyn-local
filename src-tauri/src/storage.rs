use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::config;
use crate::db;
use crate::error::{AppError, AppResult};

/// Breakdown of disk usage inside the data directory only. We never scan the
/// whole disk — only the known Catavyn sub-paths.
#[derive(Debug, Serialize)]
pub struct StorageUsage {
    pub database_bytes: u64,
    pub images_bytes: u64,
    pub files_bytes: u64,
    pub thumbnails_bytes: u64,
    pub attachments_bytes: u64,
    pub backups_bytes: u64,
    pub total_bytes: u64,
}

fn file_len(path: &Path) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// Recursively sum file sizes under `dir`. Missing dir => 0. Symlinks are not
/// followed to avoid escaping the data directory.
fn dir_size(dir: &Path) -> u64 {
    let mut total = 0;
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    for entry in entries.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_symlink() {
            continue;
        }
        if ft.is_dir() {
            total += dir_size(&entry.path());
        } else if ft.is_file() {
            total += entry.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    total
}

pub fn usage(data_dir: &Path) -> StorageUsage {
    // Include the SQLite main file plus its WAL/SHM sidecars.
    let db_main = config::db_path(data_dir);
    let database_bytes = file_len(&db_main)
        + file_len(&db_main.with_extension("db-wal"))
        + file_len(&db_main.with_extension("db-shm"));

    let attachments_root = data_dir.join("attachments");
    let images_bytes = dir_size(&attachments_root.join("images"));
    let files_bytes = dir_size(&attachments_root.join("files"));
    let thumbnails_bytes = dir_size(&attachments_root.join("thumbnails"));
    let attachments_bytes = images_bytes + files_bytes + thumbnails_bytes;
    let backups_bytes = dir_size(&data_dir.join("backups"));

    StorageUsage {
        database_bytes,
        images_bytes,
        files_bytes,
        thumbnails_bytes,
        attachments_bytes,
        backups_bytes,
        total_bytes: database_bytes + attachments_bytes + backups_bytes,
    }
}

/// Copy a directory tree recursively. Used by the safe migration flow.
fn copy_tree(src: &Path, dst: &Path) -> AppResult<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ft = entry.file_type()?;
        let target = dst.join(entry.file_name());
        if ft.is_symlink() {
            continue; // don't follow symlinks out of the tree
        }
        if ft.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else if ft.is_file() {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// True if `dir` already contains a Catavyn database (used to refuse silently
/// overwriting an existing data directory during migration).
pub fn has_existing_db(dir: &Path) -> bool {
    config::db_path(dir).exists()
}

/// Verify a copied database opens, passes an integrity check, and is migrated.
fn verify_db(dir: &Path) -> AppResult<()> {
    let mut conn = db::open(&config::db_path(dir))?;
    let integrity: String =
        conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if integrity != "ok" {
        return Err(AppError::Other(format!(
            "integrity check failed on copied database: {integrity}"
        )));
    }
    // Ensure the schema is current in the destination too.
    db::migrate(&mut conn)?;
    Ok(())
}

/// Safe storage migration. Copies data from `src` to `dst`, verifies the copy,
/// and only returns Ok when the destination is proven good. The caller switches
/// the active directory only on success; the source is left completely intact.
///
/// Refuses to write into a directory that already holds a Catavyn database,
/// unless `allow_existing` is set.
pub fn migrate_data_dir(src: &Path, dst: &Path, allow_existing: bool) -> AppResult<()> {
    if src == dst {
        return Err(AppError::Other("source and destination are the same".into()));
    }
    // Reject nesting the destination inside the source (or vice versa), which
    // would cause the recursive copy to loop / duplicate.
    if dst.starts_with(src) || src.starts_with(dst) {
        return Err(AppError::Other(
            "destination and source directories must not be nested".into(),
        ));
    }

    fs::create_dir_all(dst)?;

    if !allow_existing && has_existing_db(dst) {
        return Err(AppError::Other(format!(
            "{} already contains Catavyn data — refusing to overwrite",
            dst.display()
        )));
    }

    // Copy the standard sub-structure. Do NOT delete anything in src.
    copy_tree(src, dst)?;

    // Verify the destination database before the caller commits the switch.
    verify_db(dst)?;
    Ok(())
}

/// Delete the CONTENTS of the Catavyn data directory (not the directory itself),
/// then recreate the empty standard structure. The connection must be closed by
/// the caller first so no file handles are held on Windows.
pub fn wipe_data_dir(data_dir: &Path) -> AppResult<()> {
    if !data_dir.is_dir() {
        return Err(AppError::InvalidDataDirectory(format!(
            "{} is not a directory",
            data_dir.display()
        )));
    }
    for entry in fs::read_dir(data_dir)? {
        let entry = entry?;
        let path = entry.path();
        let ft = entry.file_type()?;
        if ft.is_dir() {
            fs::remove_dir_all(&path)?;
        } else {
            fs::remove_file(&path)?;
        }
    }
    // Recreate the empty structure so the directory is immediately reusable.
    config::ensure_data_dir(data_dir)?;
    Ok(())
}
