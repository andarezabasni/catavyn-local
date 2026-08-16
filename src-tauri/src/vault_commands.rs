use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::repo::settings;
use crate::state::AppState;
use crate::vault::{self, kdf::KdfParams, meta, session::VaultSession, store, totp};

// The Vault session lives in its own managed state so it's independent of the
// notes DB connection. Keys never cross into the renderer (§7/§24).

#[derive(Debug, Serialize)]
pub struct VaultStatus {
    /// A Vault has been created in the current data directory.
    pub exists: bool,
    /// The Vault is currently unlocked in memory.
    pub unlocked: bool,
}

fn data_dir(state: &State<AppState>) -> AppResult<std::path::PathBuf> {
    state.data_dir().ok_or(AppError::NoDataDirectory)
}

#[tauri::command]
pub fn vault_status(state: State<AppState>, session: State<VaultSession>) -> AppResult<VaultStatus> {
    let dir = data_dir(&state)?;
    Ok(VaultStatus {
        exists: meta::vault_exists(&dir),
        unlocked: session.is_unlocked(),
    })
}

/// Create a new Vault with the given master credential. Uses production
/// Argon2id parameters (§5).
#[tauri::command]
pub fn vault_create(
    state: State<AppState>,
    session: State<VaultSession>,
    credential: String,
) -> AppResult<()> {
    let dir = data_dir(&state)?;
    let result = vault::create_vault(&dir, &credential, KdfParams::PRODUCTION);
    // Do not keep the credential around.
    drop(credential);
    result?;
    // Creating does not auto-unlock; require an explicit unlock.
    session.lock();
    Ok(())
}

/// Unlock the Vault: derive KEK, unwrap DEK, open the item store, and store the
/// session. Generic failure on wrong credential / corruption (§13/§25).
#[tauri::command]
pub fn vault_unlock(
    state: State<AppState>,
    session: State<VaultSession>,
    credential: String,
) -> AppResult<()> {
    let dir = data_dir(&state)?;
    let meta = meta::load_meta(&dir)?; // fails closed on corrupt metadata
    let dek = vault::unwrap_with_credential(&meta, &credential)?;
    drop(credential);

    let conn = store::open(&meta::db_path(&dir))?;
    session.set(dek, conn, dir);
    Ok(())
}

#[tauri::command]
pub fn vault_lock(session: State<VaultSession>) -> AppResult<()> {
    session.lock();
    Ok(())
}

/// Register UI activity (e.g. typing in an item form) to reset the inactivity
/// auto-lock timer. Returns whether the Vault is still unlocked. No secret is
/// read or returned.
#[tauri::command]
pub fn vault_keepalive(session: State<VaultSession>) -> AppResult<bool> {
    Ok(session.touch_if_unlocked())
}

const AUTO_LOCK_SETTING_KEY: &str = "vault_auto_lock_secs";

/// Get the configured Vault auto-lock timeout in seconds.
#[tauri::command]
pub fn vault_get_auto_lock(session: State<VaultSession>) -> AppResult<u64> {
    Ok(session.timeout_secs())
}

/// Set the Vault auto-lock timeout (seconds), persisting it to the settings
/// table and applying it to the live session immediately. Floored at 30s.
#[tauri::command]
pub fn vault_set_auto_lock(
    state: State<AppState>,
    session: State<VaultSession>,
    secs: u64,
) -> AppResult<()> {
    let secs = secs.max(30);
    state.with_tx(|tx| settings::set(tx, AUTO_LOCK_SETTING_KEY, &secs.to_string()))?;
    session.set_timeout_secs(secs);
    Ok(())
}

#[tauri::command]
pub fn vault_list_items(session: State<VaultSession>) -> AppResult<Vec<VaultItemListing>> {
    session.with_unlocked(|v| {
        let summaries = store::list(&v.conn)?;
        let mut out = Vec::with_capacity(summaries.len());
        for s in summaries {
            // Derive a non-secret display label by decrypting the item in memory
            // (the Vault is unlocked). Labels are never written to disk in
            // plaintext — they're computed on demand from the encrypted payload.
            let label = match store::get(&v.conn, &s.item_id)? {
                Some(row) => {
                    let aad = vault::crypto::item_aad(&row.item_type, &row.item_id);
                    match vault::crypto::open(v.dek(), &aad, &row.encrypted_payload) {
                        Ok(plain) => serde_json::from_slice::<serde_json::Value>(&plain)
                            .ok()
                            .map(|p| label_for(&s.item_type, &p))
                            .unwrap_or_default(),
                        Err(_) => String::new(),
                    }
                }
                None => String::new(),
            };
            out.push(VaultItemListing {
                item_id: s.item_id,
                item_type: s.item_type,
                created_at: s.created_at,
                updated_at: s.updated_at,
                label,
            });
        }
        Ok(out)
    })
}

