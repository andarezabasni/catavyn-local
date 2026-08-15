use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::attachments as fs_attach;
use crate::error::{AppError, AppResult};
use crate::reminders::{self, DueReminder};
use crate::repo::attachments::{self, Attachment, NewAttachment};
use crate::repo::categories::{self, Category, CategoryPatch, NewCategory};
use crate::repo::notes::{self, NewNote, Note, NotePatch, NoteQuery};
use crate::repo::settings;
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
    let data_dir = state.data_dir().ok_or(AppError::NoDataDirectory)?;
    // Collect attachment files for this note and its sub-notes before the DB
    // cascade removes the rows, so we can delete the files afterwards.
    let files = state.with_conn(|conn| attachments::files_under_note(conn, &id))?;
    state.with_tx(|tx| notes::hard_delete(tx, &id))?;
    for (rel, thumb) in files {
        let _ = fs_attach::delete_files(&data_dir, &rel, thumb.as_deref());
    }
    Ok(())
}

#[tauri::command]
pub fn empty_trash(state: State<AppState>) -> AppResult<usize> {
    let data_dir = state.data_dir().ok_or(AppError::NoDataDirectory)?;
    let files = state.with_conn(|conn| attachments::files_under_trashed_notes(conn))?;
    let removed = state.with_tx(|tx| notes::empty_trash(tx))?;
    for (rel, thumb) in files {
        let _ = fs_attach::delete_files(&data_dir, &rel, thumb.as_deref());
    }
    Ok(removed)
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

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_attachments(state: State<AppState>, note_id: String) -> AppResult<Vec<Attachment>> {
    state.with_conn(|conn| attachments::list_for_note(conn, &note_id))
}

/// Store attachment bytes on the filesystem and record its metadata. The bytes
/// arrive from the renderer as a byte array (Tauri encodes efficiently; we
/// avoid base64). The file is written before the DB row, and if the row insert
/// fails the just-written files are cleaned up so the DB never claims a file
/// that isn't tracked.
#[tauri::command]
pub fn add_attachment(
    state: State<AppState>,
    note_id: String,
    original_filename: String,
    mime_type: String,
    bytes: Vec<u8>,
) -> AppResult<Attachment> {
    let data_dir = state.data_dir().ok_or(AppError::NoDataDirectory)?;
    let id = attachments::generate_id();

    let stored = fs_attach::store_attachment(&data_dir, &id, &original_filename, &mime_type, &bytes)?;

    let insert = NewAttachment {
        note_id,
        original_filename,
        stored_filename: stored.stored_filename,
        relative_path: stored.relative_path.clone(),
        mime_type,
        file_size: stored.file_size,
        width: stored.width,
        height: stored.height,
        thumbnail_path: stored.thumbnail_path.clone(),
    };

    match state.with_tx(|tx| attachments::create(tx, &id, insert)) {
        Ok(a) => Ok(a),
        Err(e) => {
            // Roll back the filesystem write to avoid orphaned files.
            let _ = fs_attach::delete_files(&data_dir, &stored.relative_path, stored.thumbnail_path.as_deref());
            Err(e)
        }
    }
}

/// Return the raw bytes of an attachment file for previewing in the renderer.
/// Path is resolved from the stored (validated) relative path — never from a
/// renderer-supplied filesystem path.
#[tauri::command]
pub fn read_attachment(state: State<AppState>, id: String) -> AppResult<Vec<u8>> {
    let data_dir = state.data_dir().ok_or(AppError::NoDataDirectory)?;
    let att = state
        .with_conn(|conn| attachments::get(conn, &id))?
        .ok_or_else(|| AppError::Other("attachment not found".into()))?;
    fs_attach::read_relative(&data_dir, &att.relative_path)
}

/// Return the thumbnail bytes if one exists, otherwise the original bytes.
#[tauri::command]
pub fn read_attachment_thumbnail(state: State<AppState>, id: String) -> AppResult<Vec<u8>> {
    let data_dir = state.data_dir().ok_or(AppError::NoDataDirectory)?;
    let att = state
        .with_conn(|conn| attachments::get(conn, &id))?
        .ok_or_else(|| AppError::Other("attachment not found".into()))?;
    let rel = att.thumbnail_path.as_deref().unwrap_or(&att.relative_path);
    fs_attach::read_relative(&data_dir, rel)
}

/// Delete an attachment: remove files first, then the metadata row. If file
/// removal fails we abort before touching the DB so the row keeps pointing at
/// a real (still-present) file rather than silently claiming it exists.
#[tauri::command]
pub fn delete_attachment(state: State<AppState>, id: String) -> AppResult<()> {
    let data_dir = state.data_dir().ok_or(AppError::NoDataDirectory)?;
    let att = state.with_conn(|conn| attachments::get(conn, &id))?;
    let Some(att) = att else { return Ok(()) };

    fs_attach::delete_files(&data_dir, &att.relative_path, att.thumbnail_path.as_deref())?;
    state.with_tx(|tx| attachments::delete_row(tx, &id))
}

/// Reveal an attachment file in the OS file manager.
#[tauri::command]
pub fn reveal_attachment(app: AppHandle, state: State<AppState>, id: String) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let data_dir = state.data_dir().ok_or(AppError::NoDataDirectory)?;
    let att = state
        .with_conn(|conn| attachments::get(conn, &id))?
        .ok_or_else(|| AppError::Other("attachment not found".into()))?;
    let abs = fs_attach::resolve_within(&data_dir, &att.relative_path)?;
    app.opener()
        .reveal_item_in_dir(abs)
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Settings (key/value) + task reminders
// ---------------------------------------------------------------------------

const REMINDERS_ENABLED_KEY: &str = "reminders_enabled";
// Stored as JSON: { "date": "YYYY-MM-DD", "ids": ["..."] }. Resets per local
// day so a task is never notified twice, matching the original web behavior.
const REMINDERS_SENT_KEY: &str = "reminders_sent";
// Don't fire for tasks that became due more than this many seconds ago.
const LATE_WINDOW_SECS: i64 = 10 * 60;

#[tauri::command]
pub fn get_setting(state: State<AppState>, key: String) -> AppResult<Option<String>> {
    state.with_conn(|conn| settings::get(conn, &key))
}

#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: String) -> AppResult<()> {
    state.with_tx(|tx| settings::set(tx, &key, &value))
}

