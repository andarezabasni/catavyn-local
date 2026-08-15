//! Backup & restore tests. Temp directories only; never the user's real data.

use crate::backup;
use crate::config;
use crate::db;
use crate::repo::{notes, tags, tasks};
use crate::vault::{self, kdf::KdfParams, meta, store as vstore};

const TEST_KDF: KdfParams = KdfParams { m_kib: 8192, t: 1, p: 1 };
const PIN: &str = "123456789012";

fn seed_data_dir(with_vault: bool) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("catavyn_bkp_{}", uuid::Uuid::new_v4()));
    config::ensure_data_dir(&dir).unwrap();
    let mut conn = db::open(&config::db_path(&dir)).unwrap();
    db::migrate(&mut conn).unwrap();

    let n = notes::create(&conn, notes::NewNote { title: Some("Backup me".into()), content: Some("body text".into()), ..Default::default() }).unwrap();
    let t = tags::create(&conn, tags::NewTag { name: "important".into(), color: None }).unwrap();
    tags::attach(&conn, &n.id, &t.id).unwrap();
    tasks::create(&conn, tasks::NewTask { title: "Task".into(), description: None, due_date: Some("2025-01-01".into()), due_time: None, priority: Some("high".into()), position: None }).unwrap();
    drop(conn);

    let att = dir.join("attachments").join("files");
    std::fs::create_dir_all(&att).unwrap();
    std::fs::write(att.join("doc-1.txt"), b"attachment payload").unwrap();

    if with_vault {
        vault::create_vault(&dir, PIN, TEST_KDF).unwrap();
        let m = meta::load_meta(&dir).unwrap();
        let dek = vault::unwrap_with_credential(&m, PIN).unwrap();
        let vconn = vstore::open(&meta::db_path(&dir)).unwrap();
        let id = crate::repo::new_id();
        let now = crate::repo::now();
        let aad = vault::crypto::item_aad("account", &id);
        let ct = vault::crypto::seal(&dek, &aad, br#"{"password":"vault-secret-value"}"#).unwrap();
        vstore::insert(&vconn, &vstore::VaultItemRow {
            item_id: id, item_type: "account".into(), created_at: now.clone(), updated_at: now, encrypted_payload: ct,
        }).unwrap();
    }
    dir
}

fn contains(hay: &[u8], needle: &[u8]) -> bool {
    hay.windows(needle.len()).any(|w| w == needle)
}

