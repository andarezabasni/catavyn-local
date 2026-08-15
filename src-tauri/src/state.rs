use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;

use crate::config::{self, AppConfig};
use crate::db;
use crate::error::{AppError, AppResult};

/// Managed application state. Guards the open SQLite connection and the loaded
/// config behind a Mutex. The connection is `None` until a data directory is
/// selected/opened.
pub struct AppState {
    /// Path to `config.json` in the OS app-config directory.
    pub config_path: PathBuf,
    inner: Mutex<Inner>,
}

struct Inner {
    config: AppConfig,
    conn: Option<Connection>,
}

impl AppState {
    pub fn new(config_path: PathBuf) -> AppResult<Self> {
        let config = AppConfig::load(&config_path)?;
        Ok(Self {
            config_path,
            inner: Mutex::new(Inner { config, conn: None }),
        })
    }

    /// Currently configured data directory, if any.
    pub fn data_dir(&self) -> Option<PathBuf> {
        self.inner.lock().unwrap().config.data_dir.clone()
    }

    /// Point the app at `data_dir`: create the folder structure, open the DB,
    /// run migrations, and persist the choice to config.json.
    pub fn open_data_dir(&self, data_dir: PathBuf) -> AppResult<()> {
        let data_dir = config::ensure_data_dir(&data_dir)?;
        let mut conn = db::open(&config::db_path(&data_dir))?;
        db::migrate(&mut conn)?;

        let mut inner = self.inner.lock().unwrap();
        inner.conn = Some(conn);
        inner.config.data_dir = Some(data_dir);
        inner.config.save(&self.config_path)?;
        Ok(())
    }

    /// Close the active DB connection (release file handles) without clearing
    /// the configured path. Required on Windows before moving/deleting files.
    pub fn close_conn(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.conn = None;
    }

    /// Persist a new active data directory to config and (re)open its DB.
    /// Used after a verified storage migration.
    pub fn switch_data_dir(&self, data_dir: PathBuf) -> AppResult<()> {
        self.open_data_dir(data_dir)
    }

    /// If a data directory was previously configured, reopen it on startup.
    /// Missing directories are tolerated (e.g. a removed drive) — the user is
    /// simply prompted to re-select.
    pub fn restore(&self) -> AppResult<bool> {
        let existing = { self.inner.lock().unwrap().config.data_dir.clone() };
        match existing {
            Some(dir) if dir.exists() => {
                self.open_data_dir(dir)?;
                Ok(true)
            }
            _ => Ok(false),
        }
    }

    /// Run a closure with the active DB connection, or fail if none is open.
    pub fn with_conn<T>(&self, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
        let mut inner = self.inner.lock().unwrap();
        let conn = inner.conn.as_mut().ok_or(AppError::NoDataDirectory)?;
        f(conn)
    }

    /// Run a closure inside a transaction, committing on Ok and rolling back on
    /// Err. Central place for multi-step mutations.
    pub fn with_tx<T>(&self, f: impl FnOnce(&rusqlite::Transaction) -> AppResult<T>) -> AppResult<T> {
        let mut inner = self.inner.lock().unwrap();
        let conn = inner.conn.as_mut().ok_or(AppError::NoDataDirectory)?;
        let tx = conn.transaction()?;
        let result = f(&tx)?;
        tx.commit()?;
        Ok(result)
    }
}
