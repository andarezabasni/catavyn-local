use totp_rs::{Algorithm, Secret, TOTP};

use crate::error::{AppError, AppResult};

/// Parameters for a TOTP item (all non-secret except the base32 secret).
pub struct TotpParams<'a> {
    pub secret_base32: &'a str,
    pub algorithm: &'a str, // "SHA1" | "SHA256" | "SHA512"
    pub digits: usize,
    pub period: u64,
    pub issuer: Option<String>,
    pub account: String,
}

/// A generated code plus how many seconds remain in the current period. The
/// generated code is never persisted or logged (§22).
#[derive(serde::Serialize)]
pub struct GeneratedTotp {
    pub code: String,
    pub seconds_remaining: u64,
}

fn algo(name: &str) -> AppResult<Algorithm> {
    match name.to_ascii_uppercase().as_str() {
        "SHA1" => Ok(Algorithm::SHA1),
        "SHA256" => Ok(Algorithm::SHA256),
        "SHA512" => Ok(Algorithm::SHA512),
        other => Err(AppError::Other(format!("unsupported TOTP algorithm: {other}"))),
    }
}

/// Generate the current TOTP code from a decrypted secret. Runs entirely in
/// Rust; the secret is never returned to the caller.
pub fn generate(params: TotpParams, unix_now: u64) -> AppResult<GeneratedTotp> {
    let secret = Secret::Encoded(params.secret_base32.to_string())
        .to_bytes()
        .map_err(|_| AppError::Other("invalid TOTP secret".into()))?;

    let totp = TOTP::new(
        algo(params.algorithm)?,
        params.digits,
        1,
        params.period,
        secret,
    )
    .map_err(|e| AppError::Other(format!("invalid TOTP configuration: {e}")))?;
    // issuer/account are non-secret display metadata only; not needed for code
    // generation in this build of totp-rs.
    let _ = (&params.issuer, &params.account);

    let code = totp.generate(unix_now);
    let seconds_remaining = params.period - (unix_now % params.period);
    Ok(GeneratedTotp { code, seconds_remaining })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_six_digit_code() {
        // RFC 6238 test-vector-ish secret (base32 of "12345678901234567890").
        let p = TotpParams {
            secret_base32: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
            algorithm: "SHA1",
            digits: 6,
            period: 30,
            issuer: Some("Catavyn".into()),
            account: "test".into(),
        };
        let g = generate(p, 59).unwrap();
        assert_eq!(g.code.len(), 6);
        assert!(g.seconds_remaining <= 30);
    }

    #[test]
    fn rejects_bad_algorithm() {
        let p = TotpParams {
            secret_base32: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
            algorithm: "MD5",
            digits: 6,
            period: 30,
            issuer: None,
            account: "x".into(),
        };
        assert!(generate(p, 0).is_err());
    }
}
