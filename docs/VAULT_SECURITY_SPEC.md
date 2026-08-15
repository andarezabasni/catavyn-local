# Catavyn Local — Vault Security Specification

**Status:** Design / Pre-Implementation (revised after Phase 3A review)
**Phase:** 3A
**Scope:** Security architecture and requirements only

> Revision note: Sections 5, 6, 8, 11, 12, 13, 16, 24, 27, and 28 were made
> normative following the Phase 3A security review. Previously-optional choices
> (encrypted-store shape, container/AAD byte layout, Argon2id p, crash-safety
> ordering, migration verification) are now fixed requirements.

## 1. Purpose

Catavyn Local will contain a separate **Vault** for highly sensitive personal information:

- account usernames/emails
- passwords
- TOTP / 2FA secrets
- recovery codes
- API keys
- secure notes
- other credentials

The Vault is a **security-critical subsystem**, not another notes category.

Primary goal:

> If someone obtains a copy of the Catavyn Local data directory, they must not be able to read Vault secrets without the user's master credential.

The Vault must remain portable between computers and must not depend on a specific laptop, CPU, motherboard, Windows installation, Windows username, machine ID, TPM, or application installation path.

---

## 2. Security Principles

1. Local-first and offline.
2. No cloud dependency.
3. No plaintext Vault secrets on disk.
4. No custom cryptography.
5. Cryptographic operations belong in Rust/Tauri, not React.
6. Use well-maintained cryptographic libraries.
7. Fail closed.
8. Do not silently recover from corrupted ciphertext.
9. Never log secrets.
10. Minimize the lifetime of decrypted secrets in memory.
11. Keep Vault storage logically separate from ordinary notes.
12. The user's master credential is required to unlock the Vault.
13. Losing the master credential means the encrypted Vault cannot be recovered by the application.
14. Backups of the Vault must remain encrypted.
15. Portability must be tested explicitly.

---

## 3. Threat Model

### Protect against

The design should protect Vault contents against an attacker who obtains:

- the Catavyn data directory
- `catavyn.db`
- encrypted Vault files
- a backup of the Catavyn data directory
- an old copy of the Vault
- the user's SSD

An attacker must not be able to simply open a file and read passwords, TOTP secrets, recovery codes, or API keys.

### Outside the primary scope

The application is not expected to protect against a fully compromised operating system.

Malware controlling the Windows session may potentially capture keystrokes, read process memory, inspect the clipboard, take screenshots, or interfere with the application.

Do not claim protection against malware with equivalent or higher OS privileges.

---

## 4. Master Credential

The Vault should support a master credential presented as a PIN/passphrase.

For PIN mode:

- minimum length: **12 digits** (never reduce below this)
- leading zeroes must be supported
- no maximum length that would make normal use impractical
- never store the PIN directly

**PIN entropy (normative documentation):**

- A 12-digit numeric PIN is approximately **39.9 bits** of entropy
  (log2(10^12) ≈ 39.86 bits).
- This is a **residual offline-attack risk**: an attacker with a copied Vault
  can guess offline, bounded only by the Argon2id work factor. Application-level
  rate limiting does not help here (see §15).
- The application **must strongly encourage a stronger alphanumeric passphrase**
  in the UI at Vault creation.
- A future alphanumeric passphrase mode is **recommended** and should be
  prioritized.
- The application **must not claim** that a 12-digit PIN provides equivalent
  security to a strong random passphrase.

A future alphanumeric passphrase mode may be added.

Do NOT silently weaken the requirement to a 4-digit or 6-digit PIN. Short PINs have insufficient entropy when an attacker can perform offline guesses against a copied Vault.

Never store the master credential in:

- SQLite
- JSON/config files
- localStorage
- sessionStorage
- logs
- analytics
- crash reports

Avoid keeping it in long-lived React state. Prefer handling credential processing inside the Rust security boundary.

---

## 5. Key Derivation

Use **Argon2id** to derive key material from the master credential.

Conceptual flow:

```text
Master Credential
        ↓
Argon2id
        ↓
32-byte key material
        ↓
Key Encryption Key (KEK)
```

Use a unique, randomly generated salt for each Vault. The salt is not secret and may be stored in Vault metadata.

Do NOT use SHA-256, MD5, a simple hash, or a custom KDF as the password-to-key mechanism.

The RustCrypto `argon2` crate supports Argon2id and direct key derivation. Use its key-derivation API rather than treating a password hash as an encryption key.

Reference:
https://docs.rs/argon2/latest/argon2/

