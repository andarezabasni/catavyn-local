# Catavyn Local — Project Brief & Development Specification

## 1. Project Context

This project is a new offline-first desktop evolution of the existing Catavyn application.

Existing repository:
https://github.com/andarezabasni/catavyn

The existing Catavyn is a React 19 + Vite + TypeScript application using Tailwind CSS v4, Supabase, and Tauri v2. It currently provides notes, categories, tags, pin support, note locking, daily tasks, full-text search, trash/soft-delete, dark mode, and web + Windows desktop support.

IMPORTANT:
- Do NOT blindly rewrite the existing project.
- First inspect and understand the current repository, architecture, UI, components, stores, services, Tauri commands, database access, and existing behavior.
- Reuse existing UI/components/design language wherever practical.
- The goal is to evolve Catavyn into a separate local-first desktop application, not to destroy the original web/Supabase version.
- Preserve the existing Catavyn project as much as reasonably possible.

## 2. New Product Vision

Working name: Catavyn Local

Catavyn Local is a private, offline-first personal knowledge and secure-storage application.

It should work without:
- Internet
- Supabase
- localhost
- MySQL/PostgreSQL server
- Laragon/XAMPP
- Any cloud backend

The application must run as a normal Windows desktop application through Tauri.

Core architecture:

React/TypeScript
        ↓
Tauri/Rust
        ↓
SQLite + local filesystem
        ↓
User-selected storage directory

The user owns the data completely.

## 3. Primary Goals

1. Reuse the current Catavyn UI and interaction patterns.
2. Replace Supabase-dependent local data functionality with SQLite.
3. Store large binary files such as images on the local filesystem.
4. Allow the user to choose where Catavyn data is stored.
5. Make all core functionality work fully offline.
6. Add a secure encrypted Vault for sensitive information.
7. Add image/file attachments to notes.
8. Make data portable, exportable, and removable.
9. Keep the application maintainable and modular.

## 4. Data Architecture

Use SQLite for structured metadata and local filesystem storage for large files.

Suggested structure:

<user-selected-folder>/
├── catavyn.db
├── attachments/
│   ├── images/
│   ├── files/
│   └── thumbnails/
├── vault/
│   ├── vault.db.enc
│   └── attachments/
├── backups/
└── metadata/

Do NOT store large images directly as SQLite BLOBs unless there is a strong technical reason.

SQLite should contain:
- notes
- categories
- tags
- tasks
- attachment metadata
- settings
- trash state
- timestamps
- search indexes
- other structured application data

Filesystem should contain:
- images
- screenshots
- documents
- other attachments
- encrypted Vault files

## 5. Storage Location

The user must be able to choose a data directory.

Example:

D:\CatavynData

The application should expose:

Settings
→ Storage
→ Current location
→ Change location
→ Open folder
→ Show storage usage
→ Export/backup
→ Delete application data

Changing the storage location must be handled carefully:
- validate the destination
- prevent accidental overwrite
- move/copy data safely
- verify integrity
- update configuration only after successful migration
- provide clear error recovery

The app itself and the user data should be independent.

Example:

C:\Program Files\Catavyn\
D:\CatavynData\

Uninstalling/updating the application must not automatically delete user data.

## 6. Notes

Preserve existing Catavyn note functionality where practical:
- title
- content
- categories
- tags
- pinned notes
- note locking
- full-text search
- trash
- dark mode

Improve notes with:
- image attachments
- file attachments
- drag & drop
- clipboard image paste
- image preview
- attachment metadata
- optional captions/descriptions

Example note:

Title:
Transaction Screenshot — August 15

Tags:
transaction, finance

Description:
Payment confirmation for an SSD purchase.

Attachments:
screenshot.png

## 7. Image/File System

A note can contain zero or many attachments.

Attachment metadata should include approximately:
- id
- note_id
- original_filename
- stored_filename
- relative_path
- mime_type
- file_size
- width/height when applicable
- created_at
- updated_at