/// A listing row with a derived, non-secret display label (no secrets).
#[derive(Debug, Serialize)]
pub struct VaultItemListing {
    pub item_id: String,
    pub item_type: String,
    pub created_at: String,
    pub updated_at: String,
    /// Short human label shown in the list (e.g. account name / issuer / title).
    /// Derived from non-secret fields only; never a password/secret/key/code.
    pub label: String,
}

/// Pick a sensible non-secret label per item type. Never returns password,
/// TOTP secret, recovery codes, or API key values.
fn label_for(item_type: &str, payload: &serde_json::Value) -> String {
    let get = |k: &str| payload.get(k).and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty());
    let label = match item_type {
        "account" => get("name").or_else(|| get("username")).or_else(|| get("website")),
        "totp" => {
            // "issuer (account)" when both present.
            match (get("issuer"), get("account")) {
                (Some(i), Some(a)) => return format!("{i} ({a})"),
                (Some(i), None) => Some(i),
                (None, Some(a)) => Some(a),
                (None, None) => None,
            }
        }
        "apikey" => get("name").or_else(|| get("endpoint")),
        "note" => get("title"),
        "recovery" => get("label").or_else(|| get("name")),
        _ => None,
    };
    label.map(str::to_string).unwrap_or_default()
}

// --- item payloads --------------------------------------------------------

