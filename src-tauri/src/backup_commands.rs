use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::backup;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::vault::session::VaultSession;

// Backup & Restore commands. The Vault is never decrypted here; backups copy
// vault.meta + vault.db verbatim (still encrypted).

#[derive(Debug, Serialize)]
pub struct BackupResult {
    pub path: String,
    pub file_count: usize,
    pub total_size: u64,
}

/// Create a `.catavyn` backup. Opens a save dialog with a suggested filename,
/// then builds + verifies the archive and atomically moves it into place.
#[tauri::command]
pub async fn create_backup(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<BackupResult>> {
    let data_dir = state.data_dir().ok_or(AppError::NoDataDirectory)?;

    // Suggested name uses local display time (spec §23).
    let local = chrono::Local::now().naive_local();
    let suggested = backup::suggested_filename(local);

    let picked = app
        .dialog()
        .file()
        .set_file_name(&suggested)
        .add_filter("Catavyn Backup", &["catavyn"])
        .blocking_save_file();
    let Some(dest) = picked else { return Ok(None) };
    let dest = dest
        .into_path()
        .map_err(|e| AppError::Other(e.to_string()))?;

    backup::create_backup(&data_dir, &dest)?;

    // Report manifest stats by reading them back from the finished file.
    let manifest = backup::read_manifest_public(&dest)?;
    Ok(Some(BackupResult {
        path: dest.display().to_string(),
        file_count: manifest.file_count,
        total_size: manifest.total_size,
    }))
}

#[derive(Debug, Serialize)]
pub struct RestoreValidation {
    pub created_at: String,
    pub file_count: usize,
    pub total_size: u64,
    /// Opaque token identifying the staged temp dir for a follow-up activate.
    pub token: String,
}

/// Pick a `.catavyn`, extract it to a temp dir, and fully validate it WITHOUT
/// activating. The staged dir is remembered in state under a token so the UI
/// can confirm and then activate (or cancel, which discards the staging).
#[tauri::command]
pub async fn restore_validate(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<RestoreValidation>> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Catavyn Backup", &["catavyn"])
        .blocking_pick_file();
    let Some(file) = picked else { return Ok(None) };
    let file = file.into_path().map_err(|e| AppError::Other(e.to_string()))?;

    let preview = backup::stage_and_validate(&file)?;
    let token = uuid::Uuid::new_v4().to_string();
    let out = RestoreValidation {
        created_at: preview.manifest.created_at.clone(),
        file_count: preview.manifest.file_count,
        total_size: preview.manifest.total_size,
        token: token.clone(),
    };
    state.stash_restore(token, preview);
    Ok(Some(out))
}

/// Cancel a pending restore, discarding the staged temp directory.
#[tauri::command]
pub fn restore_cancel(state: State<AppState>, token: String) {
    if let Some(preview) = state.take_restore(&token) {
        backup::cleanup_preview(&preview);
    }
}

/// Activate a previously-validated restore. Opens a folder picker for the
/// destination. Restores to a NEW directory by default; if the chosen dir
/// already holds Catavyn data, requires `allow_existing`.
#[tauri::command]
pub async fn restore_activate(
    app: AppHandle,
    state: State<'_, AppState>,
    vault: State<'_, VaultSession>,
    token: String,
    allow_existing: bool,
) -> AppResult<Option<String>> {
    let preview = state
        .take_restore(&token)
        .ok_or_else(|| AppError::Other("restore session expired".into()))?;

    let picked = app.dialog().file().blocking_pick_folder();
    let Some(dest) = picked else {
        // Put it back so the user can retry with a destination.
        backup::cleanup_preview(&preview);
        return Ok(None);
    };
    let dest = dest.into_path().map_err(|e| AppError::Other(e.to_string()))?;

    // Never overwrite the live data dir while it's open: close connections
    // if we're activating over the current data directory.
    let is_current = state.data_dir().map(|d| d == dest).unwrap_or(false);
    if is_current {
        vault.lock();
        state.close_conn();
    }

    let result = backup::activate_restore(&preview, &dest, allow_existing);
    backup::cleanup_preview(&preview);

    match result {
        Ok(()) => {
            // Switch the app to the restored directory.
            state.switch_data_dir(dest.clone())?;
            Ok(Some(dest.display().to_string()))
        }
        Err(e) => {
            // If we closed the current dir, reopen it so the app stays usable.
            if is_current {
                if let Some(dir) = state.data_dir() {
                    let _ = state.open_data_dir(dir);
                }
            }
            Err(e)
        }
    }
}
