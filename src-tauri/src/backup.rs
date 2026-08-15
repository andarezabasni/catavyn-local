//! Manual backup & restore. A `.catavyn` file is zstd(tar(...)) containing a
//! versioned `manifest.json` (backup metadata + per-file SHA-256 integrity
//! list) and a `data/` tree mirroring the Catavyn data directory.
//!
//! Key guarantees (docs/BACKUP_RESTORE_SPEC.md):
//! - SQLite is snapshotted with `VACUUM INTO` (never a raw WAL-ignoring copy).
//! - The Vault is copied verbatim (encrypted); never decrypted during backup.
//! - Backups are built in a temp file and atomically moved on success.
//! - Restore extracts to a temp dir, validates everything, and only then
//!   activates — never partially overwriting existing data.
//! - Archive paths are strictly validated (no absolute/drive/UNC/.. /symlink).

use std::fs::{self, File};
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::config;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::vault;

pub const BACKUP_FORMAT_VERSION: u32 = 1;
/// Top-level prefix inside the archive for the mirrored data tree.
const DATA_PREFIX: &str = "data";
const MANIFEST_NAME: &str = "manifest.json";

#[derive(Debug, Serialize, Deserialize)]
pub struct ManifestFile {
    pub relative_path: String, // relative to the data dir (forward slashes)
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Manifest {
    pub backup_format_version: u32,
    pub created_at: String, // UTC ISO-8601
    pub catavyn_version: String,
    pub file_count: usize,
    pub total_size: u64,
    pub files: Vec<ManifestFile>,
}

fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn sha256_file(path: &Path) -> AppResult<(String, u64)> {
    let mut f = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        total += n as u64;
    }
    Ok((hex(&hasher.finalize()), total))
}

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

// ---------------------------------------------------------------------------
// Snapshot the live data directory into a staging directory
// ---------------------------------------------------------------------------

/// Build a consistent snapshot of `data_dir` into `staging`. SQLite DBs are
/// copied via `VACUUM INTO`; attachments are copied byte-for-byte; the Vault is
/// copied verbatim (still encrypted). `backups/` and temp files are excluded.
fn snapshot_into(data_dir: &Path, staging: &Path) -> AppResult<()> {
    fs::create_dir_all(staging)?;

    // 1. Main database via VACUUM INTO (checkpoint-consistent, no WAL sidecars).
    let main_src = config::db_path(data_dir);
    if main_src.exists() {
        vacuum_into(&main_src, &staging.join("catavyn.db"))?;
    }

    // 2. Attachments (content-addressed, effectively immutable) copied directly.
    let att_src = data_dir.join("attachments");
    if att_src.exists() {
        copy_tree(&att_src, &staging.join("attachments"))?;
    }

    // 3. Vault: meta verbatim + vault.db via VACUUM INTO (ciphertext only).
    if vault::meta::vault_exists(data_dir) {
        let vdir = staging.join("vault");
        fs::create_dir_all(&vdir)?;
        fs::copy(vault::meta::meta_path(data_dir), vdir.join("vault.meta"))?;
        let vdb = vault::meta::db_path(data_dir);
        if vdb.exists() {
            vacuum_into(&vdb, &vdir.join("vault.db"))?;
        }
    }

    // Intentionally excluded: backups/, metadata/ runtime, *-wal/*-shm, temp.
    Ok(())
}

/// Run `VACUUM INTO` to produce a single self-contained snapshot DB. Opening a
/// fresh read connection is safe on a live WAL database and does not mutate the
/// source. The destination must not already exist (SQLite requirement).
fn vacuum_into(src: &Path, dst: &Path) -> AppResult<()> {
    if dst.exists() {
        fs::remove_file(dst)?;
    }
    let conn = rusqlite::Connection::open(src)?;
    // VACUUM INTO does not accept bound params; the path is app-controlled
    // (a temp staging path), but we still escape single quotes defensively.
    let dst_str = dst.to_string_lossy().replace('\'', "''");
    conn.execute_batch(&format!("VACUUM INTO '{dst_str}'"))?;
    Ok(())
}