OWASP recommends Argon2id and provides minimum work-factor guidance. Final parameters must be benchmarked on target hardware rather than blindly copied.

Reference:
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

### Parameter selection (normative)

The production Argon2id configuration is:

```text
Argon2id
version = 0x13 (v19)
m = <benchmarked production value>   (KiB)
t = <benchmarked production value>
p = 1                                (normative — see below)
output = 32 bytes (the KEK)
```

**p = 1 is normative.** A single lane makes the derived key identical
regardless of the CPU core count of the machine performing the derivation,
which is required for cross-machine portability (§20). Do not use p > 1.

**Benchmark plan (must be performed before implementation lands):**

1. Start from `m = 64 MiB (65536 KiB)`, `t = 3`, `p = 1`.
2. Measure a single `hash_password_into` derivation on the target machine.
3. Tune `t` (and `m` if needed) so one interactive unlock costs approximately
   **250–500 ms**. Do not drop `m` below the OWASP floor (19 MiB).
4. Record the final `m`, `t`, `p`, and measured time in this document and in
   `vault.meta`.
5. Do NOT treat the starting numbers (64 MiB / t=3 / p=1) as final until the
   benchmark is performed.
6. Do NOT reduce parameters to make tests faster.

**Test parameters:** tests MAY use explicitly injected low-cost Argon2id
parameters (e.g. m = 8 MiB, t = 1) passed in through a test-only configuration
path. The production default code path must NEVER use test parameters.

KDF parameters and version are stored with Vault metadata (§8) so they can be
raised later without breaking existing Vaults.

---

## 6. Encryption

Use authenticated encryption.

Preferred direction:

**XChaCha20-Poly1305**

The RustCrypto `chacha20poly1305` crate provides XChaCha20-Poly1305 AEAD support.

Reference:
https://docs.rs/chacha20poly1305/latest/chacha20poly1305/

Encryption must provide both confidentiality and integrity.

Do NOT use:

- unauthenticated encryption
- ECB
- custom XOR
- homemade cryptography
- reused nonces
- custom authentication

---

## 7. Key Hierarchy

Prefer a randomly generated **Vault Data Encryption Key (DEK)** rather than encrypting every record directly with the Argon2-derived key.

Recommended model:

```text
Master Credential
       ↓
     Argon2id
       ↓
      KEK
       ↓
decrypt wrapped DEK
       ↓
      DEK
       ↓
XChaCha20-Poly1305
       ↓
Vault data
```

The DEK must never be stored plaintext on disk.

Advantages:

- changing the master credential does not require re-encrypting every Vault item
- DEK is independent of the human credential
- future key rotation is easier
- cleaner security model

---

## 8. Vault Storage (normative)

Do not put sensitive Vault fields into the normal Catavyn database in plaintext.

**Normative structure:**

```text
<CatavynData>/
├── catavyn.db
├── attachments/
│   ├── images/
│   ├── files/
│   └── thumbnails/
├── vault/
│   ├── vault.meta
│   └── vault.db
├── backups/
└── metadata/
```

### vault.db (normative)

`vault.db` is a **normal SQLite database**. The SQLite file itself is NOT
encrypted as a whole. It contains ONLY the following per item:

```text
item_id           TEXT PRIMARY KEY   (non-secret)
item_type         TEXT               (non-secret)
created_at        TEXT               (non-secret)
updated_at        TEXT               (non-secret)
encrypted_payload BLOB               (authenticated ciphertext, see §11)
```

- Do NOT store any sensitive field (password, TOTP secret, recovery codes,
  API key, secure-note content, username, website, etc.) in plaintext columns.
- All sensitive values for an item are serialized and encrypted BEFORE being
  written into `encrypted_payload`.
- The file is named `vault.db` (not `vault.db.enc`) because the database as a
  whole is not encrypted — only the per-item payload column is.
- Do NOT use SQLCipher. Do NOT implement SQLite page-level encryption.
- The non-secret metadata columns exist so the UI can list/sort items and so
  the AEAD associated data (§12) can be reconstructed at decrypt time.

### vault.meta (normative)

`vault.meta` contains only non-secret material:

- vault_format_version
- KDF algorithm
- Argon2id version
- Argon2id parameters (m, t, p)
- salt (KDF salt, not secret)
- wrapped DEK (DEK encrypted under the KEK; see §7 and §11)
- encryption algorithm/version
- metadata sequence/version
- created_at
- updated_at

`vault.meta` must NEVER contain:

- master credential
- KEK
- DEK plaintext
- any Vault secret

