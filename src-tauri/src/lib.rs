mod commands;
mod files;
mod journal;
mod storage;

use commands::JournalSession;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(JournalSession {
                root: app.path().app_data_dir()?.join("journal"),
                storage: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_journal,
            commands::save_journal,
            commands::journal_file_info,
            commands::new_journal,
            commands::open_journal_file,
            commands::save_journal_file
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Suki Journal");
}
