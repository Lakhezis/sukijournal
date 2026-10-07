use crate::{journal::Journal, storage::Storage};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

const FILE_LIMIT: u64 = 64 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct JournalFile {
    format: String,
    version: u32,
    journal: Journal,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Metadata {
    path: Option<PathBuf>,
    saved_journal: Option<Journal>,
    fingerprint: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: Option<String>,
    pub saved_journal: Option<Journal>,
    pub revision: u64,
}

fn io_error(error: impl std::fmt::Display) -> String {
    format!("No se pudo acceder al archivo: {error}")
}

fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let file = fs::File::open(path).map_err(io_error)?;
    let mut bytes = Vec::new();
    file.take(FILE_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(io_error)?;
    if bytes.len() as u64 > FILE_LIMIT {
        return Err("El archivo supera el límite de 64 MiB.".into());
    }
    Ok(bytes)
}

fn fingerprint(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    })
}

fn decode(bytes: &[u8]) -> Result<Journal, String> {
    let file: JournalFile = serde_json::from_slice(bytes)
        .map_err(|_| "Este archivo no tiene un formato de Suki Journal válido.")?;
    if file.format != "suki-journal" || file.version != 1 {
        return Err("Esta versión del archivo no es compatible con Suki Journal.".into());
    }
    file.journal.validate()?;
    Ok(file.journal)
}

fn metadata(storage: &Storage) -> Result<Metadata, String> {
    match storage.metadata()? {
        Some(value) => serde_json::from_str(&value).map_err(io_error),
        None => Ok(Metadata::default()),
    }
}

pub fn info(storage: &Storage) -> Result<FileInfo, String> {
    let meta = metadata(storage)?;
    Ok(FileInfo {
        path: meta.path.map(|path| path.to_string_lossy().into_owned()),
        saved_journal: meta.saved_journal,
        revision: storage.load()?.revision,
    })
}

fn current(storage: &Storage, revision: u64) -> Result<Journal, String> {
    let journal = storage.load()?;
    if journal.revision != revision {
        return Err(
            "Otra ventana modificó el journal. Recargá el autoguardado antes de continuar.".into(),
        );
    }
    Ok(journal)
}

fn activate(
    storage: &mut Storage,
    mut journal: Journal,
    meta: Metadata,
    revision: u64,
) -> Result<FileInfo, String> {
    current(storage, revision)?;
    journal.revision = revision;
    let data = serde_json::to_string(&meta).map_err(io_error)?;
    storage.save_with_metadata(&journal, Some(&data))?;
    info(storage)
}

pub fn open(storage: &mut Storage, path: &Path, revision: u64) -> Result<FileInfo, String> {
    let bytes = read_bytes(path)?;
    let journal = decode(&bytes)?;
    let meta = Metadata {
        path: Some(path.to_path_buf()),
        saved_journal: Some(journal.clone()),
        fingerprint: Some(fingerprint(&bytes)),
    };
    activate(storage, journal, meta, revision)
}

pub fn new(storage: &mut Storage, title: String, revision: u64) -> Result<FileInfo, String> {
    let mut journal = Journal::new();
    journal.title = title.trim().to_string();
    journal.validate()?;
    activate(storage, journal, Metadata::default(), revision)
}

