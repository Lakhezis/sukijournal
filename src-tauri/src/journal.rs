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
                let kind = match element.get("type").and_then(|value| value.as_str()) {
                    Some(
                        kind @ ("text" | "postit" | "stamp" | "calendar" | "washi" | "drawing"),
                    ) => kind,
                    _ => continue,
                };
                let geometry: ElementGeometry = serde_json::from_value(element.clone())
                    .map_err(|_| "Hay un elemento con datos inválidos.")?;
                let (min_width, min_height) = match kind {
                    "calendar" => (280.0, 280.0),
                    "washi" => (160.0, 72.0),
                    "drawing" => (160.0, 112.0),
                    "stamp" => (96.0, 96.0),
                    "postit" => (160.0, 144.0),
                    _ => (120.0, 88.0),
                };
                geometry.validate(min_width, min_height)?;
                if kind == "stamp" {
                    if geometry.width != geometry.height
                        || !matches!(
                            element.get("stamp").and_then(|value| value.as_str()),
                            Some("flower" | "leaf" | "star" | "heart" | "rainbow" | "moon")
                        )
                    {
                        return Err("Hay un sellito con dibujo o tamaño inválido.".into());
                    }
                } else if kind == "calendar" {
                    let year = element.get("year").and_then(|value| value.as_u64());
                    let month = element.get("month").and_then(|value| value.as_u64());
                    if !matches!(year, Some(1..=9999)) || !matches!(month, Some(1..=12)) {
                        return Err("Hay un calendario con mes o año inválido.".into());
                    }
                    if let Some(highlights) = element.get("dayHighlights") {
                        let highlights = highlights
                            .as_array()
                            .ok_or("El remarcado del calendario no es válido.")?;
                        let mut dates = HashSet::new();
                        if highlights.len() > 2000 {
                            return Err("El calendario tiene demasiados días remarcados.".into());
                        }
                        for mark in highlights {
                            let year = mark.get("year").and_then(|value| value.as_u64());
                            let month = mark.get("month").and_then(|value| value.as_u64());
                            let day = mark.get("day").and_then(|value| value.as_u64());
                            let (Some(year @ 1..=9999), Some(month @ 1..=12), Some(day)) =
                                (year, month, day)
                            else {
                                return Err("El remarcado del calendario no es válido.".into());
                            };
                            let days = match month {
                                2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
                                2 => 28,
                                4 | 6 | 9 | 11 => 30,
                                _ => 31,
                            };
                            if day < 1
                                || day > days
                                || !valid_highlight_color(mark.get("color"))
                                || !dates.insert((year, month, day))
                            {
                                return Err("El remarcado del calendario no es válido.".into());
                            }
                        }
                    }
                } else if kind == "washi" {
                    if !matches!(
                        element.get("color").and_then(|v| v.as_str()),
                        Some("yellow" | "pink" | "sage" | "lilac")
                    ) || !matches!(
                        element.get("pattern").and_then(|v| v.as_str()),
                        Some("stripes" | "dots" | "grid")
                    ) {
                        return Err("Hay una cinta con color o diseño inválido.".into());
                    }
                } else if kind == "drawing" {
                    let points = element
                        .get("points")
                        .and_then(|v| v.as_array())
                        .ok_or("Hay un dibujo sin puntos válidos.")?;
                    let line_width = element
                        .get("lineWidth")
                        .and_then(|v| v.as_f64())
                        .ok_or("Hay un dibujo con grosor inválido.")?;
                    if !matches!(
                        element.get("color").and_then(|v| v.as_str()),
                        Some("ink" | "salmon" | "olive" | "lilac")
                    ) || !(1.0..=12.0).contains(&line_width)
                        || points.len() < 2
                        || points.len() > 4096
                        || points.iter().any(|point| {
                            point.as_array().is_none_or(|values| {
                                values.len() != 2
                                    || values.iter().any(|v| {
                                        v.as_f64().is_none_or(|number| {
                                            !number.is_finite() || !(0.0..=1.0).contains(&number)
                                        })
                                    })
                            })
                        })
                    {
                        return Err("Hay un dibujo con datos inválidos.".into());
                    }
                } else {
                    let text = element
                        .get("text")
                        .and_then(|value| value.as_str())
                        .ok_or("Hay un elemento con texto inválido.")?;
                    if text.encode_utf16().count() > 10_000 {
                        return Err("El texto de un elemento supera el límite admitido.".into());
                    }
                    if let Some(marks) = element.get("marks") {
                        let marks = marks
                            .as_array()
                            .ok_or("El formato del texto no es válido.")?;
                        if marks.len() > 2000 {
                            return Err("El texto tiene demasiadas marcas de formato.".into());
                        }
                        for mark in marks {
                            let start = mark
                                .get("start")
                                .and_then(|v| v.as_u64())
                                .ok_or("El formato del texto no es válido.")?;
                            let end = mark
                                .get("end")
                                .and_then(|v| v.as_u64())
                                .ok_or("El formato del texto no es válido.")?;
                            if !matches!(
                                mark.get("kind").and_then(|v| v.as_str()),
                                Some("underline" | "highlight")
                            ) || start >= end
                                || end > text.encode_utf16().count() as u64
                            {
                                return Err("El formato del texto no es válido.".into());
                            }
                            if let Some(color) = mark.get("color") {
                                if mark.get("kind").and_then(|value| value.as_str())
                                    != Some("highlight")
                                    || !valid_highlight_color(Some(color))
                                {
                                    return Err("El color del remarcado no es válido.".into());
                                }
                            }
                        }
                    }
                }
                if kind == "postit"
                    && !matches!(
                        element.get("color").and_then(|value| value.as_str()),
                        Some("yellow" | "pink" | "sage" | "lilac")
                    )
                {
                    return Err("Hay un post-it con un color inválido.".into());
                }
                if !element_ids.insert(geometry.id) {
                    return Err("Hay elementos con identificadores repetidos.".into());
                }
            }
        }
        if !ids.contains(&self.active_page_id) {
            return Err("La página activa no pertenece al journal.".into());
        }
        Ok(())
    }
}

