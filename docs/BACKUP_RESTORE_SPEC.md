# Catavyn Local — Backup & Restore Specification

**Status:** Design / Pre-Implementation  
**Phase:** 4A  
**Scope:** Manual single-file backup and restore

## 1. Goal

Catavyn Local must support a simple, manual backup system.

The user should be able to create one portable `.catavyn` backup file containing the Catavyn data required to restore the application on another laptop.

Primary workflow:

```text
CatavynData
    ↓
Create Backup
    ↓
Catavyn-YYYY-MM-DD-HHmmss.catavyn
```

Restore:

```text
.catavyn
    ↓
Verify
    ↓
Restore to selected Catavyn data directory
    ↓
All supported data becomes available
```

The backup system must work completely offline.

## 2. Core Product Decisions

| Feature | Decision |
|---|---|
| Automatic backup | No |
| Manual backup | Yes |
| Backup format | One `.catavyn` file |
| Backup location | User chooses |
| External SSD/HDD | Supported |
| Laptop migration | Supported |
| Notes | Included |
| Categories | Included |
| Tags | Included |
| Tasks | Included |
| Attachments | Included |
| Vault | Included |
| Vault encryption | Preserved |
| Cloud backup | Not included |
| Incremental backup | Not included |
| Backup history/versioning | Not included |
| Automatic scheduled backup | Not included |

## 3. Backup Contents

A backup represents the user's Catavyn data directory.

Conceptually:

```text
Catavyn Backup
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

Only data required by Catavyn should be included.

Do not include:

- OS-specific paths
- machine IDs
- Windows usernames
- application installation files
- build artifacts
- `target/`
- `node_modules/`
- temporary files
- runtime caches
- logs

Avoid recursively including previous backups.

## 4. Backup Format

The output must be one file:

```text
Catavyn-2026-08-15-233000.catavyn
```

The extension `.catavyn` is the official backup format.

The internal container format must be versioned.

Use a mature standard archive/container implementation compatible with the Rust project. Do not invent a custom archive or compression algorithm.

The exact archive library and format must be documented before implementation.

## 5. Portability

The backup must be portable between computers and must not depend on:

- drive letter
- username
- absolute path
- machine ID
- OS installation
- application installation path

All internal paths remain relative to the Catavyn data directory.

Target workflow:

```text
Laptop A
  ↓
Create Backup
  ↓
External SSD
  ↓
Laptop B
  ↓
Install Catavyn Local
  ↓
Restore .catavyn
  ↓
All data available
```

## 6. Attachments

Include:

- attachment files
- attachment metadata
- relative paths
- image thumbnails
- note relationships

After restore, attachments must still open correctly.

## 7. Vault

Include:

```text
vault/
├── vault.meta
└── vault.db
```

Preserve the existing Vault encryption exactly.

Do not:

- decrypt the Vault
- export plaintext passwords
- export plaintext TOTP secrets
- export plaintext recovery codes
- export plaintext API keys
- add another encryption system around the Vault in Phase 4A

After restore, the existing master credential must unlock the restored Vault.

## 8. Backup Integrity

Every backup must contain an integrity manifest.

Recommended manifest entries:

```text
relative_path
size
SHA-256
```

The manifest detects accidental corruption, truncation, missing files, and incomplete backups.

SHA-256 here is for integrity checking, not authenticity against an attacker who can modify both archive and manifest.

## 9. Backup Creation

When the user selects **Create Backup**:

1. Ask for destination.
2. Create a temporary backup file.
3. Collect supported Catavyn data.
4. Generate manifest.
5. Add files to archive.
6. Verify archive contents.
7. Finalize.
8. Atomically move completed backup to destination.
9. Report success.

If creation fails:

- remove temporary backup
- preserve original CatavynData
- report a clear error
- never claim success for a partial backup

## 10. Database Consistency

The backup must represent a consistent snapshot.

For the main SQLite database:

- respect the existing WAL architecture
- do not blindly copy only `catavyn.db` if the WAL contains required committed data
- use an appropriate SQLite backup/checkpoint/snapshot mechanism

For Vault:

- preserve its existing atomic-write/consistency model
- do not create a backup from half-written Vault state

The implementation must not sacrifice consistency for simpler file copying.

## 11. Backup While Running

The user should not normally need to close Catavyn before creating a backup.

Create a consistent snapshot while Catavyn is running where technically possible.

If a component cannot safely be copied while active, handle that explicitly rather than silently creating an incomplete backup.

## 12. Backup Size

Backups are full snapshots.

Therefore backup size will generally be approximately the size of CatavynData, potentially smaller when compression is effective.

Example:

```text
CatavynData ≈ 2 GB
Backup ≈ 1.2–2 GB
```

The backup does not need to live inside the Catavyn data directory.

The user can select an external SSD/HDD, USB drive, or another folder.

## 13. Compression

Compression is allowed and recommended if supported by a mature archive implementation.

Use a sensible default.

Do not add unnecessary compression configuration in Phase 4A.

## 14. Restore Workflow

Restore must be explicit:

```text
Settings
  ↓
Backup & Restore
  ↓
Restore Backup
  ↓
Choose .catavyn
  ↓
Verify
  ↓
Choose destination
  ↓
Preview/confirm
  ↓
