<div align="center">
  <img src="public/logo.png" alt="Catavyn Local" width="96" height="96" />

  # Catavyn Local

  A private, offline desktop app for notes, tasks, and a secure vault.
  Your data stays on your own disk. No account, no server, no cloud.

  ![platform](https://img.shields.io/badge/platform-Windows-2C2C2C)
  ![offline](https://img.shields.io/badge/works-offline-6B8B6A)
  ![license](https://img.shields.io/badge/license-MIT-C4A84D)
</div>

Catavyn Local is the offline desktop version of [Catavyn](https://github.com/andarezabasni/catavyn). It keeps the same warm, paper-like interface, but stores everything in a local SQLite database and your own filesystem. It works with no internet, no login, and no database server.

## Features

- **Notes** with rich text, categories, tags, pinning, sub-notes, and a per-note PIN lock
- **Full-text search** powered by SQLite, fast even with thousands of notes
- **Tasks** with priorities, due dates, a mini calendar, and native desktop reminders
- **Attachments**: paste, drag and drop, or pick images and files, with automatic thumbnails
- **Secure Vault** for passwords, TOTP/2FA, recovery codes, API keys, and secure notes
- **Backup and Restore** to a single portable `.catavyn` file
- **Full ownership**: choose where your data lives, move it safely, or delete it
- **Dark mode** and a keyboard-friendly interface

## Privacy and security

- Everything runs locally and offline. No telemetry, no network calls in normal use.
- App files and your data are kept separate, so updating or uninstalling never touches your data.
- The Vault key is derived from your master credential with Argon2id, and data is sealed with XChaCha20-Poly1305 authenticated encryption. Keys stay in the Rust core and are never exposed to the interface.
- If you forget your master credential, the Vault cannot be recovered. There is no backdoor by design.
- A `.catavyn` backup keeps the Vault encrypted, but ordinary notes and attachments inside it are not. Keep backups somewhere you trust.

Catavyn Local is built so that a copy of your data folder cannot reveal Vault secrets without your master credential. It does not protect against a compromised operating system, and it is not claimed to be unbreakable.

## Install

Download the latest build from the [Releases page](https://github.com/andarezabasni/catavyn-local/releases):

- `Catavyn Local_x64-setup.exe` (recommended installer)
- `Catavyn Local_x64_en-US.msi` (MSI alternative)

On first launch, pick a folder for your data, for example `D:\CatavynData`. Everything is stored there and stays portable: copy that folder to another computer, install Catavyn Local, point it at the folder, and continue where you left off.

## Data and storage

```
<your data folder>/
├── catavyn.db          notes, tasks, tags, categories, attachment metadata
├── attachments/        images, files, and generated thumbnails
├── vault/              encrypted vault (vault.meta + vault.db)
└── backups/
```

Manage everything from Settings. Under Storage you can view usage, open the folder, change location safely, or delete all data. Under Backup and Restore you can create and restore `.catavyn` backups.

## Tech stack

- React 19, TypeScript, Vite
- Tailwind CSS v4
- Tauri v2 (Rust) for the desktop shell, filesystem, and security-sensitive operations
- SQLite via `rusqlite`, bundled so no external database is required

The interface talks to the Rust core through Tauri commands. All database access, filesystem work, and cryptography live in Rust. No raw SQL or encryption keys exist in the interface layer.

## Build from source

Requires [Node.js](https://nodejs.org/) 18 or newer and [Rust](https://rustup.rs/).

```bash
npm install
npm run tauri dev      # run in development
npm run tauri build    # produce the installer
```

Run the Rust tests:

```bash
cd src-tauri && cargo test
```

## License

MIT. See [LICENSE](LICENSE).
