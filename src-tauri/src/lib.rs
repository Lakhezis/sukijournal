// En esta etapa Rust solo inicia la ventana y sus recursos web locales.
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Suki Journal");
}