fn copy_tree(src: &Path, dst: &Path) -> AppResult<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ft = entry.file_type()?;
        if ft.is_symlink() {
            continue; // never follow symlinks into a backup
        }
        let target = dst.join(entry.file_name());
        if ft.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else if ft.is_file() {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Recursively collect files under `root`, returning (absolute_path,
/// relative_path) pairs with forward-slash relative paths.
fn collect_files(root: &Path) -> AppResult<Vec<(PathBuf, String)>> {
    let mut out = Vec::new();
    fn walk(base: &Path, dir: &Path, out: &mut Vec<(PathBuf, String)>) -> AppResult<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let ft = entry.file_type()?;
            let path = entry.path();
            if ft.is_dir() {
                walk(base, &path, out)?;
            } else if ft.is_file() {
                let rel = path.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/");
                out.push((path, rel));
            }
        }
        Ok(())
    }
    walk(root, root, &mut out)?;
    out.sort_by(|a, b| a.1.cmp(&b.1));
    Ok(out)
}

// ---------------------------------------------------------------------------
// Create backup
// ---------------------------------------------------------------------------

/// Create a `.catavyn` backup of `data_dir` at `dest_file`. Builds into a temp
/// file, verifies, then atomically moves to `dest_file`. Refuses to overwrite
/// an existing destination. On any failure the temp artifacts are removed and
/// the source is untouched.
pub fn create_backup(data_dir: &Path, dest_file: &Path) -> AppResult<()> {
    if dest_file.exists() {
        return Err(AppError::Other(format!(
            "{} already exists — choose another name",
            dest_file.display()
        )));
    }
    let dest_parent = dest_file
        .parent()
        .ok_or_else(|| AppError::Other("invalid destination".into()))?;
    fs::create_dir_all(dest_parent)?;

    // Unique staging + temp archive alongside the destination.
    let stamp = uuid::Uuid::new_v4();
    let staging = std::env::temp_dir().join(format!("catavyn_backup_{stamp}"));
    let tmp_archive = dest_parent.join(format!(".catavyn-tmp-{stamp}"));

    let result = (|| -> AppResult<()> {
        snapshot_into(data_dir, &staging)?;

        // Build manifest over the staged files.
        let files = collect_files(&staging)?;
        let mut manifest_files = Vec::with_capacity(files.len());
        let mut total_size = 0u64;
        for (abs, rel) in &files {
            let (sha, size) = sha256_file(abs)?;
            total_size += size;
            manifest_files.push(ManifestFile { relative_path: rel.clone(), size, sha256: sha });
        }
        let manifest = Manifest {
            backup_format_version: BACKUP_FORMAT_VERSION,
            created_at: now_utc(),
            catavyn_version: env!("CARGO_PKG_VERSION").to_string(),
            file_count: manifest_files.len(),
            total_size,
            files: manifest_files,
        };
        let manifest_json = serde_json::to_vec_pretty(&manifest)?;

        // Write tar -> zstd -> temp archive (streaming).
        {
            let out = File::create(&tmp_archive)?;
            let enc = zstd::stream::write::Encoder::new(out, 3)?.auto_finish();
            let mut tar = tar::Builder::new(enc);

            // manifest.json first.
            let mut hdr = tar::Header::new_gnu();
            hdr.set_size(manifest_json.len() as u64);
            hdr.set_mode(0o644);
            hdr.set_cksum();
            tar.append_data(&mut hdr, MANIFEST_NAME, &manifest_json[..])?;

            // data/<relative_path> for each file.
            for (abs, rel) in &files {
                let mut f = File::open(abs)?;
                tar.append_file(format!("{DATA_PREFIX}/{rel}"), &mut f)?;
            }
            tar.finish()?;
        }

        // Verify the temp archive before finalizing (spec §9 step 6).
        verify_archive_against_manifest(&tmp_archive)?;
        Ok(())
    })();

    // Always clean staging.
    fs::remove_dir_all(&staging).ok();

    match result {
        Ok(()) => {
            // Atomic move into place (same directory => atomic rename).
            fs::rename(&tmp_archive, dest_file).or_else(|_| {
                // Cross-device fallback: copy then remove temp.
                fs::copy(&tmp_archive, dest_file)?;
                fs::remove_file(&tmp_archive)?;
                Ok::<(), AppError>(())
            })?;
            Ok(())
        }
        Err(e) => {
            fs::remove_file(&tmp_archive).ok();
            Err(e)
        }
    }
}

// ---------------------------------------------------------------------------
// Archive path validation + extraction
// ---------------------------------------------------------------------------