pub fn save(storage: &mut Storage, path: &Path, revision: u64) -> Result<FileInfo, String> {
    let journal = current(storage, revision)?;
    let previous = metadata(storage)?;
    if previous.path.as_deref() == Some(path) {
        let bytes = read_bytes(path)?;
        if previous.fingerprint != Some(fingerprint(&bytes)) {
            return Err("El archivo fue modificado fuera de esta ventana. Usá Guardar como para conservar tus cambios en otro archivo, o Abrir para leer esa versión.".into());
        }
    }
    let bytes = serde_json::to_vec_pretty(&JournalFile {
        format: "suki-journal".into(),
        version: 1,
        journal: journal.clone(),
    })
    .map_err(io_error)?;
    if bytes.len() as u64 > FILE_LIMIT {
        return Err("El journal supera el límite de 64 MiB por archivo.".into());
    }
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(io_error)?;
    temporary.write_all(&bytes).map_err(io_error)?;
    temporary.as_file().sync_all().map_err(io_error)?;
    temporary.persist(path).map_err(io_error)?;
    let meta = Metadata {
        path: Some(path.to_path_buf()),
        saved_journal: Some(journal.clone()),
        fingerprint: Some(fingerprint(&bytes)),
    };
    activate(storage, journal, meta, revision)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn multiple_named_files_are_independent_from_autosave_and_recover_pages() {
        let root = tempfile::tempdir().unwrap();
        let mut storage = Storage::open(&root.path().join("working")).unwrap();
        let first = root.path().join("ideas.suki");
        let second = root.path().join("viajes.suki");
        let mut journal = storage.load().unwrap();
        journal.title = "Ideas".into();
        journal.pages[0].title = "Mi semana".into();
        journal.pages[0]
            .elements
            .push(json!({"type":"future", "data":{"keep":true}}));
        journal.revision = storage.save(&journal).unwrap();
        let saved = save(&mut storage, &first, journal.revision).unwrap();
        let before = fs::read(&first).unwrap();
        journal.revision = saved.revision;
        journal.title = "Edición en curso".into();
        journal.revision = storage.save(&journal).unwrap();
        assert_eq!(fs::read(&first).unwrap(), before);
        new(&mut storage, "Viajes".into(), journal.revision).unwrap();
        let revision = storage.load().unwrap().revision;
        save(&mut storage, &second, revision).unwrap();
        assert_eq!(decode(&fs::read(&second).unwrap()).unwrap().title, "Viajes");
        let revision = storage.load().unwrap().revision;
        open(&mut storage, &first, revision).unwrap();
        let loaded = storage.load().unwrap();
        assert_eq!(loaded.title, "Ideas");
        assert_eq!(loaded.pages[0].title, "Mi semana");
        assert_eq!(loaded.pages[0].elements, journal.pages[0].elements);
        assert_eq!(loaded.pages[0].elements[0]["data"]["keep"], true);
        drop(storage);
        let reopened = Storage::open(&root.path().join("working")).unwrap();
        assert_eq!(reopened.load().unwrap(), loaded);
        assert_eq!(
            info(&reopened).unwrap().path.unwrap(),
            first.to_string_lossy()
        );
    }

    #[test]
    fn invalid_files_failed_writes_and_external_changes_leave_current_data_intact() {
        let root = tempfile::tempdir().unwrap();
        let mut storage = Storage::open(&root.path().join("working")).unwrap();
        let original = storage.load().unwrap();
        let invalid = root.path().join("invalid.suki");
        for bytes in [
            "broken",
            "{}",
            r#"{"format":"other","version":1,"journal":{}}"#,
        ] {
            fs::write(&invalid, bytes).unwrap();
            assert!(open(&mut storage, &invalid, original.revision).is_err());
            assert_eq!(storage.load().unwrap(), original);
            assert_eq!(fs::read_to_string(&invalid).unwrap(), bytes);
        }
        assert!(save(
            &mut storage,
            &root.path().join("missing/file.suki"),
            original.revision
        )
        .is_err());
        assert_eq!(storage.load().unwrap(), original);
        let file = root.path().join("valid.suki");
        let saved = save(&mut storage, &file, original.revision).unwrap();
        fs::write(&file, "changed externally").unwrap();
        assert!(save(&mut storage, &file, saved.revision).is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "changed externally");
        assert!(new(&mut storage, "Otro".into(), original.revision).is_err());
        assert!(new(&mut storage, " ".into(), saved.revision).is_err());
        assert_eq!(storage.load().unwrap().title, original.title);
    }
}
