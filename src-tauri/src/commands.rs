use crate::{journal::Journal, storage::Storage};
use std::{path::PathBuf, sync::Mutex};

pub struct JournalSession {
    pub root: PathBuf,
    pub storage: Mutex<Option<Storage>>,
}

#[tauri::command]
pub async fn load_journal(session: tauri::State<'_, JournalSession>) -> Result<Journal, String> {
    let mut storage = session
        .storage
        .lock()
        .map_err(|_| "No se pudo acceder a la sesión del journal.")?;
    if storage.is_none() {
        *storage = Some(Storage::open(&session.root)?);
    }
    storage
        .as_ref()
        .ok_or("El journal no está abierto.")?
        .load()
}

#[tauri::command]
pub async fn save_journal(
    journal: Journal,
    session: tauri::State<'_, JournalSession>,
) -> Result<u64, String> {
    let mut storage = session
        .storage
        .lock()
        .map_err(|_| "No se pudo acceder a la sesión del journal.")?;
    storage
        .as_mut()
        .ok_or("El journal no está abierto.")?
        .save(&journal)
}