Use generated IDs for stored filenames instead of trusting user filenames.

Do not expose arbitrary filesystem paths to the renderer unnecessarily.

Prefer Tauri commands for filesystem operations.

## 8. Secure Vault

Add a separate Vault area.

The Vault is NOT just another normal note category.

Concept:

Sidebar:
- Notes
- Library
- Vault
- Tasks
- Settings

Vault requires unlocking before sensitive data is accessible.

Possible Vault item types:
- account
- username/email
- password
- TOTP/2FA secret
- recovery codes
- secure notes
- API keys
- other sensitive credentials

Security requirements:
- Never store plaintext passwords in SQLite.
- Never store plaintext TOTP secrets.
- Never log secrets.
- Never expose secrets in debug output.
- Avoid storing master PIN directly.
- Avoid putting encryption keys in frontend JavaScript state longer than necessary.
- Prefer cryptographic operations in Rust/Tauri rather than browser-side JavaScript.
- Automatically lock the Vault after inactivity.
- Clear sensitive clipboard contents after a configurable period where possible.
- Add protection against repeated incorrect PIN attempts.

Recommended cryptographic direction:
- Argon2id for deriving a key from the user's master PIN/password.
- A modern authenticated encryption algorithm such as XChaCha20-Poly1305 for encrypted data.
- Unique random salt and nonce values.
- Separate encryption contexts/keys where appropriate.

IMPORTANT:
Do not invent a custom cryptographic algorithm.
Before implementing security-critical code, inspect current Tauri/Rust dependencies and use well-maintained, audited cryptographic libraries.

The Vault should be treated as security-critical functionality.

## 9. Vault UX

Example:

Vault
↓
Unlock Vault
↓
Enter PIN
↓
Decrypt/open Vault
↓
Show sensitive items

Example item:

GitHub
Username: example
Password: ••••••••••
2FA: 123456
Recovery Codes: hidden

Actions:
- Copy username
- Copy password
- Copy 2FA
- Edit
- Delete

Secrets should be hidden by default.

## 10. Search

Preserve existing full-text search behavior and extend it.

Search should eventually cover:
- note title
- note content
- tags
- categories
- attachment filename
- attachment description
- OCR text if OCR is implemented later

SQLite FTS is a strong candidate for local search.

Do not introduce a separate search server.

## 11. Future OCR

Do not implement OCR in the first migration unless the architecture can support it cleanly.

Future goal:

User pastes screenshot
↓
Catavyn stores image
↓
Optional OCR
↓
Extracted text stored as searchable metadata
↓
Search can find the screenshot by its contents

OCR should be treated as a later feature.

## 12. Backup & Export

The application should eventually support:

- manual backup
- restore
- export notes
- export attachments
- export encrypted Vault
- full data archive

Backups containing Vault data must remain encrypted.

Never create an unencrypted password export by default.

## 13. Deletion

The user should have explicit control over deletion.

Possible actions:
- delete note
- empty trash
- delete attachment
- delete Vault item
- delete all Catavyn data
- remove storage location

Dangerous destructive operations should require confirmation.

For "Delete all data", clearly display the exact directory that will be affected.

## 14. Offline Requirement

After installation, Catavyn Local must not require internet access for normal operation.

Do not add:
- Supabase calls
- authentication server
- cloud database
- telemetry
- analytics
- unnecessary remote APIs

If a future online feature is considered, keep it optional and architect it separately from the local core.

## 15. Migration Strategy

Do not immediately delete Supabase code.

First:
1. Audit current Supabase schema and usage.
2. Identify every query/mutation/subscription.
3. Map existing entities to SQLite.
4. Implement local repository/data-access layer.
5. Replace application usage gradually.
6. Test behavior.
7. Only then remove obsolete Supabase dependencies from the Local version.

The original Catavyn web project should remain understandable and recoverable.

## 16. Suggested Architecture

Frontend:

src/
├── components/
├── pages/
├── stores/
├── services/
├── features/
│   ├── notes/
│   ├── tasks/
│   ├── attachments/
│   ├── vault/
│   └── settings/
└── ...