---

## 9. Vault Item Types

Initial types:

### Account

- name
- username/email
- password
- website
- notes

### TOTP

- issuer
- account
- secret
- algorithm
- digits
- period

### Recovery Codes

- codes

### API Key

- name
- key
- endpoint
- notes

### Secure Note

- title
- content

All sensitive values must be encrypted.

---

## 10. Metadata vs Secrets

Minimal non-sensitive metadata may remain outside encryption when useful for UX:

```text
item_id
item_type
created_at
updated_at
```

Sensitive values must remain encrypted.

Prefer encrypting more rather than less when uncertain.

Do not expose plaintext password, TOTP secret, recovery codes, API keys, or secure note content through unencrypted database columns.

---

## 11. Nonces and AEAD (normative container format)

Every encryption operation must use a unique, unpredictable nonce.

For XChaCha20-Poly1305:

- generate a fresh **24-byte** nonce using OS-backed secure randomness for
  every encryption operation
- the same nonce must NEVER be reused with the same DEK
- store the nonce alongside the ciphertext
- the nonce is not secret

### EncryptedPayloadV1 (normative)

The `encrypted_payload` column and the wrapped DEK both use this versioned
binary container:

```text
EncryptedPayloadV1 (byte layout):

  offset 0      : version              (1 byte,  value = 0x01)
  offset 1      : nonce                (24 bytes, XChaCha20-Poly1305 XNonce)
  offset 25..   : ciphertext_and_tag   (remaining bytes: ciphertext || 16-byte
                                        Poly1305 tag, as produced by the AEAD)
```

- Total length = 1 + 24 + (plaintext_len + 16).
- The cipher is XChaCha20-Poly1305 (§6).
- On decrypt: read the version byte; reject if unsupported (§26). Split the
  24-byte nonce and the remaining ciphertext+tag. AEAD verification failure →
  reject and fail closed (§25).
- The wrapped DEK stored in `vault.meta` uses the same EncryptedPayloadV1
  layout, with the KEK as the key and the DEK bytes as the plaintext.

---

## 12. Associated Data (normative AAD encoding)

AEAD associated data binds each item ciphertext to its context so a ciphertext
for one Vault item cannot be silently transferred to another item (different
id) or reinterpreted as another type.

**Normative AAD byte encoding for item payloads:**

```text
AAD =
  UTF-8("CATAVYN-VAULT-V1")
  || 0x00
  || UTF-8(item_type)
  || 0x00
  || UTF-8(item_id)
```

Where:

- `"CATAVYN-VAULT-V1"` is the fixed 16-byte ASCII domain/version tag.
- `0x00` is a single separator byte (prevents ambiguity between fields).
- `item_type` and `item_id` are the exact UTF-8 bytes of the non-secret values
  stored in the corresponding `vault.db` columns, so the AAD is reconstructable
  at decrypt time.
- `item_type` and `item_id` must not themselves contain a `0x00` byte (they are
  application-generated identifiers / a fixed enum, so this holds).

