
// --- Vault: full end-to-end security tests (low-cost KDF params) ---------
mod vault_tests {
    use crate::config;
    use crate::vault::{self, kdf::KdfParams, meta, session::VaultSession, store};

    // Explicit low-cost params for tests ONLY. Production uses KdfParams::PRODUCTION.
    const TEST_KDF: KdfParams = KdfParams { m_kib: 8192, t: 1, p: 1 };
    const PIN: &str = "123456789012"; // 12-digit minimum

    fn temp_dir() -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("catavyn_vault_{}", uuid::Uuid::new_v4()));
        config::ensure_data_dir(&d).unwrap();
        d
    }

    fn account_payload() -> serde_json::Value {
        serde_json::json!({
            "name": "GitHub",
            "username": "octocat",
            "password": "hunter2-SUPER-SECRET",
            "website": "https://github.com",
            "notes": "primary account"
        })
    }

    fn create_and_unlock(dir: &std::path::Path) -> ([u8; 32], rusqlite::Connection) {
        vault::create_vault(dir, PIN, TEST_KDF).unwrap();
        let m = meta::load_meta(dir).unwrap();
        let dek = vault::unwrap_with_credential(&m, PIN).unwrap();
        let conn = store::open(&meta::db_path(dir)).unwrap();
        (dek, conn)
    }

    fn insert_item(conn: &rusqlite::Connection, dek: &[u8; 32], item_type: &str, payload: &serde_json::Value) -> String {
        let id = crate::repo::new_id();
        let now = crate::repo::now();
        let aad = vault::crypto::item_aad(item_type, &id);
        let ct = vault::crypto::seal(dek, &aad, &serde_json::to_vec(payload).unwrap()).unwrap();
        store::insert(conn, &store::VaultItemRow {
            item_id: id.clone(), item_type: item_type.into(),
            created_at: now.clone(), updated_at: now, encrypted_payload: ct,
        }).unwrap();
        id
    }

    fn contains(haystack: &[u8], needle: &[u8]) -> bool {
        haystack.windows(needle.len()).any(|w| w == needle)
    }

    #[test]
    fn create_unlock_and_roundtrip_account() {
        let dir = temp_dir();
        let (dek, conn) = create_and_unlock(&dir);
        let id = insert_item(&conn, &dek, "account", &account_payload());

        let row = store::get(&conn, &id).unwrap().unwrap();
        let aad = vault::crypto::item_aad(&row.item_type, &row.item_id);
        let plain = vault::crypto::open(&dek, &aad, &row.encrypted_payload).unwrap();
        let got: serde_json::Value = serde_json::from_slice(&plain).unwrap();
        assert_eq!(got["password"], "hunter2-SUPER-SECRET");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn wrong_credential_does_not_unlock() {
        let dir = temp_dir();
        vault::create_vault(&dir, PIN, TEST_KDF).unwrap();
        let m = meta::load_meta(&dir).unwrap();
        assert!(vault::unwrap_with_credential(&m, "999999999999").is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn empty_and_short_pins_rejected() {
        assert!(vault::validate_credential("").is_err());
        assert!(vault::validate_credential("12345").is_err());
        assert!(vault::validate_credential("12345678901").is_err()); // 11 digits
        assert!(vault::validate_credential("123456789012").is_ok());  // 12 digits
        assert!(vault::validate_credential("correct horse").is_ok()); // passphrase
    }

    #[test]
    fn plaintext_secret_absent_from_vault_files() {
        let dir = temp_dir();
        let (dek, conn) = create_and_unlock(&dir);
        insert_item(&conn, &dek, "account", &account_payload());
        insert_item(&conn, &dek, "totp", &serde_json::json!({
            "issuer":"GitHub","account":"octocat","secret":"JBSWY3DPEHPK3PXP","algorithm":"SHA1","digits":6,"period":30
        }));
        insert_item(&conn, &dek, "recovery", &serde_json::json!({ "codes": ["AAAA-BBBB", "CCCC-DDDD"] }));
        drop(conn);

        let mut all = std::fs::read(meta::db_path(&dir)).unwrap();
        if let Ok(wal) = std::fs::read(dir.join("vault").join("vault.db-wal")) {
            all.extend_from_slice(&wal);
        }
        let meta_bytes = std::fs::read(meta::meta_path(&dir)).unwrap();

        for needle in [b"hunter2-SUPER-SECRET".as_ref(), b"JBSWY3DPEHPK3PXP".as_ref(), b"AAAA-BBBB".as_ref()] {
            assert!(!contains(&all, needle), "plaintext secret leaked into vault.db");
            assert!(!contains(&meta_bytes, needle), "plaintext secret leaked into vault.meta");
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn change_credential_preserves_items_and_rotates_access() {
        let dir = temp_dir();
        let (dek, conn) = create_and_unlock(&dir);
        let id = insert_item(&conn, &dek, "account", &account_payload());
        let before = store::get(&conn, &id).unwrap().unwrap().encrypted_payload.clone();
        drop(conn);

        let m = meta::load_meta(&dir).unwrap();
        let dek2 = vault::unwrap_with_credential(&m, PIN).unwrap();
        let new_salt = vault::crypto::random_bytes(16).unwrap();
        let wrapped = vault::kdf::with_derived_kek("newpassphrase-strong".as_bytes(), &new_salt, TEST_KDF, |kek| {
            meta::wrap_dek(kek, &dek2)
        }).unwrap();
        let new_meta = meta::VaultMeta {
            salt_b64: meta::b64_encode(&new_salt), wrapped_dek_b64: wrapped,
            sequence: m.sequence + 1, updated_at: crate::repo::now(), ..m
        };
        meta::write_meta_atomic(&dir, &new_meta).unwrap();

        let m2 = meta::load_meta(&dir).unwrap();
        assert!(vault::unwrap_with_credential(&m2, PIN).is_err());
        assert!(vault::unwrap_with_credential(&m2, "newpassphrase-strong").is_ok());
        let conn = store::open(&meta::db_path(&dir)).unwrap();
        let after = store::get(&conn, &id).unwrap().unwrap().encrypted_payload;
        assert_eq!(before, after, "items must not be re-encrypted on credential change");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn corrupted_meta_fails_closed_and_is_not_replaced() {
        let dir = temp_dir();
        vault::create_vault(&dir, PIN, TEST_KDF).unwrap();
        let meta_path = meta::meta_path(&dir);
        let original = std::fs::read(&meta_path).unwrap();

        std::fs::write(&meta_path, b"{ this is not valid json").unwrap();
        assert!(meta::load_meta(&dir).is_err(), "corrupt meta must fail closed");
        let still = std::fs::read(&meta_path).unwrap();
        assert_ne!(still, original);
        assert!(!contains(&still, b"wrapped_dek_b64"), "must not silently recreate a vault");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn corrupted_ciphertext_fails_closed() {
        let dir = temp_dir();
        let (dek, conn) = create_and_unlock(&dir);
        let id = insert_item(&conn, &dek, "account", &account_payload());
        let mut row = store::get(&conn, &id).unwrap().unwrap();
        let last = row.encrypted_payload.len() - 1;
        row.encrypted_payload[last] ^= 0xFF;
        store::update(&conn, &id, &crate::repo::now(), &row.encrypted_payload).unwrap();

        let bad = store::get(&conn, &id).unwrap().unwrap();
        let aad = vault::crypto::item_aad(&bad.item_type, &bad.item_id);
        assert!(vault::crypto::open(&dek, &aad, &bad.encrypted_payload).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn moved_ciphertext_between_items_fails() {
        let dir = temp_dir();
        let (dek, conn) = create_and_unlock(&dir);
        let id_a = insert_item(&conn, &dek, "account", &account_payload());
        let row_a = store::get(&conn, &id_a).unwrap().unwrap();
        assert!(vault::crypto::open(&dek, &vault::crypto::item_aad("account", "other-id"), &row_a.encrypted_payload).is_err());
        assert!(vault::crypto::open(&dek, &vault::crypto::item_aad("apikey", &id_a), &row_a.encrypted_payload).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn session_locks_and_blocks_access() {
        let dir = temp_dir();
        let (dek, conn) = create_and_unlock(&dir);
        let session = VaultSession::new();
        session.set(dek, conn, dir.clone());
        assert!(session.is_unlocked());
        assert!(session.with_unlocked(|v| store::list(&v.conn)).is_ok());
        session.lock();
        assert!(!session.is_unlocked());
        assert!(matches!(session.with_unlocked(|_| Ok(())), Err(crate::error::AppError::VaultLocked)));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn vault_is_portable_across_copied_dir() {
        let base = std::env::temp_dir().join(format!("catavyn_vport_{}", uuid::Uuid::new_v4()));
        let a = base.join("CatavynData");
        let b = base.join("Copied");
        config::ensure_data_dir(&a).unwrap();

        let (dek, conn) = create_and_unlock(&a);
        let id = insert_item(&conn, &dek, "account", &account_payload());
        drop(conn);

        crate::storage::migrate_data_dir(&a, &b, false).unwrap();

        let m = meta::load_meta(&b).unwrap();
        let dek_b = vault::unwrap_with_credential(&m, PIN).unwrap();
        let conn_b = store::open(&meta::db_path(&b)).unwrap();
        let row = store::get(&conn_b, &id).unwrap().unwrap();
        let aad = vault::crypto::item_aad(&row.item_type, &row.item_id);
        let plain = vault::crypto::open(&dek_b, &aad, &row.encrypted_payload).unwrap();
        let got: serde_json::Value = serde_json::from_slice(&plain).unwrap();
        assert_eq!(got["password"], "hunter2-SUPER-SECRET");

        let raw = std::fs::read_to_string(meta::meta_path(&b)).unwrap();
        assert!(!raw.contains(":\\") && !raw.contains("CatavynData"), "meta must not embed absolute paths");
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn structural_verify_detects_missing_db() {
        let dir = temp_dir();
        vault::create_vault(&dir, PIN, TEST_KDF).unwrap();
        assert!(vault::verify_structure(&dir).is_ok());
        std::fs::remove_file(meta::db_path(&dir)).unwrap();
        assert!(vault::verify_structure(&dir).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn cannot_create_over_existing_vault() {
        let dir = temp_dir();
        vault::create_vault(&dir, PIN, TEST_KDF).unwrap();
        // A second create must refuse rather than overwrite/reset.
        assert!(vault::create_vault(&dir, "999999999999", TEST_KDF).is_err());
        // Original credential still unlocks.
        let m = meta::load_meta(&dir).unwrap();
        assert!(vault::unwrap_with_credential(&m, PIN).is_ok());
        std::fs::remove_dir_all(&dir).ok();
    }
}

// Manual inspection helper: writes a real test Vault to a temp dir and prints
// its file layout + a hexdump-ish check that the plaintext secret is absent.
// Run with: cargo test vault_manual_inspection -- --nocapture --ignored
#[cfg(test)]
mod vault_inspect {
    use crate::config;
    use crate::vault::{self, kdf::KdfParams, meta, store};

    #[test]
    #[ignore]
    fn vault_manual_inspection() {
        let dir = std::env::temp_dir().join(format!("catavyn_inspect_{}", uuid::Uuid::new_v4()));
        config::ensure_data_dir(&dir).unwrap();
        vault::create_vault(&dir, "123456789012", KdfParams { m_kib: 8192, t: 1, p: 1 }).unwrap();
        let m = meta::load_meta(&dir).unwrap();
        let dek = vault::unwrap_with_credential(&m, "123456789012").unwrap();
        let conn = store::open(&meta::db_path(&dir)).unwrap();
        let id = crate::repo::new_id();
        let now = crate::repo::now();
        let aad = vault::crypto::item_aad("account", &id);
        let ct = vault::crypto::seal(&dek, &aad, br#"{"password":"PLAINTEXT-LEAK-CHECK"}"#).unwrap();
        store::insert(&conn, &store::VaultItemRow {
            item_id: id, item_type: "account".into(),
            created_at: now.clone(), updated_at: now, encrypted_payload: ct,
        }).unwrap();
        drop(conn);

        println!("--- vault.meta ---");
        println!("{}", std::fs::read_to_string(meta::meta_path(&dir)).unwrap());
        let db = std::fs::read(meta::db_path(&dir)).unwrap();
        let leaked = db.windows(20).any(|w| w == b"PLAINTEXT-LEAK-CHECK");
        println!("vault.db size = {} bytes; plaintext present = {}", db.len(), leaked);
        assert!(!leaked, "plaintext must not be in vault.db");
        std::fs::remove_dir_all(&dir).ok();
    }
}
