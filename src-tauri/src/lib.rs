mod commands;
mod config;
mod db;
mod error;
mod repo;
mod state;
mod storage;

#[cfg(test)]
mod tests;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // The app-config directory is OS-managed and separate from user data.
            // It holds only config.json (the pointer to the data directory).
            let config_dir = app
                .path()
                .app_config_dir()
                .expect("failed to resolve app config dir");
            let config_path = config_dir.join("config.json");

            let state = AppState::new(config_path)?;
            // Reconnect to a previously selected data directory if it still exists.
            if let Err(err) = state.restore() {
                log::warn!("failed to restore data directory: {err}");
            }
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_storage_status,
            commands::choose_data_dir,
            commands::open_data_dir,
            commands::open_data_dir_in_explorer,
            commands::get_storage_usage,
            commands::migrate_storage,
            commands::delete_all_data,
            commands::list_notes,
            commands::get_note,
            commands::create_note,
            commands::update_note,
            commands::delete_note,
            commands::restore_note,
            commands::permanently_delete_note,
            commands::empty_trash,
            commands::list_categories,
            commands::create_category,
            commands::update_category,
            commands::delete_category,
            commands::list_tags,
            commands::list_note_tag_links,
            commands::create_tag,
            commands::delete_tag,
            commands::attach_tag,
            commands::detach_tag,
            commands::list_tasks,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