Restore
```

Do not silently overwrite the active data directory.

## 15. Restore Safety

Preferred flow:

```text
.catavyn
  ↓
Extract to temporary directory
  ↓
Validate
  ↓
Verify manifest
  ↓
Verify databases
  ↓
Verify structure
  ↓
Only then activate restored directory
```

If validation fails:

```text
Restore aborted
Original data untouched
```

Never partially overwrite active data.

## 16. Restore Existing Data

If the destination already contains Catavyn data, warn clearly.

Safest default:

**Restore to a new directory.**

Do not silently merge two Catavyn databases.

Do not implement automatic data merging in Phase 4A.

## 17. Restore to New Laptop

The user should be able to install Catavyn Local, select Restore Backup, choose the `.catavyn`, select a data directory, validate, restore, and start using it.

The original laptop is not required.

## 18. Validation Before Restore

Verify:

### Archive

- valid `.catavyn`
- supported format version
- archive readable
- no invalid paths

### Manifest

- manifest exists
- every listed file exists
- sizes match
- SHA-256 hashes match

### Main database

- SQLite opens
- schema valid
- integrity check succeeds

### Vault

If present:

- `vault.meta` parses
- format supported
- required metadata exists
- wrapped DEK structure valid
- `vault.db` opens
- schema valid

Do not decrypt Vault secrets during normal restore validation.

### Attachments

- expected directories exist
- attachment files referenced by metadata exist
- paths stay inside restored data directory

## 19. Path Security

Reject archive entries such as:

```text
../../file
..\..ile
C:\Windowsile
D:nything
\server\share
```

All extraction paths must remain inside the temporary restore directory.

Do not trust archive paths.

Reuse the existing Catavyn path-validation principles.

## 20. Backup Metadata

May contain:

```text
backup_format_version
created_at
catavyn_version
source_data_version
file_count
total_size
```

Do not include:

- master credential
- KEK
- DEK
- plaintext Vault secrets
- unnecessary machine identifiers
- absolute source paths

## 21. Backup Encryption

Phase 4A does **not** require a separate backup password/encryption layer.

The Vault remains independently encrypted.

Important limitation:

> A `.catavyn` backup is not necessarily a fully encrypted container.

Someone possessing the backup may be able to inspect ordinary Notes and attachment contents.

The Vault itself remains encrypted.

A future encrypted-backup feature may add another encryption layer, but it is out of scope now.

## 22. Backup Management

Do not build a complex backup manager.

A simple Settings section is sufficient:

```text
Backup & Restore

[ Create Backup ]
[ Restore Backup ]

Last backup:
2026-08-15 23:30

[ Open Backup Folder ]
```

Do not automatically delete backup files.

## 23. Backup Naming

Recommended:

```text
Catavyn-Backup-YYYY-MM-DD-HHmmss.catavyn
```

Use local display time for the filename.

Use the application's normal UTC timestamp conventions inside metadata.

Do not silently overwrite a filename collision.

## 24. Testing

Add tests for:

### Creation

- successful backup
- exactly one `.catavyn` file
- manifest exists
- hashes correct
- expected data included

### Attachments

- image survives backup/restore
- non-image file survives backup/restore
- thumbnails survive
- relative paths remain valid

### Vault

- Vault survives backup/restore
- Vault remains encrypted
- restored Vault unlocks with original master credential
- Vault is not decrypted during backup

### Portability

```text
Directory A
  ↓
Create backup
  ↓
Fresh Directory B
  ↓
Restore
  ↓
Verify all data
```

### Corruption

- modified archive rejected
- truncated archive rejected
- modified manifest/hash rejected
- missing required file rejected
- corrupted SQLite rejected
- corrupted Vault metadata rejected

### Security

- archive path traversal rejected
- absolute paths rejected
- source absolute paths absent
- master credential absent
- Vault plaintext secrets absent

### Safety

- failed backup does not modify source
- failed restore does not modify active data
- existing data is never silently overwritten

## 25. Definition of Done

Phase 4A is complete when:

- manual `.catavyn` backup works
- backup is one portable file
- destination is user-selectable
- notes/categories/tags/tasks are included
- attachments are included
- Vault is included and remains encrypted
- integrity manifest exists
- backup transfers to another laptop
- restore validates before activation
- corrupted backups are rejected
- path traversal is rejected
- active data is protected
- failures leave source data untouched
- automated tests pass
- manual backup → transfer → restore test succeeds

## 26. Scope Exclusions

Do not implement:

- automatic backups
- scheduled backups
- cloud backup
- Google Drive/OneDrive/Dropbox integration
- incremental backups
- backup history manager
- encrypted backup container
- backup password
- recovery system
- synchronization
- automatic backup deletion
- database merging

## 27. Implementation Review Gate

Before implementation, inspect the current architecture and report:

1. Recommended archive/container format and Rust crate.
2. SQLite/WAL consistency strategy.
3. Safe snapshot strategy while the app is running.
4. Manifest generation and verification.
5. Restore validation.
6. Atomic restore/switching strategy.
7. Path traversal protection.
8. Vault portability without decryption.
9. Expected backup size/performance.
10. Security/data-loss risks.

STOP after this review.

Do not implement Backup & Restore until the architecture review is approved.
