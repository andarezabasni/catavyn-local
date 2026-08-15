use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use getrandom::getrandom;

use crate::error::{AppError, AppResult};

/// Fixed domain/version tag used in all Vault AAD (§12).
const AAD_DOMAIN: &[u8] = b"CATAVYN-VAULT-V1";
const AAD_SEP: u8 = 0x00;

/// EncryptedPayloadV1 constants (§11).
const CONTAINER_VERSION: u8 = 0x01;
const NONCE_LEN: usize = 24; // XChaCha20-Poly1305 XNonce

/// Build the AAD for a Vault item payload:
///   UTF-8("CATAVYN-VAULT-V1") || 0x00 || item_type || 0x00 || item_id
///
/// Centralized so AAD construction is never duplicated. `item_type`/`item_id`
/// are non-secret application values that never contain a NUL byte.
pub fn item_aad(item_type: &str, item_id: &str) -> Vec<u8> {
    let mut aad = Vec::with_capacity(AAD_DOMAIN.len() + 2 + item_type.len() + item_id.len());
    aad.extend_from_slice(AAD_DOMAIN);
    aad.push(AAD_SEP);
    aad.extend_from_slice(item_type.as_bytes());
    aad.push(AAD_SEP);
    aad.extend_from_slice(item_id.as_bytes());
    aad
}

/// AAD for the wrapped DEK stored in vault.meta:
///   UTF-8("CATAVYN-VAULT-V1") || 0x00 || "wrapped-dek"
pub fn wrapped_dek_aad() -> Vec<u8> {
    let mut aad = Vec::with_capacity(AAD_DOMAIN.len() + 1 + 11);
    aad.extend_from_slice(AAD_DOMAIN);
    aad.push(AAD_SEP);
    aad.extend_from_slice(b"wrapped-dek");
    aad
}

/// Generate `n` bytes from the OS CSPRNG. Panics only if the OS RNG fails,
/// which is treated as unrecoverable.
pub fn random_bytes(n: usize) -> AppResult<Vec<u8>> {
    let mut buf = vec![0u8; n];
    getrandom(&mut buf).map_err(|e| AppError::Other(format!("secure RNG failed: {e}")))?;
    Ok(buf)
}

/// Encrypt `plaintext` under `key` (32 bytes) with the given AAD, returning an
/// EncryptedPayloadV1 container: version(1) || nonce(24) || ciphertext+tag.
/// A fresh random nonce is generated for every call (§11).
pub fn seal(key: &[u8; 32], aad: &[u8], plaintext: &[u8]) -> AppResult<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new(key.into());

    let mut nonce_bytes = [0u8; NONCE_LEN];
    getrandom(&mut nonce_bytes).map_err(|e| AppError::Other(format!("secure RNG failed: {e}")))?;
    let nonce = XNonce::from_slice(&nonce_bytes);

    let ct = cipher
        .encrypt(nonce, Payload { msg: plaintext, aad })
        .map_err(|_| AppError::Other("encryption failed".into()))?;

    let mut out = Vec::with_capacity(1 + NONCE_LEN + ct.len());
    out.push(CONTAINER_VERSION);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Decrypt an EncryptedPayloadV1 container under `key` and AAD. Fails closed on
/// any structural problem, unsupported version, or authentication failure. The
/// error is intentionally generic and never reveals which step failed.
pub fn open(key: &[u8; 32], aad: &[u8], container: &[u8]) -> AppResult<Vec<u8>> {
    if container.len() < 1 + NONCE_LEN + 16 {
        return Err(AppError::Other("invalid payload".into()));
    }
    if container[0] != CONTAINER_VERSION {
        return Err(AppError::Other("unsupported payload version".into()));
    }
    let nonce = XNonce::from_slice(&container[1..1 + NONCE_LEN]);
    let ct = &container[1 + NONCE_LEN..];

    let cipher = XChaCha20Poly1305::new(key.into());
    cipher
        .decrypt(nonce, Payload { msg: ct, aad })
        .map_err(|_| AppError::Other("decryption failed".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_ok() {
        let key = [7u8; 32];
        let aad = item_aad("account", "id-1");
        let ct = seal(&key, &aad, b"secret").unwrap();
        assert_eq!(ct[0], CONTAINER_VERSION);
        assert_eq!(ct.len(), 1 + NONCE_LEN + 6 + 16);
        assert_eq!(open(&key, &aad, &ct).unwrap(), b"secret");
    }

    #[test]
    fn fresh_nonce_per_encryption() {
        let key = [1u8; 32];
        let aad = item_aad("account", "id-1");
        let a = seal(&key, &aad, b"same").unwrap();
        let b = seal(&key, &aad, b"same").unwrap();
        assert_ne!(a, b, "identical plaintext must produce different ciphertext");
    }

    #[test]
    fn wrong_key_fails() {
        let aad = item_aad("account", "id-1");
        let ct = seal(&[1u8; 32], &aad, b"secret").unwrap();
        assert!(open(&[2u8; 32], &aad, &ct).is_err());
    }

    #[test]
    fn modified_ciphertext_fails() {
        let key = [3u8; 32];
        let aad = item_aad("account", "id-1");
        let mut ct = seal(&key, &aad, b"secret").unwrap();
        let last = ct.len() - 1;
        ct[last] ^= 0xFF;
        assert!(open(&key, &aad, &ct).is_err());
    }

    #[test]
    fn modified_aad_fails() {
        let key = [4u8; 32];
        let ct = seal(&key, &item_aad("account", "id-1"), b"secret").unwrap();
        assert!(open(&key, &item_aad("account", "id-2"), &ct).is_err(), "changed id");
        assert!(open(&key, &item_aad("apikey", "id-1"), &ct).is_err(), "changed type");
    }

    #[test]
    fn aad_encoding_is_exact() {
        let aad = item_aad("account", "abc");
        let mut expected = Vec::new();
        expected.extend_from_slice(b"CATAVYN-VAULT-V1");
        expected.push(0x00);
        expected.extend_from_slice(b"account");
        expected.push(0x00);
        expected.extend_from_slice(b"abc");
        assert_eq!(aad, expected);
    }
}