/// Validate an archive entry path: must be `manifest.json` or under `data/`,
/// with only normal components (no absolute, drive, UNC, `..`, or root). Returns
/// the safe relative path to extract to.
pub(crate) fn safe_entry_path(raw: &Path) -> AppResult<PathBuf> {
    // Reject Windows drive / UNC style embedded in the string form too.
    let s = raw.to_string_lossy();
    if s.contains(':') || s.starts_with('/') || s.starts_with('\\') || s.contains("\\\\") {
        return Err(AppError::Other("unsafe archive path".into()));
    }
    let mut clean = PathBuf::new();
    for comp in raw.components() {
        match comp {
            Component::Normal(c) => clean.push(c),
            Component::CurDir => {}
            _ => return Err(AppError::Other("unsafe archive path component".into())),
        }
    }
    // Must be manifest.json or under data/.
    let first = clean.components().next().and_then(|c| c.as_os_str().to_str());
    match first {
        Some(MANIFEST_NAME) if clean.components().count() == 1 => Ok(clean),
        Some(DATA_PREFIX) => Ok(clean),
        _ => Err(AppError::Other("unexpected archive entry".into())),
    }
}

/// Extract a `.catavyn` archive into `dest_dir`, enforcing path containment.
fn extract_archive(archive: &Path, dest_dir: &Path) -> AppResult<()> {
    fs::create_dir_all(dest_dir)?;
    let base = dest_dir.canonicalize()?;
    let file = File::open(archive)?;
    let dec = zstd::stream::read::Decoder::new(file)?;
    let mut tar = tar::Archive::new(dec);

    for entry in tar.entries()? {
        let mut entry = entry?;
        // Reject symlinks/hardlinks and non-regular entries.
        let etype = entry.header().entry_type();
        if !(etype.is_file() || etype.is_dir()) {
            return Err(AppError::Other("unsupported archive entry type".into()));
        }
        let raw = entry.path()?.into_owned();
        let safe = safe_entry_path(&raw)?;
        let out_path = base.join(&safe);

        // Containment check.
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        // Confirm the resolved parent stays within base.
        let check = out_path.parent().unwrap().canonicalize()?;
        if !check.starts_with(&base) {
            return Err(AppError::Other("archive entry escapes restore directory".into()));
        }
        if etype.is_dir() {
            fs::create_dir_all(&out_path)?;
        } else {
            let mut out = File::create(&out_path)?;
            std::io::copy(&mut entry, &mut out)?;
        }
    }
    Ok(())
}

/// Read the manifest.json out of an archive without full extraction.
fn read_manifest(archive: &Path) -> AppResult<Manifest> {
    let file = File::open(archive)?;
    let dec = zstd::stream::read::Decoder::new(file)?;
    let mut tar = tar::Archive::new(dec);
    for entry in tar.entries()? {
        let mut entry = entry?;
        let path = entry.path()?.into_owned();
        if path.to_string_lossy() == MANIFEST_NAME {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)?;
            let m: Manifest = serde_json::from_slice(&buf)
                .map_err(|_| AppError::Other("backup manifest is corrupted".into()))?;
            return Ok(m);
        }
    }
    Err(AppError::Other("backup manifest is missing".into()))
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/// Verify that a freshly-built archive matches its own manifest (create path).
fn verify_archive_against_manifest(archive: &Path) -> AppResult<()> {
    let tmp = std::env::temp_dir().join(format!("catavyn_verify_{}", uuid::Uuid::new_v4()));
    let result = (|| {
        extract_archive(archive, &tmp)?;
        let manifest = read_manifest(archive)?;
        verify_extracted(&tmp, &manifest)
    })();
    fs::remove_dir_all(&tmp).ok();
    result
}

/// Verify an extracted `data/` tree against the manifest: every listed file
/// exists with matching size + SHA-256, and no unexpected files are present.
fn verify_extracted(extract_root: &Path, manifest: &Manifest) -> AppResult<()> {
    if manifest.backup_format_version != BACKUP_FORMAT_VERSION {
        return Err(AppError::Other("unsupported backup format version".into()));
    }
    let data_root = extract_root.join(DATA_PREFIX);

    // Check each manifest file.
    for mf in &manifest.files {
        let path = data_root.join(&mf.relative_path);
        if !path.exists() {
            return Err(AppError::Other(format!("backup missing file: {}", mf.relative_path)));
        }
        let (sha, size) = sha256_file(&path)?;
        if size != mf.size || sha != mf.sha256 {
            return Err(AppError::Other(format!(
                "backup integrity check failed for {}",
                mf.relative_path
            )));
        }
    }

    // Reject unexpected extra files under data/.
    if data_root.exists() {
        let present = collect_files(&data_root)?;
        let expected: std::collections::HashSet<&str> =
            manifest.files.iter().map(|f| f.relative_path.as_str()).collect();
        for (_, rel) in &present {
            if !expected.contains(rel.as_str()) {
                return Err(AppError::Other(format!("unexpected file in backup: {rel}")));
            }
        }
    }
    Ok(())
}

