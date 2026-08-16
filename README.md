<div align="center">
  <img src="public/logo.png" alt="Catavyn Local" width="96" height="96" />

  # Catavyn Local

  A private, offline-first desktop app for notes, tasks, and a secure vault.
  Your data lives on your disk — no account, no server, no cloud.

  <br/>

  ![platform](https://img.shields.io/badge/platform-Windows-2C2C2C)
  ![offline](https://img.shields.io/badge/works-offline-6B8B6A)
  ![license](https://img.shields.io/badge/license-MIT-C4A84D)
</div>

---

Catavyn Local is the offline desktop evolution of [Catavyn](https://github.com/andarezabasni/catavyn). It keeps the same warm, paper-like interface but replaces the cloud backend with a local SQLite database and your own filesystem. It runs without internet, without a login, and without any database server.

## Features

- **Notes** — rich text, categories, tags, pinning, sub-notes, and a per-note PIN lock
- **Full-text search** — instant, powered by SQLite FTS5, scales to thousands of notes
- **Tasks** — priorities, due dates and times, a mini calendar, and native desktop reminders
- **Attachments** — paste, drag & drop, or pick images and files; automatic image thumbnails
- **Secure Vault** — encrypted store for passwords, TOTP/2FA, recovery codes, API keys, and secure notes
- **Backup & Restore** — one portable `.catavyn` file with an integrity manifest
- **You own your data** — pick where it is stored, move it safely, or delete it entirely
- **Dark mode** and a keyboard-friendly, desktop-native interface

## Privacy & security

- Everything runs locally and offline. There is no telemetry and no network calls during normal use.
- Application files and your data are kept separate. Updating or uninstalling the app never touches your data.
- The Vault is encrypted with a key derived from your master credential (Argon2id) and sealed with XChaCha20-Poly1305 authenticated encryption. Encryption keys never leave the Rust core and are never exposed to the interface.
- If you forget your Vault master credential, the Vault cannot be recovered — by design. There is no backdoor.
- A `.catavyn` backup keeps the Vault encrypted, but ordinary notes and attachments inside it are not separately encrypted. Store backups somewhere you trust.

Catavyn Local is designed so that a copy of your data directory cannot reveal Vault secrets without your master credential. It does not defend against a compromised operating system, and it is not claimed to be unbreakable.

## Install

Download the latest release from the [Releases page](https://github.com/andarezabasni/catavyn-local/releases):

- `Catavyn Local_x64-setup.exe` — recommended installer
- `Catavyn Local_x64_en-US.msi` — MSI alternative

On first launch, choose a folder for your data (for example `D:\CatavynData`). Everything is stored there and stays portable — you can copy that folder to another computer, install Catavyn Local, point it at the folder, and continue where you left off.

## Data & storage

```
<your data folder>/
├── catavyn.db          notes, tasks, tags, categories, attachment metadata
├── attachments/        images, files, and generated thumbnails
├── vault/              encrypted vault (vault.meta + vault.db)
└── backups/
```

Manage storage from **Settings → Storage**: view usage, open the folder, change location safely, or delete all data. Create and restore backups from **Settings → Backup & Restore**.

## Tech stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Tauri v2 (Rust) for the desktop shell, filesystem, and security-sensitive operations
- SQLite via `rusqlite` (bundled — no external database required)

The frontend talks to the Rust core through Tauri commands. All database access, filesystem work, and cryptography live in Rust; no raw SQL or encryption keys exist in the interface layer.

## Build from source

Requires [Node.js](https://nodejs.org/) 18+ and [Rust](https://rustup.rs/).

```bash
npm install
npm run tauri dev      # run in development
npm run tauri build    # produce the installer
```

Run the Rust test suite:

```bash
cd src-tauri && cargo test
```

## License

MIT — see [LICENSE](LICENSE).