#[tauri::command]
pub fn get_reminders_enabled(state: State<AppState>) -> AppResult<bool> {
    Ok(state.with_conn(|conn| settings::get(conn, REMINDERS_ENABLED_KEY))? == Some("on".into()))
}

#[tauri::command]
pub fn set_reminders_enabled(state: State<AppState>, enabled: bool) -> AppResult<()> {
    state.with_tx(|tx| settings::set(tx, REMINDERS_ENABLED_KEY, if enabled { "on" } else { "off" }))
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct SentRecord {
    date: String,
    ids: Vec<String>,
}

/// Compute which tasks are due right now and haven't been notified yet, using
/// the caller-provided local wall-clock time. Marks fired + stale tasks as
/// sent (persisted, resets per local day) so notifications never repeat or
/// spam on restart. Returns the reminders the frontend should display via
/// tauri-plugin-notification. Firing the OS notification is the frontend's job;
/// this keeps all scheduling logic testable and off the platform layer.
#[tauri::command]
pub fn poll_due_reminders(
    state: State<AppState>,
    now_local: String,
) -> AppResult<Vec<DueReminder>> {
    // Respect the user's preference.
    if state.with_conn(|conn| settings::get(conn, REMINDERS_ENABLED_KEY))? != Some("on".into()) {
        return Ok(Vec::new());
    }

    // Parse the local datetime string ("YYYY-MM-DDTHH:MM:SS") sent by the
    // frontend (which owns the Windows timezone). No tz data is persisted.
    let now = chrono::NaiveDateTime::parse_from_str(&now_local, "%Y-%m-%dT%H:%M:%S")
        .map_err(|e| AppError::Other(format!("invalid now_local: {e}")))?;
    let today = now.date().format("%Y-%m-%d").to_string();

    // Load today's due tasks and the sent-set (reset if the date rolled over).
    let tasks = state.with_conn(|conn| tasks::list(conn, Some(&today)))?;
    let mut sent: SentRecord = state
        .with_conn(|conn| settings::get(conn, REMINDERS_SENT_KEY))?
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    if sent.date != today {
        sent = SentRecord { date: today.clone(), ids: Vec::new() };
    }
    let sent_set: std::collections::HashSet<String> = sent.ids.iter().cloned().collect();

    let due = reminders::due_reminders(&tasks, now, &sent_set, LATE_WINDOW_SECS);
    let stale = reminders::stale_due_ids(&tasks, now, &sent_set, LATE_WINDOW_SECS);

    // Record everything we surfaced or suppressed so it never repeats.
    let mut new_ids = sent.ids.clone();
    for r in &due {
        if !new_ids.contains(&r.task_id) {
            new_ids.push(r.task_id.clone());
        }
    }
    for id in stale {
        if !new_ids.contains(&id) {
            new_ids.push(id);
        }
    }
    if new_ids.len() != sent.ids.len() || sent.date != today {
        let record = SentRecord { date: today, ids: new_ids };
        let json = serde_json::to_string(&record)?;
        state.with_tx(|tx| settings::set(tx, REMINDERS_SENT_KEY, &json))?;
    }

    Ok(due)
}