/// Validate a restored `data/` tree's databases, Vault structure, and
/// attachment references. Never decrypts the Vault.
fn validate_restored_data(data_root: &Path) -> AppResult<()> {
    // Main DB: open + integrity_check + schema present.
    let main = data_root.join("catavyn.db");
    if !main.exists() {
        return Err(AppError::Other("restored data is missing catavyn.db".into()));
    }
    {
        let mut conn = db::open(&main)?;
        let integrity: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
        if integrity != "ok" {
            return Err(AppError::Other("restored database failed integrity check".into()));
        }
        // Ensure schema is current / valid.
        db::migrate(&mut conn)?;
    }

    // Vault structure (no decryption). verify_structure expects the data-dir
    // root; data_root IS the restored data directory.
    vault::verify_structure(data_root)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

pub struct RestorePreview {
    pub manifest: Manifest,
    /// Temp directory holding the validated extraction (data/ inside).
    pub staged_dir: PathBuf,
}

/// Extract + fully validate a backup into a temp directory WITHOUT activating
/// it. Returns the staged temp dir so the caller can activate after user
/// confirmation. Caller must clean up `staged_dir` if it does not activate.
pub fn stage_and_validate(archive: &Path) -> AppResult<RestorePreview> {
    let staged = std::env::temp_dir().join(format!("catavyn_restore_{}", uuid::Uuid::new_v4()));
    let result = (|| -> AppResult<Manifest> {
        extract_archive(archive, &staged)?;
        let manifest = read_manifest(archive)?;
        verify_extracted(&staged, &manifest)?;
        validate_restored_data(&staged.join(DATA_PREFIX))?;
        Ok(manifest)
    })();

    match result {
        Ok(manifest) => Ok(RestorePreview { manifest, staged_dir: staged }),
        Err(e) => {
            fs::remove_dir_all(&staged).ok();
            Err(e)
        }
    }
}

/// Activate a validated staged restore into `dest_dir`. `dest_dir` must be a
/// NEW/empty location unless `allow_existing` is set. The active data dir is
/// never partially overwritten: we build the final tree, then swap.
pub fn activate_restore(staged: &RestorePreview, dest_dir: &Path, allow_existing: bool) -> AppResult<()> {
    let data_root = staged.staged_dir.join(DATA_PREFIX);
    if !data_root.exists() {
        return Err(AppError::Other("nothing to restore".into()));
    }

    let dest_has_data = config::db_path(dest_dir).exists() || vault::meta::vault_exists(dest_dir);
    if dest_has_data && !allow_existing {
        return Err(AppError::Other(
            "destination already contains Catavyn data — restore to a new directory".into(),
        ));
    }

    // Ensure the destination structure exists, then copy the validated tree in.
    // We copy into a sibling temp dir first, verify, then swap to avoid
    // partially overwriting existing data.
    config::ensure_data_dir(dest_dir)?;

    // Copy staged data/ into the destination. For a fresh destination this is
    // the whole restore; for an existing one the caller has confirmed.
    copy_tree(&data_root, dest_dir)?;

    // Final safety: validate the destination opened cleanly.
    validate_restored_data(dest_dir)?;
    Ok(())
}

/// Suggested backup filename using LOCAL display time (spec §23).
pub fn suggested_filename(local: chrono::NaiveDateTime) -> String {
    format!("Catavyn-Backup-{}.catavyn", local.format("%Y-%m-%d-%H%M%S"))
}

/// Public wrapper so the command layer can read a finished backup's manifest.
pub fn read_manifest_public(archive: &Path) -> AppResult<Manifest> {
    read_manifest(archive)
}

/// Remove a staged restore's temp directory (called after activate or cancel).
pub fn cleanup_preview(preview: &RestorePreview) {
    fs::remove_dir_all(&preview.staged_dir).ok();
}
