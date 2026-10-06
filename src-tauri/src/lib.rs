mod commands;
mod journal;
mod storage;

use commands::JournalSession;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(JournalSession {
                root: app.path().app_data_dir()?.join("journal"),
                storage: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_journal,
            commands::save_journal
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Suki Journal");
}