AAD is passed to XChaCha20-Poly1305 as the AEAD associated data on both encrypt
and decrypt. It is authenticated but not encrypted, and it is not stored inside
the container (it is derived from the row's metadata columns).

AAD must NEVER contain secrets.

The wrapped DEK in `vault.meta` uses a fixed AAD of
`UTF-8("CATAVYN-VAULT-V1") || 0x00 || UTF-8("wrapped-dek")`.

This encoding must be covered by tests (§28), including the moved-item-id and
moved-item-type rejection cases.

---

## 13. Unlock Flow

```text
Open Vault
    ↓
Enter Master Credential
    ↓
Argon2id (params + salt from vault.meta)
    ↓
Derived KEK
    ↓
Decrypt (unwrap) wrapped DEK with KEK via XChaCha20-Poly1305
    ↓
AEAD authentication of the wrapped DEK succeeds
    ↓
Vault unlocked (DEK held only in the Rust security boundary)
```

**Authentication definition (normative):** successful Vault authentication IS
the successful AEAD unwrap of the wrapped DEK under the KEK derived from the
master credential. There is NO additional custom MAC or separate password
verifier. If the AEAD unwrap of the wrapped DEK fails, the credential is wrong
(or the metadata is corrupt) and the Vault remains locked.

If authentication/decryption fails:

```text
Vault remains locked
```

Prefer a generic error such as:

> Unable to unlock Vault.

Do not reveal which internal cryptographic step failed.

---

## 14. Auto-Lock

Default target: **5 minutes of inactivity**.

When locked:

- clear active decrypted Vault state
- release sensitive key material where practical
- remove secrets from React state
- stop Vault-related background operations
- require the master credential again

Also provide a manual **Lock Vault** action.

---

## 15. Failed Attempts

Implement defense-in-depth against repeated unlock attempts:

- increasing delay/backoff after repeated failures
- no unlimited rapid attempts from the UI
- generic failure messages

Important:

Application-level rate limiting does NOT protect a copied Vault from offline guessing. Master credential strength and Argon2id work factor remain essential.

---

## 16. Changing the Master Credential

With the DEK architecture, changing the master credential should re-wrap the DEK rather than re-encrypt every record.

Conceptually:

```text
Old Credential
      ↓
Argon2id
      ↓
Old KEK
      ↓
Decrypt wrapped DEK
      ↓
New Credential
      ↓
Argon2id
      ↓
New KEK
      ↓
Re-wrap DEK
```

If any step fails, preserve the original valid Vault.

---

## 17. Lost Master Credential

There is **no password-reset mechanism that bypasses Vault encryption**.

If the user forgets the master credential and has no valid recovery mechanism:

```text
Vault cannot be decrypted.
```

Do NOT implement:

- admin bypass
- hidden developer PIN
- hardcoded master password
- recovery password stored by Catavyn
- plaintext backup key
- reset-PIN-and-keep-data

Such mechanisms would undermine the encryption model.

---

## 18. Recovery

A future recovery/export mechanism may be implemented separately.

If recovery is added, it must be an explicit user-controlled security feature such as an encrypted recovery key or emergency recovery package.

Do not implement recovery in the initial Vault version unless it has its own reviewed design.

---

## 19. Backup

Backups must preserve Vault encryption.

Never create plaintext exports by default:

```text
passwords.json
```

A full Catavyn backup should contain the encrypted Vault representation required for restore.

Portability target:

```text
CatavynData
      ↓
Laptop B
      ↓
Install Catavyn Local
      ↓
Select CatavynData
      ↓
Enter Master Credential
      ↓
Vault unlocks
```

### Storage migration verification (normative)

When copying / migrating a Catavyn data directory (the existing safe
copy-verify-switch flow), verification MUST include the following. The goal is
**structural integrity, not exposing secrets** — the Vault is NOT decrypted
during a normal migration unless it is already explicitly unlocked.

Normal Catavyn database:

```text
PRAGMA integrity_check   (on catavyn.db)
```

Vault (only if a Vault exists in the source):

- the `vault/` directory exists
- `vault.meta` exists and parses
- `vault_format_version` is supported
- required `vault.meta` fields exist (KDF algo/params, salt, wrapped DEK,
  enc algo/version, sequence)
- the wrapped-DEK container is structurally valid (EncryptedPayloadV1: version
  byte + 24-byte nonce + non-empty ciphertext+tag)
- `vault.db` exists
- `vault.db` opens as SQLite successfully
- the `vault.db` schema is valid (expected table/columns present)
- no required Vault file is missing

Do NOT attempt to decrypt Vault secrets during migration. Do NOT require the
master credential to perform a migration. If any structural check fails, the
migration must fail closed and leave the source untouched (consistent with the
existing Phase 1 migration guarantees).

---

## 20. Portability

Vault encryption must not depend on:

- Windows account
- machine ID
- CPU
- motherboard
- TPM
- disk serial number
- application installation path

Test explicitly:

```text
Directory A
    ↓
Create Vault item
    ↓
Lock Vault
    ↓
Copy CatavynData to Directory B
    ↓
Open Directory B
    ↓
Unlock using same credential
    ↓
Secret matches original
```

---

## 21. Clipboard Security

When copying a password, TOTP code, recovery code, or API key:

1. Copy only when explicitly requested.
2. Never log the value.
3. Clear the clipboard after a configurable short period where technically possible.
4. Do not keep clipboard contents in React state.
5. Clearly indicate that a secret was copied.

If the implementation cannot determine whether the clipboard still contains Catavyn's value, do not blindly overwrite newer user clipboard contents.

---

## 22. TOTP / 2FA

TOTP secrets are sensitive and must be encrypted.

Conceptual flow:

```text
Encrypted TOTP secret
        ↓
Decrypt inside Rust
        ↓
Generate current TOTP
        ↓
Return only short-lived code
        ↓
Do not persist generated code
```

Do not store generated 6-digit codes.

Do not log TOTP secrets or generated codes.

Use a well-maintained TOTP library. Do not implement TOTP cryptography manually.

**Library (normative direction):** use `totp-rs` (or another well-maintained,
toolchain-compatible TOTP library confirmed against the final dependency tree).
It must support base32 secrets, SHA1/SHA256/SHA512, configurable digits, and
configurable period. Exact version is pinned at implementation time after
checking the resolved dependency tree.

---

## 23. Logging

Never log:

- master credential
- KEK
- DEK
- encryption keys
- passwords
- TOTP secrets
- TOTP codes
- recovery codes
- API keys
- secure note content
- decrypted Vault payloads

Error messages must also avoid secret values.

---

## 24. Memory and IPC (normative)

Security-sensitive buffers should use appropriate zeroization techniques where
practical (e.g. `zeroize` / `ZeroizeOnDrop` for KEK, DEK, and derived-key
buffers). The in-memory unlocked DEK must be zeroized on lock and on drop.

Avoid unnecessary cloning of secret strings/byte arrays.

Prefer:

```text
Vault secret
    ↓
Rust security boundary
    ↓
minimal IPC response
```

**Master credential over IPC (normative acknowledgement):**

The master credential necessarily crosses the Tauri IPC boundary in memory,
because the user enters it through the WebView and it must reach Rust to derive
the KEK. This is acceptable under the current threat model (§3 excludes a
compromised operating system).

Required mitigations:

- do not persist the master credential anywhere (§4)
- clear the credential input in the UI immediately after submission
- process it immediately in Rust into the KEK; do not keep it in long-lived
  React/application state
- do not log it (§23)
- do not return it to the renderer

The KEK and DEK must NEVER cross into the renderer.

Do NOT expose commands such as:

```text
get_raw_encryption_key
get_dek
get_kek
```

to the renderer. The renderer never receives raw cryptographic keys — only the
specific decrypted field values it needs, on demand, and short-lived TOTP codes
(§22).

---

## 25. Error Handling

Security failures must fail closed.

Examples:

- corrupted metadata → remain locked
- invalid ciphertext → reject
- wrong key → reject
- invalid nonce → reject
- unsupported Vault version → reject or controlled migration
- corrupted Vault → do not replace with an empty Vault

Never silently replace corrupted Vault data.

---

## 26. Format Versioning

Vault storage must include an explicit format version:

```text
vault_format_version = 1
```

Future changes should migrate deliberately:

```text
Version 1
    ↓
controlled migration
    ↓
Version 2
```

Do not silently reinterpret old ciphertext using new parameters.

---

## 27. Atomic Writes and Crash Safety (normative)

The Vault spans two files (`vault.db` and `vault.meta`). The crash-safety model
is defined explicitly per file.

### vault.db (item data)

- Normal item create/update/delete primarily modifies `vault.db` and MUST use
  SQLite transactions. SQLite's own WAL + transaction guarantees provide
  crash safety for item data.
- A crash mid-transaction leaves `vault.db` at its last committed state.

### vault.meta (KDF params + wrapped DEK)

`vault.meta` changes MUST use temp-file + atomic replace:

```text
1. write a temporary metadata file (vault.meta.tmp)
2. flush + fsync the temp file
3. validate the temp file (parses, required fields present,
   wrapped-DEK container structurally valid)
4. atomically replace vault.meta with the temp file
5. never truncate or overwrite the only valid vault.meta first
```

On Windows, use an atomic replace mechanism (e.g. `ReplaceFileW` semantics /
a documented atomic-rename strategy). Failure cases must be tested.

### Master credential change

- Item data (`vault.db`) is unchanged by a credential change.
- Only the wrapped DEK and KDF metadata in `vault.meta` change.
- Therefore a credential change is a single atomic `vault.meta` replacement and
  is inherently crash-safe: either the old `vault.meta` (old credential) or the
  new one (new credential) is present after any crash — never a broken state.

### Consistency & fail-closed

- The Vault must NEVER silently become an empty Vault because of a partial
  write (§25, §28).
- `vault.meta` carries a metadata sequence/version. If a consistency mismatch
  is detected (e.g. metadata missing/unparseable while `vault.db` exists, or
  vice versa), the application must FAIL CLOSED and preserve the existing files
  rather than reinitializing.
- Do not overwrite the only valid metadata copy before the replacement is
  durably prepared and validated.

---

## 28. Security Tests

Before declaring Vault complete, test at minimum:

### Encryption / AEAD (normative)

- identical plaintext encrypted twice produces DIFFERENT ciphertext
  (fresh nonce per operation)
- wrong DEK cannot decrypt
- modified ciphertext fails authentication
- modified AAD fails authentication
- ciphertext moved to another item_id fails authentication
- ciphertext moved to another item_type fails authentication
- corrupted ciphertext fails authentication
- plaintext password does not appear in `vault.db`
- plaintext TOTP secret does not appear in `vault.db`
- plaintext recovery codes do not appear in `vault.db`
- plaintext secrets do not appear in `vault.meta`

### Credential

- correct credential unlocks
- incorrect credential does not unlock
- wrong master credential cannot unwrap the DEK
- empty credential is rejected
- short PIN (< 12 digits) is rejected
- master credential is never persisted

### Locking

- manual lock works
- auto-lock works
- locked Vault cannot return secrets
- unlock restores access

### Credential change

- changing master credential preserves ALL item ciphertext (items not
  re-encrypted; only the wrapped DEK / KDF metadata change)
- old credential stops working after change
- new credential works after change
- contents remain intact
- failed change leaves the original Vault usable

### Portability

- Vault can be copied to another directory
- copied Vault can be unlocked with the same credential
- no original absolute path is required

### Corruption / fail-closed

- corrupted `vault.meta` is rejected (fails closed)
- corrupted `vault.db` store is rejected (fails closed)
- the application NEVER silently initializes an empty Vault over an existing
  corrupted Vault
- the application does not replace corrupted Vault data with empty data

### Logs

- test/build output contains no real test secrets

---

## 29. Security Review Gate

**Before implementing Vault**, the agent must first provide:

1. Final cryptographic architecture.
2. Exact crates and versions it intends to use.
3. Exact Argon2id parameters and benchmark reasoning.
4. Vault file format.
5. Key hierarchy.
6. Encryption/decryption flow.
7. IPC design.
8. Memory-handling strategy.
9. Backup strategy.
10. Master credential change strategy.
11. Corruption/crash-safety strategy.
12. Test plan.

The agent must **STOP after presenting this design**.

Do not begin implementation until the architecture has been reviewed.

---

## 30. Recommended Cryptographic Stack

Preferred direction:

```text
Argon2id
    ↓
KEK
    ↓
wrapped random DEK
    ↓
XChaCha20-Poly1305
    ↓
encrypted Vault
```

Candidate Rust ecosystem (exact versions pinned at implementation time after
checking the resolved dependency tree against rustc 1.96.1):

- `argon2 = "0.5"` — Argon2id key derivation (`hash_password_into`)
- `chacha20poly1305 = "0.10"` — XChaCha20-Poly1305 AEAD
- `zeroize = "1"` — key-buffer zeroization
- `getrandom = "0.2"` (already in the tree) — OS-backed secure randomness for
  salt, nonces, and DEK generation
- `totp-rs = "5"` — TOTP generation

Do not blindly add every dependency. Check compatibility with the project's
current Rust toolchain and dependency tree before selecting exact versions.
Avoid introducing a second major version of `getrandom`/`rand` where the
existing tree can satisfy the requirement.

---

## 31. What the Vault Must NOT Do

Never:

- store plaintext passwords
- store plaintext TOTP secrets
- store plaintext recovery codes
- store encryption keys in config files
- hardcode a master key
- use a fixed encryption key
- use a fixed nonce
- derive an encryption key with SHA-256 alone
- implement custom cryptography
- send encryption keys to React
- log secrets
- create plaintext backups by default
- use machine-bound encryption that breaks portability
- silently erase a corrupted Vault
- provide a hidden developer/admin bypass
- pretend to protect against a compromised operating system

---

## 32. Definition of Done

Vault is complete only when:

- Vault is separate from normal Notes.
- Master credential is required.
- Sensitive values are encrypted at rest.
- Authenticated encryption is used.
- Argon2id is used for credential-based key derivation.
- A random DEK is used according to the approved architecture.
- Keys are not exposed to the renderer.
- Auto-lock works.
- Manual lock works.
- Wrong credentials cannot unlock it.
- Master credential can be changed safely.
- Vault remains portable between computers.
- Encrypted backups remain encrypted.
- Corrupted Vault data fails safely.
- Security tests pass.
- No secrets appear in logs or normal database inspection.
- Important cryptographic choices are documented.

---

## 33. Final Product Principle

> **The user owns the data, the user owns the key, and Catavyn must not have a hidden way around that key.**

Security should be prioritized over convenience whenever the two conflict.

This specification intentionally prefers a smaller, well-reviewed Vault over a feature-rich but questionable password manager.
