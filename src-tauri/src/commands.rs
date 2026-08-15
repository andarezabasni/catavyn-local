use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::error::{AppError, AppResult};
use crate::repo::categories::{self, Category, CategoryPatch, NewCategory};
use crate::repo::notes::{self, NewNote, Note, NotePatch, NoteQuery};
use crate::repo::tags::{self, NewTag, NoteTagLink, Tag};
use crate::repo::tasks::{self, NewTask, Task, TaskPatch};
use crate::state::AppState;
use crate::storage;

/// Storage status reported to the frontend on startup so the UI can decide
/// whether to show the "choose data directory" flow.
#[derive(Debug, Serialize)]
pub struct StorageStatus {
    pub configured: bool,
    pub data_dir: Option<String>,
}

fn status_for(state: &State<AppState>) -> StorageStatus {
    let dir = state.data_dir();
    StorageStatus {
        configured: dir.is_some(),
        data_dir: dir.map(|p| p.display().to_string()),
    }
}

// ---------------------------------------------------------------------------
// Storage / data directory
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_storage_status(state: State<AppState>) -> StorageStatus {
    status_for(&state)
}

/// Open a native folder picker and set the chosen directory as the data dir.
#[tauri::command]
pub async fn choose_data_dir(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<String>> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(path) = picked else { return Ok(None) };
    let path = path
        .into_path()
        .map_err(|e| AppError::InvalidDataDirectory(e.to_string()))?;
    state.open_data_dir(path.clone())?;
    Ok(Some(path.display().to_string()))
}

/// Open a data directory by explicit path (tests / reconnecting a portable dir).
#[tauri::command]
pub fn open_data_dir(state: State<AppState>, path: String) -> AppResult<StorageStatus> {
    state.open_data_dir(path.into())?;
    Ok(status_for(&state))
}

/// Reveal the data directory in the OS file manager.
#[tauri::command]
pub fn open_data_dir_in_explorer(app: AppHandle, state: State<AppState>) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let dir = state.data_dir().ok_or(AppError::NoDataDirectory)?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn get_storage_usage(state: State<AppState>) -> AppResult<storage::StorageUsage> {
    let dir = state.data_dir().ok_or(AppError::NoDataDirectory)?;
    Ok(storage::usage(&dir))
}