#[test]
fn backup_creates_single_file_with_manifest() {
    let dir = seed_data_dir(true);
    let out = dir.parent().unwrap().join(format!("bk-{}.catavyn", uuid::Uuid::new_v4()));
    backup::create_backup(&dir, &out).unwrap();
    assert!(out.exists());
    let manifest = backup::read_manifest_public(&out).unwrap();
    assert_eq!(manifest.backup_format_version, 1);
    assert!(manifest.file_count >= 3);
    assert!(manifest.files.iter().any(|f| f.relative_path == "catavyn.db"));
    assert!(manifest.files.iter().any(|f| f.relative_path.starts_with("vault/")));
    assert!(!manifest.files.iter().any(|f| f.relative_path.starts_with("backups/")));
    std::fs::remove_file(&out).ok();
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn backup_refuses_to_overwrite_existing_file() {
    let dir = seed_data_dir(false);
    let out = dir.parent().unwrap().join(format!("bk-{}.catavyn", uuid::Uuid::new_v4()));
    std::fs::write(&out, b"existing").unwrap();
    assert!(backup::create_backup(&dir, &out).is_err());
    std::fs::remove_file(&out).ok();
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn roundtrip_restore_to_new_dir_preserves_data() {
    let dir = seed_data_dir(true);
    let out = dir.parent().unwrap().join(format!("bk-{}.catavyn", uuid::Uuid::new_v4()));
    backup::create_backup(&dir, &out).unwrap();

    let preview = backup::stage_and_validate(&out).unwrap();
    let dest = dir.parent().unwrap().join(format!("restored-{}", uuid::Uuid::new_v4()));
    backup::activate_restore(&preview, &dest, false).unwrap();
    backup::cleanup_preview(&preview);

    let conn = db::open(&config::db_path(&dest)).unwrap();
    let ns = notes::list(&conn, notes::NoteQuery::default()).unwrap();
    assert_eq!(ns.len(), 1);
    assert_eq!(ns[0].title, "Backup me");
    assert_eq!(tags::list(&conn).unwrap().len(), 1);
    assert_eq!(tasks::list(&conn, None).unwrap().len(), 1);
    assert_eq!(std::fs::read(dest.join("attachments").join("files").join("doc-1.txt")).unwrap(), b"attachment payload");

    let m = meta::load_meta(&dest).unwrap();
    let dek = vault::unwrap_with_credential(&m, PIN).unwrap();
    let vconn = vstore::open(&meta::db_path(&dest)).unwrap();
    let items = vstore::list(&vconn).unwrap();
    assert_eq!(items.len(), 1);
    let row = vstore::get(&vconn, &items[0].item_id).unwrap().unwrap();
    let aad = vault::crypto::item_aad(&row.item_type, &row.item_id);
    let plain = vault::crypto::open(&dek, &aad, &row.encrypted_payload).unwrap();
    assert!(contains(&plain, b"vault-secret-value"));

    std::fs::remove_file(&out).ok();
    std::fs::remove_dir_all(&dir).ok();
    std::fs::remove_dir_all(&dest).ok();
}

#[test]
fn vault_ciphertext_not_decrypted_in_backup() {
    let dir = seed_data_dir(true);
    let out = dir.parent().unwrap().join(format!("bk-{}.catavyn", uuid::Uuid::new_v4()));
    backup::create_backup(&dir, &out).unwrap();
    let raw = std::fs::read(&out).unwrap();
    assert!(!contains(&raw, b"vault-secret-value"), "vault plaintext must not appear in backup");
    std::fs::remove_file(&out).ok();
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn restore_refuses_existing_dir_without_confirmation() {
    let dir = seed_data_dir(false);
    let out = dir.parent().unwrap().join(format!("bk-{}.catavyn", uuid::Uuid::new_v4()));
    backup::create_backup(&dir, &out).unwrap();
    let preview = backup::stage_and_validate(&out).unwrap();

    let existing = seed_data_dir(false);
    assert!(backup::activate_restore(&preview, &existing, false).is_err());
    assert!(backup::activate_restore(&preview, &existing, true).is_ok());
    backup::cleanup_preview(&preview);

    std::fs::remove_file(&out).ok();
    std::fs::remove_dir_all(&dir).ok();
    std::fs::remove_dir_all(&existing).ok();
}

#[test]
fn corrupted_archive_is_rejected() {
    let dir = seed_data_dir(false);
    let out = dir.parent().unwrap().join(format!("bk-{}.catavyn", uuid::Uuid::new_v4()));
    backup::create_backup(&dir, &out).unwrap();

    let mut bytes = std::fs::read(&out).unwrap();
    bytes.truncate(bytes.len() / 2);
    let bad = dir.parent().unwrap().join(format!("bad-{}.catavyn", uuid::Uuid::new_v4()));
    std::fs::write(&bad, &bytes).unwrap();
    assert!(backup::stage_and_validate(&bad).is_err());

    std::fs::remove_file(&out).ok();
    std::fs::remove_file(&bad).ok();
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn manifest_hash_mismatch_is_rejected() {
    let staging = std::env::temp_dir().join(format!("catavyn_badman_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&staging).unwrap();
    let out = staging.join("bad.catavyn");
    {
        let f = std::fs::File::create(&out).unwrap();
        let enc = zstd::stream::write::Encoder::new(f, 3).unwrap().auto_finish();
        let mut tar = tar::Builder::new(enc);
        let manifest = serde_json::json!({
            "backup_format_version": 1, "created_at": "2025-01-01T00:00:00+00:00",
            "catavyn_version": "0.1.0", "file_count": 1, "total_size": 3,
            "files": [{ "relative_path": "catavyn.db", "size": 3, "sha256": "deadbeef" }]
        });
        let mj = serde_json::to_vec(&manifest).unwrap();
        let mut h = tar::Header::new_gnu();
        h.set_size(mj.len() as u64);
        h.set_mode(0o644);
        h.set_cksum();
        tar.append_data(&mut h, "manifest.json", &mj[..]).unwrap();
        let body = b"abc";
        let mut h2 = tar::Header::new_gnu();
        h2.set_size(body.len() as u64);
        h2.set_mode(0o644);
        h2.set_cksum();
        tar.append_data(&mut h2, "data/catavyn.db", &body[..]).unwrap();
        tar.finish().unwrap();
    }
    assert!(backup::stage_and_validate(&out).is_err(), "hash mismatch must be rejected");
    std::fs::remove_dir_all(&staging).ok();
}

#[test]
fn path_traversal_entry_is_rejected() {
    use std::path::Path;
    // The extraction guard rejects traversal / absolute / drive / UNC / unexpected
    // entries. (The tar writer itself also refuses to emit `..` paths, so we test
    // the guard directly against the paths a malicious archive could contain.)
    assert!(backup::safe_entry_path(Path::new("../escape.txt")).is_err());
    assert!(backup::safe_entry_path(Path::new("data/../../escape.txt")).is_err());
    assert!(backup::safe_entry_path(Path::new("/etc/passwd")).is_err());
    assert!(backup::safe_entry_path(Path::new("C:/Windows/x.dll")).is_err());
    assert!(backup::safe_entry_path(Path::new("secrets.txt")).is_err()); // not under data/
    // Legitimate entries are accepted.
    assert!(backup::safe_entry_path(Path::new("manifest.json")).is_ok());
    assert!(backup::safe_entry_path(Path::new("data/catavyn.db")).is_ok());
    assert!(backup::safe_entry_path(Path::new("data/vault/vault.meta")).is_ok());
}

#[test]
fn refused_overwrite_leaves_existing_file_intact() {
    let dir = seed_data_dir(false);
    let out = dir.parent().unwrap().join(format!("keep-{}.catavyn", uuid::Uuid::new_v4()));
    std::fs::write(&out, b"original").unwrap();
    let _ = backup::create_backup(&dir, &out);
    assert_eq!(std::fs::read(&out).unwrap(), b"original");
    std::fs::remove_file(&out).ok();
    std::fs::remove_dir_all(&dir).ok();
}