Tauri:

src-tauri/
├── commands/
├── database/
├── filesystem/
├── crypto/
├── vault/
└── ...

Prefer feature-oriented modularity over one huge service file.

Frontend should not directly manipulate arbitrary filesystem paths when a Tauri command can safely perform the operation.

## 17. Development Rules for the Agent

Before writing code:

1. Inspect the entire repository structure.
2. Read package.json.
3. Read the Tauri configuration.
4. Inspect src/.
5. Inspect src-tauri/.
6. Inspect Supabase migrations.
7. Identify current state management.
8. Identify current database/service abstractions.
9. Identify reusable UI components.
10. Run/build/test the existing project if possible.
11. Produce a short architecture assessment before making large changes.

Do not make broad destructive changes without explaining why.

Do not replace working UI just because a different implementation is easier.

Do not add dependencies without checking whether an existing dependency can solve the problem.

Keep TypeScript strict and Rust code idiomatic.

## 18. Implementation Phases

### Phase 0 — Audit
No major feature implementation.

Deliver:
- repository architecture summary
- current feature inventory
- Supabase dependency map
- Tauri capability map
- proposed SQLite schema
- proposed filesystem structure
- migration risks
- list of reusable components

### Phase 1 — Local Foundation
Implement:
- SQLite connection
- migrations
- local data repository
- application configuration
- storage directory selection
- basic settings
- local notes CRUD

Goal:
A note can be created, edited, searched, deleted, and restored entirely offline.

### Phase 2 — Existing Feature Parity
Port:
- categories
- tags
- pinning
- note locking
- tasks
- full-text search
- trash
- dark mode
- existing important interactions

Goal:
Catavyn Local should feel like the existing Catavyn.

### Phase 3 — Attachments
Implement:
- image paste
- drag & drop
- image storage
- previews
- thumbnails
- attachment metadata
- file attachments

### Phase 4 — Vault
Implement:
- master PIN setup
- secure key derivation
- encrypted Vault
- Vault lock/unlock
- password items
- TOTP/2FA secrets
- recovery codes
- secure notes
- auto-lock

This phase requires extra security review.

### Phase 5 — Backup / Export
Implement:
- local backup
- restore
- export/import
- encrypted Vault backup

### Phase 6 — Advanced Features
Potential:
- OCR
- duplicate detection
- advanced search
- file organization
- version history
- automated local backups

## 19. Definition of Done for V1

V1 is successful when:

- Catavyn launches as a Windows desktop application.
- No localhost/server is required.
- No Supabase connection is required.
- Notes persist after restart.
- Data is stored on a user-selected disk location.
- Notes can be searched.
- Existing core Catavyn UX remains recognizable.
- Images can be attached to notes.
- Files remain accessible after application updates.
- User can inspect storage usage.
- User can back up/delete local data.
- The application works without internet.

Vault does NOT need to be part of the first working V1 if implementing it would compromise the quality or security of the foundation.

## 20. Important Product Principle

Catavyn Local should prioritize:

LOCAL > SIMPLE > PRIVATE > RELIABLE

Do not add complexity merely because it is technically possible.

The application should feel fast, private, predictable, and owned by the user.

## 21. First Task

Your FIRST task is NOT to implement everything.

Start with repository reconnaissance.

Inspect the existing Catavyn repository thoroughly and report:

1. Current architecture.
2. Existing UI/components that should be reused.
3. Existing Tauri functionality.
4. Existing Supabase tables/migrations.
5. Existing state management.
6. Existing authentication/note-lock behavior.
7. Current build/run process.
8. What should be preserved.
9. What should be replaced.
10. Recommended SQLite schema.
11. Recommended local filesystem structure.
12. Risks or security concerns.
13. A concrete implementation plan broken into small, testable steps.

Do not modify or delete major parts of the project during this first audit.

After the audit, wait for the next instruction before beginning large-scale implementation.
