# Catavyn Local

An offline-first, local-first desktop evolution of [Catavyn](https://github.com/andarezabasni/catavyn). All data is stored on the user's own disk — no internet, no server, no cloud backend.

## Status

Early development. The local foundation and core feature parity (Phase 0–1) are in place; the encrypted Vault, attachments, and OCR are planned for later phases.

## What makes it "local"

- Runs entirely offline as a Windows desktop app via Tauri v2
- Structured data lives in a single SQLite file (`catavyn.db`) inside a user-selected data directory
- The user chooses where their data lives (e.g. `D:\CatavynData`) and can move it safely
- Application install and user data are fully separated — uninstalling never deletes data
- Data directory is the source of truth and is portable between machines (no machine-specific state)
- No Supabase, no auth server, no telemetry

## Architecture

```
React / TypeScript
        ↓  (Tauri invoke)
Tauri commands (Rust)
        ↓
repository layer
        ↓
rusqlite → SQLite database file
```

All database access is in Rust. No raw SQL runs in the frontend. Multi-step
mutations run inside transactions with foreign keys enforced.

## Features (Phase 1)

- Notes with categories, tags, pinning, and sub-notes
- Per-note PIN lock (UI lock; real encryption arrives with the Vault)
- Tasks with priority, due date/time, and a mini calendar
- Trash / soft delete + restore + empty trash
- Full-text search (SQLite FTS5)
- Dark mode
- Storage settings: view/open/change data location, storage usage, delete-all with confirmation

## Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4
- Tauri v2 + Rust
- rusqlite (bundled SQLite)

## Running locally

Requires Node 18+ and [Rust](https://rustup.rs/).

```bash
npm install
npm run tauri dev
```

## Building

```bash
npm run tauri build
```

## Tests

Rust data-layer and storage tests:

```bash
cd src-tauri && cargo test
```

## License

MIT — see [LICENSE](LICENSE)
