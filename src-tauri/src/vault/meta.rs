use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::vault::crypto;
use crate::vault::kdf::KdfParams;

pub const VAULT_FORMAT_VERSION: u32 = 1;

/// Non-secret Vault metadata persisted as `vault/vault.meta` (JSON). Contains
/// KDF parameters, salt, and the wrapped DEK — never the master credential,
/// KEK, DEK plaintext, or any secret (§8).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMeta {
    pub vault_format_version: u32,
    pub kdf_algo: String,      // "argon2id"
    pub argon2_version: u32,   // 0x13
    pub kdf_m_kib: u32,
    pub kdf_t: u32,
    pub kdf_p: u32,
    pub salt_b64: String,      // KDF salt (non-secret)
    pub enc_algo: String,      // "xchacha20poly1305"
    pub wrapped_dek_b64: String, // EncryptedPayloadV1(KEK, DEK)
    pub sequence: u64,         // bumped on every meta write
    pub created_at: String,
    pub updated_at: String,
}

impl VaultMeta {
    pub fn kdf_params(&self) -> KdfParams {
        KdfParams { m_kib: self.kdf_m_kib, t: self.kdf_t, p: self.kdf_p }
    }

    /// Structural validation used by unlock and by storage-migration
    /// verification (§19). Does NOT decrypt anything.
    pub fn validate_structure(&self) -> AppResult<()> {
        if self.vault_format_version != VAULT_FORMAT_VERSION {
            return Err(AppError::Other("unsupported Vault version".into()));
        }
        if self.kdf_algo != "argon2id" || self.enc_algo != "xchacha20poly1305" {
            return Err(AppError::Other("unsupported Vault algorithms".into()));
        }
        if self.salt_b64.is_empty() || self.wrapped_dek_b64.is_empty() {
            return Err(AppError::Other("incomplete Vault metadata".into()));
        }
        // Wrapped-DEK container must be structurally valid (version+nonce+tag).
        let wrapped = b64_decode(&self.wrapped_dek_b64)?;
        if wrapped.len() < 1 + 24 + 16 || wrapped[0] != 0x01 {
            return Err(AppError::Other("invalid wrapped DEK container".into()));
        }
        b64_decode(&self.salt_b64)?;
        Ok(())
    }

    pub fn salt(&self) -> AppResult<Vec<u8>> {
        b64_decode(&self.salt_b64)
    }
}

pub fn vault_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("vault")
}
pub fn meta_path(data_dir: &Path) -> PathBuf {
    vault_dir(data_dir).join("vault.meta")
}
pub fn db_path(data_dir: &Path) -> PathBuf {
    vault_dir(data_dir).join("vault.db")
}

pub fn vault_exists(data_dir: &Path) -> bool {
    meta_path(data_dir).exists()
}

pub fn load_meta(data_dir: &Path) -> AppResult<VaultMeta> {
    let raw = fs::read_to_string(meta_path(data_dir))?;
    let meta: VaultMeta = serde_json::from_str(&raw)
        .map_err(|_| AppError::Other("Vault metadata is corrupted".into()))?;
    meta.validate_structure()?;
    Ok(meta)
}

/// Crash-safe write of vault.meta: temp file -> flush+fsync -> validate ->
/// atomic replace. Never truncates the only valid meta first (§17/§27).
pub fn write_meta_atomic(data_dir: &Path, meta: &VaultMeta) -> AppResult<()> {
    meta.validate_structure()?;
    let dir = vault_dir(data_dir);
    fs::create_dir_all(&dir)?;
    let final_path = meta_path(data_dir);
    let tmp_path = dir.join("vault.meta.tmp");

    let json = serde_json::to_string_pretty(meta)?;
    {
        use std::io::Write;
        let mut f = fs::File::create(&tmp_path)?;
        f.write_all(json.as_bytes())?;
        f.flush()?;
        f.sync_all()?;
    }

    // Validate the temp file parses before replacing the live file.
    let check = fs::read_to_string(&tmp_path)?;
    let parsed: VaultMeta = serde_json::from_str(&check)
        .map_err(|_| AppError::Other("failed to validate new Vault metadata".into()))?;
    parsed.validate_structure()?;

    // Atomic replace. std::fs::rename is atomic within the same directory on
    // Windows and overwrites the destination.
    fs::rename(&tmp_path, &final_path)?;
    Ok(())
}

fn b64_decode(s: &str) -> AppResult<Vec<u8>> {
    // Minimal, dependency-free base64 (standard alphabet, no padding required).
    base64_decode(s).ok_or_else(|| AppError::Other("invalid base64 in Vault metadata".into()))
}

pub fn b64_encode(bytes: &[u8]) -> String {
    base64_encode(bytes)
}

// --- tiny base64 (standard alphabet, with '=' padding) -------------------
const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(input: &[u8]) -> String {
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | (b[2] as u32);
        out.push(B64[((n >> 18) & 63) as usize] as char);
        out.push(B64[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { B64[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[(n & 63) as usize] as char } else { '=' });
    }
    out
}

fn base64_decode(input: &str) -> Option<Vec<u8>> {
    fn val(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a' + 26) as u32),
            b'0'..=b'9' => Some((c - b'0' + 52) as u32),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let cleaned: Vec<u8> = input.bytes().filter(|&c| c != b'=' && !c.is_ascii_whitespace()).collect();
    let mut out = Vec::with_capacity(cleaned.len() / 4 * 3);
    for chunk in cleaned.chunks(4) {
        if chunk.len() < 2 {
            return None; // a lone trailing char is invalid base64
        }
        let mut n = 0u32;
        for &c in chunk {
            n = (n << 6) | val(c)?;
        }
        // A chunk of k base64 chars carries (k-1) decoded bytes.
        let out_bytes = chunk.len() - 1;
        // Left-align the accumulated bits into the top 24 bits.
        n <<= 6 * (4 - chunk.len());
        let full = [(n >> 16) as u8, (n >> 8) as u8, n as u8];
        out.extend_from_slice(&full[..out_bytes]);
    }
    Some(out)
}

/// Bind crypto helpers so callers use one path for wrapping/unwrapping the DEK.
pub fn wrap_dek(kek: &[u8; 32], dek: &[u8; 32]) -> AppResult<String> {
    let container = crypto::seal(kek, &crypto::wrapped_dek_aad(), dek)?;
    Ok(b64_encode(&container))
}

pub fn unwrap_dek(kek: &[u8; 32], wrapped_b64: &str) -> AppResult<[u8; 32]> {
    let container = b64_decode(wrapped_b64)?;
    let plain = crypto::open(kek, &crypto::wrapped_dek_aad(), &container)?;
    if plain.len() != 32 {
        return Err(AppError::Other("invalid DEK length".into()));
    }
    let mut dek = [0u8; 32];
    dek.copy_from_slice(&plain);
    Ok(dek)
}
