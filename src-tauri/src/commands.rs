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

#[tauri::command]
pub async fn journal_file_info(
    session: tauri::State<'_, JournalSession>,
) -> Result<crate::files::FileInfo, String> {
    let storage = session
        .storage
        .lock()
        .map_err(|_| "No se pudo acceder a la sesión.")?;
    crate::files::info(storage.as_ref().ok_or("El journal no está abierto.")?)
}

#[tauri::command]
pub async fn new_journal(
    title: String,
    revision: u64,
    session: tauri::State<'_, JournalSession>,
) -> Result<crate::files::FileInfo, String> {
    let mut storage = session
        .storage
        .lock()
        .map_err(|_| "No se pudo acceder a la sesión.")?;
    crate::files::new(
        storage.as_mut().ok_or("El journal no está abierto.")?,
        title,
        revision,
    )
}

#[tauri::command]
pub async fn open_journal_file(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    revision: u64,
    session: tauri::State<'_, JournalSession>,
) -> Result<Option<crate::files::FileInfo>, String> {
    use tauri_plugin_dialog::DialogExt;
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_parent(&window)
            .set_title("Abrir bullet journal")
            .add_filter("Suki Journal", &["suki"])
            .blocking_pick_file()
    })
    .await
    .map_err(|error| error.to_string())?;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let path = chosen.into_path().map_err(|error| error.to_string())?;
    let mut storage = session
        .storage
        .lock()
        .map_err(|_| "No se pudo acceder a la sesión.")?;
    crate::files::open(
        storage.as_mut().ok_or("El journal no está abierto.")?,
        &path,
        revision,
    )
    .map(Some)
}

#[tauri::command]
pub async fn save_journal_file(
    save_as: bool,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    revision: u64,
    session: tauri::State<'_, JournalSession>,
) -> Result<Option<crate::files::FileInfo>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (existing, title) = {
        let storage = session
            .storage
            .lock()
            .map_err(|_| "No se pudo acceder a la sesión.")?;
        let storage = storage.as_ref().ok_or("El journal no está abierto.")?;
        (crate::files::info(storage)?.path, storage.load()?.title)
    };
    let path = if !save_as && existing.is_some() {
        PathBuf::from(existing.unwrap())
    } else {
        let file_name = existing
            .as_ref()
            .and_then(|path| std::path::Path::new(path).file_name())
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| {
                format!(
                    "{}.suki",
                    title
                        .chars()
                        .map(|c| if "/\\\0".contains(c) { '_' } else { c })
                        .collect::<String>()
                )
            });
        let chosen = tauri::async_runtime::spawn_blocking(move || {
            let mut dialog = app
                .dialog()
                .file()
                .set_parent(&window)
                .set_title("Guardar bullet journal")
                .add_filter("Suki Journal", &["suki"])
                .set_file_name(file_name);
            if let Some(parent) = existing
                .as_ref()
                .and_then(|path| std::path::Path::new(path).parent())
            {
                dialog = dialog.set_directory(parent);
            }
            dialog.blocking_save_file()
        })
        .await
        .map_err(|error| error.to_string())?;
        let Some(chosen) = chosen else {
            return Ok(None);
        };
        let path = chosen.into_path().map_err(|error| error.to_string())?;
        if path.extension().and_then(|extension| extension.to_str()) != Some("suki") {
            let extended = path.with_extension("suki");
            if extended.exists() {
                return Err("Ya existe un archivo con ese nombre y extensión .suki. Elegilo en Guardar como para confirmar que querés reemplazarlo.".into());
            }
            extended
        } else {
            path
        }
    };
    let mut storage = session
        .storage
        .lock()
        .map_err(|_| "No se pudo acceder a la sesión.")?;
    crate::files::save(
        storage.as_mut().ok_or("El journal no está abierto.")?,
        &path,
        revision,
    )
    .map(Some)
}
