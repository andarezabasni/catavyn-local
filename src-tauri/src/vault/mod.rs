//! Vault security subsystem. Implements the approved architecture from
//! docs/VAULT_SECURITY_SPEC.md:
//!
//!   Master credential -> Argon2id -> KEK -> unwrap DEK -> XChaCha20-Poly1305
//!
//! Sensitive item fields are serialized to JSON and encrypted as a single
//! EncryptedPayloadV1 blob before being written to vault/vault.db. Keys never
//! cross the IPC boundary.

pub mod crypto;
pub mod kdf;
pub mod meta;
pub mod session;
pub mod store;
pub mod totp;

use std::path::Path;

use zeroize::Zeroize;

use crate::error::{AppError, AppResult};
use kdf::KdfParams;

/// Minimum master-credential length for numeric PIN mode (§4). Never reduce.
pub const MIN_PIN_DIGITS: usize = 12;

/// Validate a master credential before use. Rejects empty and (for all-digit
/// credentials) anything shorter than the 12-digit minimum. Alphanumeric
/// passphrases of length >= 1 are allowed (encouraged to be long in the UI).
pub fn validate_credential(cred: &str) -> AppResult<()> {
    if cred.is_empty() {
        return Err(AppError::Other("master credential is required".into()));
    }
    let all_digits = cred.chars().all(|c| c.is_ascii_digit());
    if all_digits && cred.len() < MIN_PIN_DIGITS {
        return Err(AppError::Other(format!(
            "PIN must be at least {MIN_PIN_DIGITS} digits"
        )));
    }
    Ok(())
}

/// Create a brand-new Vault at `data_dir`: generate salt + random DEK, derive
/// KEK from the credential, wrap the DEK, write vault.meta atomically, and
/// initialize the empty item store. Fails if a Vault already exists.
pub fn create_vault(data_dir: &Path, credential: &str, params: KdfParams) -> AppResult<()> {
    validate_credential(credential)?;
    if meta::vault_exists(data_dir) {
        return Err(AppError::Other("Vault already exists".into()));
    }

    let salt = crypto::random_bytes(16)?;
    let dek_bytes = crypto::random_bytes(32)?;
    let mut dek = [0u8; 32];
    dek.copy_from_slice(&dek_bytes);

    let now = crate::repo::now();
    let wrapped = kdf::with_derived_kek(credential.as_bytes(), &salt, params, |kek| {
        meta::wrap_dek(kek, &dek)
    })?;

    let meta = meta::VaultMeta {
        vault_format_version: meta::VAULT_FORMAT_VERSION,
        kdf_algo: "argon2id".into(),
        argon2_version: 0x13,
        kdf_m_kib: params.m_kib,
        kdf_t: params.t,
        kdf_p: params.p,
        salt_b64: meta::b64_encode(&salt),
        enc_algo: "xchacha20poly1305".into(),
        wrapped_dek_b64: wrapped,
        sequence: 1,
        created_at: now.clone(),
        updated_at: now,
    };

    // Initialize the (empty) item store first, then commit metadata.
    {
        std::fs::create_dir_all(meta::vault_dir(data_dir))?;
        let _conn = store::open(&meta::db_path(data_dir))?;
    }
    meta::write_meta_atomic(data_dir, &meta)?;

    dek.zeroize();
    let mut d = dek_bytes;
    d.zeroize();
    Ok(())
}

/// Derive the KEK and unwrap the DEK. Returns the DEK on success. A wrong
/// credential (or corrupt metadata) fails as a generic error (§13/§25).
pub fn unwrap_with_credential(meta: &meta::VaultMeta, credential: &str) -> AppResult<[u8; 32]> {
    validate_credential(credential)?;
    let salt = meta.salt()?;
    kdf::with_derived_kek(credential.as_bytes(), &salt, meta.kdf_params(), |kek| {
        meta::unwrap_dek(kek, &meta.wrapped_dek_b64)
    })
    .map_err(|_| AppError::Other("Unable to unlock Vault.".into()))
}

/// Structural verification for storage migration (§19). Never decrypts.
pub fn verify_structure(data_dir: &Path) -> AppResult<()> {
    // No Vault present is fine (nothing to verify).
    if !meta::vault_exists(data_dir) {
        return Ok(());
    }
    let meta = meta::load_meta(data_dir)?; // parses + validate_structure
    let _ = meta;
    // vault.db must exist, open, and have the expected schema.
    let db = meta::db_path(data_dir);
    if !db.exists() {
        return Err(AppError::Other("vault.db is missing".into()));
    }
    let conn = store::open(&db)?;
    if !store::schema_ok(&conn) {
        return Err(AppError::Other("vault.db schema is invalid".into()));
    }
    Ok(())
}