/// The decrypted, structured payload for an item. Only the fields the UI needs
/// are returned, and only while unlocked.
#[derive(Debug, Serialize, Deserialize)]
pub struct VaultItem {
    pub item_id: String,
    pub item_type: String,
    pub created_at: String,
    pub updated_at: String,
    /// Arbitrary JSON object of the item's fields (all previously encrypted).
    pub payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct NewVaultItem {
    pub item_type: String,
    pub payload: serde_json::Value,
}

#[tauri::command]
pub fn vault_get_item(session: State<VaultSession>, item_id: String) -> AppResult<Option<VaultItem>> {
    session.with_unlocked(|v| {
        let Some(row) = store::get(&v.conn, &item_id)? else {
            return Ok(None);
        };
        let aad = vault::crypto::item_aad(&row.item_type, &row.item_id);
        let plain = vault::crypto::open(v.dek(), &aad, &row.encrypted_payload)?;
        let payload: serde_json::Value = serde_json::from_slice(&plain)
            .map_err(|_| AppError::Other("Vault item is corrupted".into()))?;
        Ok(Some(VaultItem {
            item_id: row.item_id,
            item_type: row.item_type,
            created_at: row.created_at,
            updated_at: row.updated_at,
            payload,
        }))
    })
}

#[tauri::command]
pub fn vault_create_item(session: State<VaultSession>, input: NewVaultItem) -> AppResult<String> {
    session.with_unlocked(|v| {
        let id = crate::repo::new_id();
        let now = crate::repo::now();
        let aad = vault::crypto::item_aad(&input.item_type, &id);
        let plain = serde_json::to_vec(&input.payload)?;
        let encrypted = vault::crypto::seal(v.dek(), &aad, &plain)?;
        store::insert(
            &v.conn,
            &store::VaultItemRow {
                item_id: id.clone(),
                item_type: input.item_type,
                created_at: now.clone(),
                updated_at: now,
                encrypted_payload: encrypted,
            },
        )?;
        Ok(id)
    })
}

#[tauri::command]
pub fn vault_update_item(
    session: State<VaultSession>,
    item_id: String,
    payload: serde_json::Value,
) -> AppResult<()> {
    session.with_unlocked(|v| {
        let Some(row) = store::get(&v.conn, &item_id)? else {
            return Err(AppError::Other("Vault item not found".into()));
        };
        // AAD binds to the existing item_type + item_id.
        let aad = vault::crypto::item_aad(&row.item_type, &row.item_id);
        let plain = serde_json::to_vec(&payload)?;
        let encrypted = vault::crypto::seal(v.dek(), &aad, &plain)?;
        store::update(&v.conn, &item_id, &crate::repo::now(), &encrypted)?;
        Ok(())
    })
}

#[tauri::command]
pub fn vault_delete_item(session: State<VaultSession>, item_id: String) -> AppResult<()> {
    session.with_unlocked(|v| store::delete(&v.conn, &item_id))
}

/// Change the master credential: re-derive from the old credential, unwrap the
/// DEK, re-wrap under a new KEK derived from the new credential (fresh salt),
/// and atomically replace vault.meta. Items are NOT re-encrypted (§16).
#[tauri::command]
pub fn vault_change_master_credential(
    state: State<AppState>,
    old_credential: String,
    new_credential: String,
) -> AppResult<()> {
    let dir = data_dir(&state)?;
    let meta = meta::load_meta(&dir)?;

    // Unwrap with the old credential (fails closed on wrong credential).
    let mut dek = vault::unwrap_with_credential(&meta, &old_credential)?;
    drop(old_credential);

    vault::validate_credential(&new_credential)?;

    // New salt + re-wrap under the new KEK.
    let new_salt = vault::crypto::random_bytes(16)?;
    let params = KdfParams::PRODUCTION;
    let rewrap = vault::kdf::with_derived_kek(new_credential.as_bytes(), &new_salt, params, |kek| {
        meta::wrap_dek(kek, &dek)
    });
    drop(new_credential);
    zeroize_dek(&mut dek);

    let wrapped = rewrap?;
    let now = crate::repo::now();
    let new_meta = meta::VaultMeta {
        vault_format_version: meta.vault_format_version,
        kdf_algo: meta.kdf_algo,
        argon2_version: meta.argon2_version,
        kdf_m_kib: params.m_kib,
        kdf_t: params.t,
        kdf_p: params.p,
        salt_b64: meta::b64_encode(&new_salt),
        enc_algo: meta.enc_algo,
        wrapped_dek_b64: wrapped,
        sequence: meta.sequence + 1,
        created_at: meta.created_at,
        updated_at: now,
    };
    // Single atomic vault.meta replacement — inherently crash-safe (§17).
    // On failure the original vault.meta is untouched, so the old credential
    // still works.
    meta::write_meta_atomic(&dir, &new_meta)
}

fn zeroize_dek(dek: &mut [u8; 32]) {
    use zeroize::Zeroize;
    dek.zeroize();
}

// --- TOTP -----------------------------------------------------------------

/// Generate the current TOTP code for a TOTP item. The secret is decrypted in
/// Rust, used, and never returned; only the code + remaining seconds cross IPC.
#[tauri::command]
pub fn vault_generate_totp(
    session: State<VaultSession>,
    item_id: String,
) -> AppResult<totp::GeneratedTotp> {
    session.with_unlocked(|v| {
        let Some(row) = store::get(&v.conn, &item_id)? else {
            return Err(AppError::Other("Vault item not found".into()));
        };
        let aad = vault::crypto::item_aad(&row.item_type, &row.item_id);
        let plain = vault::crypto::open(v.dek(), &aad, &row.encrypted_payload)?;
        let payload: serde_json::Value = serde_json::from_slice(&plain)
            .map_err(|_| AppError::Other("Vault item is corrupted".into()))?;

        let secret = payload.get("secret").and_then(|s| s.as_str())
            .ok_or_else(|| AppError::Other("item has no TOTP secret".into()))?;
        let algorithm = payload.get("algorithm").and_then(|s| s.as_str()).unwrap_or("SHA1");
        let digits = payload.get("digits").and_then(|d| d.as_u64()).unwrap_or(6) as usize;
        let period = payload.get("period").and_then(|p| p.as_u64()).unwrap_or(30);
        let issuer = payload.get("issuer").and_then(|s| s.as_str()).map(String::from);
        let account = payload.get("account").and_then(|s| s.as_str()).unwrap_or("").to_string();

        let unix_now = chrono::Utc::now().timestamp() as u64;
        totp::generate(
            totp::TotpParams { secret_base32: secret, algorithm, digits, period, issuer, account },
            unix_now,
        )
    })
}
