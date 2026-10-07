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
    // El editor interpreta los tipos conocidos; SQLite conserva también las extensiones.
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
            let mut element_ids = HashSet::new();
            for element in &page.elements {
                if element.get("type").and_then(|value| value.as_str()) != Some("text") {
                    continue;
                }
                let text: TextElement = serde_json::from_value(element.clone())
                    .map_err(|_| "Hay un bloque de texto con datos inválidos.")?;
                text.validate()?;
                if !element_ids.insert(text.id) {
                    return Err("Hay bloques de texto con identificadores repetidos.".into());
                }
            }
        }
        if !ids.contains(&self.active_page_id) {
            return Err("La página activa no pertenece al journal.".into());
        }
        Ok(())
    }
}

#[derive(Deserialize)]
struct TextElement {
    id: String,
    text: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl TextElement {
    fn validate(&self) -> Result<(), String> {
        if self.id.is_empty()
            || self.id.encode_utf16().count() > 100
            || self.text.encode_utf16().count() > 10_000
            || ![self.x, self.y, self.width, self.height]
                .iter()
                .all(|value| value.is_finite())
            || self.x < 0.0
            || self.y < 0.0
            || self.width < 120.0
            || self.height < 88.0
            || self.x + self.width > 852.0
            || self.y + self.height > 1078.0
        {
            return Err("Hay un bloque de texto inválido o fuera de la hoja.".into());
        }
        Ok(())
    }
}
