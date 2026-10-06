use crate::journal::{Journal, Page, SCHEMA_VERSION};
use rusqlite::{params, Connection, TransactionBehavior};
use std::{path::Path, time::Duration};

pub struct Storage {
    connection: Connection,
}

fn database_error(error: rusqlite::Error) -> String {
    format!("No se pudo acceder al journal: {error}")
}

impl Storage {
    // La sesión elige la raíz. El almacenamiento nunca impone una ubicación global.
    pub fn open(root: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(root)
            .map_err(|error| format!("No se pudo preparar la carpeta del journal: {error}"))?;
        let mut connection =
            Connection::open(root.join("journal.sqlite")).map_err(database_error)?;
        connection
            .busy_timeout(Duration::from_secs(3))
            .map_err(database_error)?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(database_error)?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database_error)?;
        let version: u32 = transaction
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(database_error)?;
        match version {
            0 => {
                let tables: u32 = transaction.query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
                    [], |row| row.get(0),
                ).map_err(database_error)?;
                if tables != 0 {
                    return Err("La base existente no tiene un formato de Suki Journal reconocido. No se modificó.".into());
                }
                transaction.execute_batch(
                    "CREATE TABLE pages (
                        id TEXT PRIMARY KEY NOT NULL,
                        position INTEGER NOT NULL UNIQUE CHECK(position >= 0),
                        title TEXT NOT NULL,
                        elements TEXT NOT NULL
                    );
                    CREATE TABLE journal (
                        id INTEGER PRIMARY KEY CHECK(id = 1),
                        title TEXT NOT NULL,
                        active_page_id TEXT NOT NULL REFERENCES pages(id) DEFERRABLE INITIALLY DEFERRED,
                        revision INTEGER NOT NULL CHECK(revision >= 0)
                    );",
                ).map_err(database_error)?;
                let initial = Journal::new();
                transaction.execute(
                    "INSERT INTO pages (id, position, title, elements) VALUES (?1, 0, ?2, '[]')",
                    params![initial.pages[0].id, initial.pages[0].title],
                ).map_err(database_error)?;
                transaction.execute(
                    "INSERT INTO journal (id, title, active_page_id, revision) VALUES (1, ?1, ?2, 0)",
                    params![initial.title, initial.active_page_id],
                ).map_err(database_error)?;
                transaction
                    .pragma_update(None, "user_version", SCHEMA_VERSION)
                    .map_err(database_error)?;
            }
            SCHEMA_VERSION => {}
            _ => return Err("Esta base usa otra versión del journal. No se modificó.".into()),
        }
        transaction.commit().map_err(database_error)?;
        let storage = Self { connection };
        storage.load()?;
        Ok(storage)
    }

    pub fn load(&self) -> Result<Journal, String> {
        // Una transacción de lectura evita mezclar revisiones de dos instancias.
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(database_error)?;
        let (title, active_page_id, revision): (String, String, i64) = transaction
            .query_row(
                "SELECT title, active_page_id, revision FROM journal WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(database_error)?;
        let mut statement = transaction
            .prepare("SELECT id, title, elements FROM pages ORDER BY position")
            .map_err(database_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(database_error)?;
        let mut pages = vec![];
        for row in rows {
            let (id, title, elements) = row.map_err(database_error)?;
            pages.push(Page {
                id,
                title,
                elements: serde_json::from_str(&elements).map_err(|error| {
                    format!("No se pudo leer el contenido de una página: {error}")
                })?,
            });
        }
        drop(statement);
        transaction.commit().map_err(database_error)?;
        let journal = Journal {
            schema_version: SCHEMA_VERSION,
            title,
            active_page_id,
            revision: u64::try_from(revision)
                .map_err(|_| "La revisión guardada del journal no es válida.")?,
            pages,
        };
        journal.validate()?;
        Ok(journal)
    }

    pub fn save(&mut self, journal: &Journal) -> Result<u64, String> {
        journal.validate()?;
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database_error)?;
        let revision: i64 = transaction
            .query_row("SELECT revision FROM journal WHERE id = 1", [], |row| {
                row.get(0)
            })
            .map_err(database_error)?;
        if revision != journal.revision as i64 {
            return Err("Otra instancia modificó el journal. No se sobrescribieron los datos. Podés descartar los cambios de esta ventana y recargar la versión guardada.".into());
        }
        transaction
            .execute("DELETE FROM pages", [])
            .map_err(database_error)?;
        for (position, page) in journal.pages.iter().enumerate() {
            let elements =
                serde_json::to_string(&page.elements).map_err(|error| error.to_string())?;
            transaction
                .execute(
                    "INSERT INTO pages (id, position, title, elements) VALUES (?1, ?2, ?3, ?4)",
                    params![page.id, position as i64, page.title, elements],
                )
                .map_err(database_error)?;
        }
        let next_revision = revision + 1;
        transaction
            .execute(
                "UPDATE journal SET title = ?1, active_page_id = ?2, revision = ?3 WHERE id = 1",
                params![journal.title, journal.active_page_id, next_revision],
            )
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
        Ok(next_revision as u64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn creates_and_reopens_a_journal_in_the_supplied_root() {
        let root = tempfile::tempdir().unwrap();
        let journal_root = root.path().join("portable-journal");
        let storage = Storage::open(&journal_root).unwrap();
        assert_eq!(storage.load().unwrap(), Journal::new());
        drop(storage);
        assert!(journal_root.join("journal.sqlite").is_file());
        assert_eq!(
            Storage::open(&journal_root).unwrap().load().unwrap(),
            Journal::new()
        );
    }

    #[test]
    fn saves_order_active_page_and_uninterpreted_content() {
        let root = tempfile::tempdir().unwrap();
        let mut storage = Storage::open(root.path()).unwrap();
        let mut journal = storage.load().unwrap();
        journal.pages.insert(
            0,
            Page {
                id: "second".into(),
                title: "Ideas 🌱".into(),
                elements: vec![
                    json!({"id": "note-1", "kind": "text", "x": 24, "data": {"text": "<hola>"}}),
                ],
            },
        );
        journal.active_page_id = "second".into();
        journal.revision = storage.save(&journal).unwrap();
        drop(storage);
        assert_eq!(Storage::open(root.path()).unwrap().load().unwrap(), journal);
    }

    #[test]
    fn rejects_invalid_state_without_changing_saved_data() {
        let root = tempfile::tempdir().unwrap();
        let mut storage = Storage::open(root.path()).unwrap();
        let original = storage.load().unwrap();
        let mut invalid = original.clone();
        invalid.pages.push(invalid.pages[0].clone());
        assert!(storage.save(&invalid).is_err());
        invalid = original.clone();
        invalid.active_page_id = "missing".into();
        assert!(storage.save(&invalid).is_err());
        invalid = original.clone();
        invalid.pages.clear();
        assert!(storage.save(&invalid).is_err());
        assert_eq!(storage.load().unwrap(), original);
    }

    #[test]
    fn rolls_back_all_changes_when_a_write_fails() {
        let root = tempfile::tempdir().unwrap();
        let mut storage = Storage::open(root.path()).unwrap();
        let original = storage.load().unwrap();
        storage
            .connection
            .execute_batch(
                "CREATE TRIGGER reject_new_page BEFORE INSERT ON pages WHEN NEW.id = 'blocked'
             BEGIN SELECT RAISE(ABORT, 'test write failure'); END;",
            )
            .unwrap();
        let mut changed = original.clone();
        changed.pages.push(Page {
            id: "blocked".into(),
            title: "Página 2".into(),
            elements: vec![],
        });
        assert!(storage.save(&changed).is_err());
        assert_eq!(storage.load().unwrap(), original);
    }

    #[test]
    fn rejects_stale_revision_from_another_instance() {
        let root = tempfile::tempdir().unwrap();
        let mut first = Storage::open(root.path()).unwrap();
        let mut second = Storage::open(root.path()).unwrap();
        let stale = second.load().unwrap();
        let mut updated = first.load().unwrap();
        updated.title = "Guardado por la primera ventana".into();
        updated.revision = first.save(&updated).unwrap();
        assert!(second.save(&stale).unwrap_err().contains("Otra instancia"));
        assert_eq!(second.load().unwrap(), updated);
    }

    #[test]
    fn leaves_newer_unknown_and_corrupt_databases_untouched() {
        for fixture in [
            "PRAGMA user_version = 99;",
            "CREATE TABLE unrelated (value TEXT);",
            "invalid bytes",
        ] {
            let root = tempfile::tempdir().unwrap();
            let file = root.path().join("journal.sqlite");
            if fixture == "invalid bytes" {
                std::fs::write(&file, fixture).unwrap();
            } else {
                Connection::open(&file)
                    .unwrap()
                    .execute_batch(fixture)
                    .unwrap();
            }
            let before = std::fs::read(&file).unwrap();
            assert!(Storage::open(root.path()).is_err());
            assert_eq!(std::fs::read(&file).unwrap(), before);
        }
    }
}
