use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// Small application configuration that lives OUTSIDE the user data directory
/// (in the OS app-config dir). It only records WHERE the user's data lives.
///
/// This is the single permitted machine-local artifact. It stores a path that
/// may differ per machine; the actual user data (SQLite + attachments) is fully
/// self-contained inside `data_dir` and carries no machine-specific state.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppConfig {
    /// Absolute path to the user-selected data directory (e.g. `D:\CatavynData`).
    /// `None` until the user picks one on first run.
    pub data_dir: Option<PathBuf>,
}

impl AppConfig {
    /// Load config from `config.json` in the given app-config directory.
    /// Returns a default (empty) config if the file does not exist yet.
    pub fn load(config_path: &Path) -> AppResult<Self> {
        if !config_path.exists() {
            return Ok(Self::default());
        }
        let raw = fs::read_to_string(config_path)?;
        // A corrupt config should not brick the app — fall back to default and
        // let the user re-select their data directory.
        Ok(serde_json::from_str(&raw).unwrap_or_default())
    }

    /// Persist config to `config.json`, creating parent dirs as needed.
    pub fn save(&self, config_path: &Path) -> AppResult<()> {
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let raw = serde_json::to_string_pretty(self)?;
        fs::write(config_path, raw)?;
        Ok(())
    }
}

/// Validate a candidate data directory and ensure it exists. The path is treated
/// as the source of truth; we never derive it from machine identifiers.
pub fn ensure_data_dir(path: &Path) -> AppResult<PathBuf> {
    if path.as_os_str().is_empty() {
        return Err(AppError::InvalidDataDirectory("path is empty".into()));
    }

    // Create the directory (and the standard sub-structure) if missing.
    fs::create_dir_all(path)?;
    fs::create_dir_all(path.join("attachments").join("images"))?;
    fs::create_dir_all(path.join("attachments").join("files"))?;
    fs::create_dir_all(path.join("attachments").join("thumbnails"))?;
    fs::create_dir_all(path.join("backups"))?;
    fs::create_dir_all(path.join("metadata"))?;

    if !path.is_dir() {
        return Err(AppError::InvalidDataDirectory(format!(
            "{} is not a directory",
            path.display()
        )));
    }

    Ok(path.to_path_buf())
}

/// Absolute path to the SQLite database inside a data directory.
pub fn db_path(data_dir: &Path) -> PathBuf {
    data_dir.join("catavyn.db")
}