/// Pick a destination folder and safely migrate current data into it. Copies +
/// verifies before switching; the original data is left intact. Returns the new
/// data directory path, or None if the user cancelled.
#[tauri::command]
pub async fn migrate_storage(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<String>> {
    let src = state.data_dir().ok_or(AppError::NoDataDirectory)?;

    let picked = app.dialog().file().blocking_pick_folder();
    let Some(dst) = picked else { return Ok(None) };
    let dst = dst
        .into_path()
        .map_err(|e| AppError::InvalidDataDirectory(e.to_string()))?;

    // Release DB file handles so the copy sees a consistent, unlocked file.
    // (WAL is checkpointed on close.)
    state.close_conn();

    // Copy + verify. On any failure, re-open the original and report — the
    // source is never modified by this flow.
    match storage::migrate_data_dir(&src, &dst, false) {
        Ok(()) => {
            state.switch_data_dir(dst.clone())?;
            Ok(Some(dst.display().to_string()))
        }
        Err(e) => {
            // Reconnect to the untouched original so the app stays usable.
            state.open_data_dir(src)?;
            Err(e)
        }
    }
}

/// Delete all Catavyn data inside the configured directory after the frontend
/// has confirmed. `confirm_path` must exactly match the current data dir to
/// guard against deleting the wrong location.
#[tauri::command]
pub fn delete_all_data(state: State<AppState>, confirm_path: String) -> AppResult<StorageStatus> {
    let dir = state.data_dir().ok_or(AppError::NoDataDirectory)?;
    if confirm_path != dir.display().to_string() {
        return Err(AppError::Other(
            "confirmation path does not match the current data directory".into(),
        ));
    }
    // Close handles, wipe contents, recreate empty structure, reinitialize DB.
    state.close_conn();
    storage::wipe_data_dir(&dir)?;
    state.open_data_dir(dir)?;
    Ok(status_for(&state))
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_notes(state: State<AppState>, query: Option<NoteQuery>) -> AppResult<Vec<Note>> {
    state.with_conn(|conn| notes::list(conn, query.unwrap_or_default()))
}

#[tauri::command]
pub fn get_note(state: State<AppState>, id: String) -> AppResult<Option<Note>> {
    state.with_conn(|conn| notes::get(conn, &id))
}

#[tauri::command]
pub fn create_note(state: State<AppState>, input: NewNote) -> AppResult<Note> {
    state.with_tx(|tx| notes::create(tx, input))
}

#[tauri::command]
pub fn update_note(state: State<AppState>, id: String, patch: NotePatch) -> AppResult<Option<Note>> {
    state.with_tx(|tx| notes::update(tx, &id, patch))
}

#[tauri::command]
pub fn delete_note(state: State<AppState>, id: String) -> AppResult<()> {
    state.with_tx(|tx| notes::soft_delete(tx, &id))
}

#[tauri::command]
pub fn restore_note(state: State<AppState>, id: String) -> AppResult<()> {
    state.with_tx(|tx| notes::restore(tx, &id))
}

#[tauri::command]
pub fn permanently_delete_note(state: State<AppState>, id: String) -> AppResult<()> {
    state.with_tx(|tx| notes::hard_delete(tx, &id))
}

#[tauri::command]
pub fn empty_trash(state: State<AppState>) -> AppResult<usize> {
    state.with_tx(|tx| notes::empty_trash(tx))
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_categories(state: State<AppState>) -> AppResult<Vec<Category>> {
    state.with_conn(|conn| categories::list(conn))
}

#[tauri::command]
pub fn create_category(state: State<AppState>, input: NewCategory) -> AppResult<Category> {
    state.with_tx(|tx| categories::create(tx, input))
}

#[tauri::command]
pub fn update_category(
    state: State<AppState>,
    id: String,
    patch: CategoryPatch,
) -> AppResult<Option<Category>> {
    state.with_tx(|tx| categories::update(tx, &id, patch))
}

#[tauri::command]
pub fn delete_category(state: State<AppState>, id: String) -> AppResult<()> {
    state.with_tx(|tx| categories::delete(tx, &id))
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_tags(state: State<AppState>) -> AppResult<Vec<Tag>> {
    state.with_conn(|conn| tags::list(conn))
}

#[tauri::command]
pub fn list_note_tag_links(state: State<AppState>) -> AppResult<Vec<NoteTagLink>> {
    state.with_conn(|conn| tags::list_links(conn))
}

#[tauri::command]
pub fn create_tag(state: State<AppState>, input: NewTag) -> AppResult<Tag> {
    state.with_tx(|tx| tags::create(tx, input))
}

#[tauri::command]
pub fn delete_tag(state: State<AppState>, id: String) -> AppResult<()> {
    state.with_tx(|tx| tags::delete(tx, &id))
}

#[tauri::command]
pub fn attach_tag(state: State<AppState>, note_id: String, tag_id: String) -> AppResult<()> {
    state.with_tx(|tx| tags::attach(tx, &note_id, &tag_id))
}

#[tauri::command]
pub fn detach_tag(state: State<AppState>, note_id: String, tag_id: String) -> AppResult<()> {
    state.with_tx(|tx| tags::detach(tx, &note_id, &tag_id))
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_tasks(state: State<AppState>, due_date: Option<String>) -> AppResult<Vec<Task>> {
    state.with_conn(|conn| tasks::list(conn, due_date.as_deref()))
}

#[tauri::command]
pub fn create_task(state: State<AppState>, input: NewTask) -> AppResult<Task> {
    state.with_tx(|tx| tasks::create(tx, input))
}

#[tauri::command]
pub fn update_task(state: State<AppState>, id: String, patch: TaskPatch) -> AppResult<Option<Task>> {
    state.with_tx(|tx| tasks::update(tx, &id, patch))
}

#[tauri::command]
pub fn delete_task(state: State<AppState>, id: String) -> AppResult<()> {
    state.with_tx(|tx| tasks::delete(tx, &id))
}
