use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const SCHEMA_VERSION: u32 = 1;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Journal {
    pub schema_version: u32,
    pub revision: u64,
    pub title: String,
    pub active_page_id: String,
    pub pages: Vec<Page>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Page {
    pub id: String,
    pub title: String,
    // Se conserva el contenido de las futuras herramientas sin interpretarlo en SQL.
    pub elements: Vec<serde_json::Value>,
}

impl Journal {
    pub fn new() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            revision: 0,
            title: "Mi Bullet Journal".into(),
            active_page_id: "page-1".into(),
            pages: vec![Page {
                id: "page-1".into(),
                title: "Página 1".into(),
                elements: vec![],
            }],
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != SCHEMA_VERSION {
            return Err("Esta versión del journal no es compatible con la aplicación.".into());
        }
        if self.revision >= MAX_SAFE_INTEGER {
            return Err("La revisión del journal está fuera del rango admitido.".into());
        }
        if self.title.trim().is_empty() || self.title.chars().count() > 200 {
            return Err("El título del journal debe tener entre 1 y 200 caracteres.".into());
        }
        if self.pages.is_empty() || self.pages.len() > 10_000 {
            return Err("El journal debe tener entre 1 y 10.000 páginas.".into());
        }
        let mut ids = HashSet::new();
        for page in &self.pages {
            if page.id.is_empty() || page.id.len() > 100 || !ids.insert(&page.id) {
                return Err("Hay identificadores de página vacíos, repetidos o inválidos.".into());
            }
            if page.title.trim().is_empty() || page.title.chars().count() > 200 {
                return Err("El título de cada página debe tener entre 1 y 200 caracteres.".into());
            }
            if page.elements.iter().any(|element| !element.is_object()) {
                return Err("Los elementos de una página deben ser objetos.".into());
            }
        }
        if !ids.contains(&self.active_page_id) {
            return Err("La página activa no pertenece al journal.".into());
        }
        Ok(())
    }
}
