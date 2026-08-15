use argon2::{Algorithm, Argon2, Params, Version};
use zeroize::Zeroize;

use crate::error::{AppError, AppResult};

/// Argon2id key-derivation parameters, stored (non-secret) in `vault.meta` so
/// they can be raised later without breaking existing Vaults.
#[derive(Debug, Clone, Copy)]
pub struct KdfParams {
    /// Memory cost in KiB.
    pub m_kib: u32,
    /// Time cost (iterations).
    pub t: u32,
    /// Parallelism (lanes). Normative: 1 (cross-machine reproducibility).
    pub p: u32,
}

impl KdfParams {
    /// Production Argon2id parameters. Benchmarked on the target dev machine
    /// (release build) at ~279 ms, within the 250–500 ms interactive-unlock
    /// target (docs/VAULT_SECURITY_SPEC.md §5). 128 MiB is double the OWASP
    /// desktop floor; `p = 1` is normative for cross-machine reproducibility.
    pub const PRODUCTION: KdfParams = KdfParams { m_kib: 131_072, t: 3, p: 1 };
}

/// Derive a 32-byte key (the KEK) from the master credential and salt using
/// Argon2id. `p` is forced to 1 regardless of input to guarantee identical
/// output across machines. Returns an error on invalid parameters.
pub fn derive_kek(credential: &[u8], salt: &[u8], params: KdfParams) -> AppResult<[u8; 32]> {
    let p = Params::new(params.m_kib, params.t, params.p, Some(32))
        .map_err(|e| AppError::Other(format!("invalid KDF params: {e}")))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, p);

    let mut out = [0u8; 32];
    argon
        .hash_password_into(credential, salt, &mut out)
        .map_err(|_| {
            // Do not leak which input caused the failure.
            AppError::Other("key derivation failed".into())
        })?;
    Ok(out)
}

/// Convenience: derive, run `f` with the key, then zeroize the key buffer.
pub fn with_derived_kek<T>(
    credential: &[u8],
    salt: &[u8],
    params: KdfParams,
    f: impl FnOnce(&[u8; 32]) -> AppResult<T>,
) -> AppResult<T> {
    let mut kek = derive_kek(credential, salt, params)?;
    let result = f(&kek);
    kek.zeroize();
    result
}