fn valid_highlight_color(color: Option<&serde_json::Value>) -> bool {
    matches!(
        color.and_then(|value| value.as_str()),
        Some("yellow" | "pink" | "sage" | "lilac")
    )
}

#[derive(Deserialize)]
struct ElementGeometry {
    id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl ElementGeometry {
    fn validate(&self, min_width: f64, min_height: f64) -> Result<(), String> {
        if self.id.is_empty()
            || self.id.encode_utf16().count() > 100
            || ![self.x, self.y, self.width, self.height]
                .iter()
                .all(|value| value.is_finite())
            || self.x < 0.0
            || self.y < 0.0
            || self.width < min_width
            || self.height < min_height
            || self.x + self.width > 852.0
            || self.y + self.height > 1078.0
        {
            return Err("Hay un elemento inválido o fuera de la hoja.".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod feature_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validates_highlight_colors_and_real_calendar_dates() {
        let text = json!({"type":"text","id":"text","x":24,"y":24,"width":240,"height":160,"text":"Ideas","marks":[{"kind":"highlight","start":0,"end":5,"color":"pink"}]});
        let calendar = json!({"type":"calendar","id":"calendar","x":24,"y":240,"width":360,"height":340,"year":2024,"month":2,"dayHighlights":[{"year":2024,"month":2,"day":29,"color":"lilac"},{"year":2100,"month":3,"day":31,"color":"sage"}]});
        let mut journal = Journal::new();
        journal.pages[0].elements = vec![text.clone(), calendar.clone()];
        assert!(journal.validate().is_ok());
        for color in [json!("bad"), json!(null), json!(42)] {
            journal.pages[0].elements[0] = text.clone();
            journal.pages[0].elements[0]["marks"][0]["color"] = color;
            assert!(journal.validate().is_err());
        }
        journal.pages[0].elements[0] = text;
        for marks in [
            json!(null),
            json!([{"year":2100,"month":2,"day":29,"color":"pink"}]),
            json!([{"year":2024,"month":4,"day":31,"color":"pink"}]),
            json!([{"year":2024,"month":2,"day":0,"color":"pink"}]),
            json!([{"year":2024,"month":2,"day":1,"color":"invalid"}]),
            json!([{"year":0,"month":2,"day":1,"color":"yellow"}]),
            json!([{"year":2024,"month":13,"day":1,"color":"yellow"}]),
            json!([{"year":2024,"month":2,"day":1,"color":"pink"},{"year":2024,"month":2,"day":1,"color":"sage"}]),
        ] {
            journal.pages[0].elements[1] = calendar.clone();
            journal.pages[0].elements[1]["dayHighlights"] = marks;
            assert!(journal.validate().is_err());
        }
    }

    #[test]
    fn colored_text_and_calendar_dates_survive_named_files_and_reopening() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("working");
        let path = root.path().join("colored.suki");
        let mut storage = crate::storage::Storage::open(&directory).unwrap();
        let mut journal = storage.load().unwrap();
        journal.pages[0].elements = vec![
            json!({"type":"postit","id":"note","x":24,"y":24,"width":240,"height":240,"color":"yellow","text":"Mi semana","marks":[{"kind":"highlight","start":0,"end":2,"color":"sage"}]}),
            json!({"type":"calendar","id":"cal","x":24,"y":300,"width":360,"height":340,"year":2024,"month":2,"dayHighlights":[{"year":2024,"month":2,"day":29,"color":"pink"}]}),
        ];
        journal.revision = storage.save(&journal).unwrap();
        let saved = crate::files::save(&mut storage, &path, journal.revision).unwrap();
        let next = crate::files::new(&mut storage, "Otro".into(), saved.revision).unwrap();
        crate::files::open(&mut storage, &path, next.revision).unwrap();
        assert_eq!(storage.load().unwrap().pages, journal.pages);
        drop(storage);
        assert_eq!(
            crate::storage::Storage::open(&directory)
                .unwrap()
                .load()
                .unwrap()
                .pages,
            journal.pages
        );
    }

    #[test]
    fn validates_text_marks_tape_and_paths_and_rejects_malformed_data() {
        let valid = vec![
            json!({"type":"text","id":"text","x":24,"y":24,"width":240,"height":160,"text":"🌱abc","marks":[{"kind":"highlight","start":2,"end":5}]}),
            json!({"type":"washi","id":"tape","x":24,"y":24,"width":160,"height":72,"color":"pink","pattern":"grid"}),
            json!({"type":"drawing","id":"draw","x":24,"y":24,"width":160,"height":112,"color":"ink","lineWidth":3,"points":[[0.0,0.0],[1.0,1.0]]}),
        ];
        let mut journal = Journal::new();
        journal.pages[0].elements = valid.clone();
        assert!(journal.validate().is_ok());
        for (index, field, value) in [
            (0, "marks", json!(null)),
            (0, "marks", json!([{"kind":"bold","start":0,"end":2}])),
            (0, "marks", json!([{"kind":"underline","start":-1,"end":2}])),
            (0, "marks", json!([{"kind":"underline","start":2,"end":2}])),
            (0, "marks", json!([{"kind":"underline","start":0,"end":6}])),
            (1, "color", json!("invalid")),
            (1, "pattern", json!("invalid")),
            (1, "height", json!(71)),
            (2, "points", json!([])),
            (2, "points", json!([[0, 0]])),
            (2, "points", json!([[0, 0], [1, 2]])),
            (2, "points", json!([[0, 0], [1]])),
            (2, "points", json!([[0, 0], ["1", 0]])),
            (2, "color", json!("invalid")),
            (2, "lineWidth", json!(0)),
            (2, "lineWidth", json!(13)),
        ] {
            journal.pages[0].elements = valid.clone();
            journal.pages[0].elements[index][field] = value;
            assert!(journal.validate().is_err(), "{index}:{field}");
        }
    }
}
