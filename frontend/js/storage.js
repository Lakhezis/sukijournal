// Adaptador de la persistencia nativa; las rutas las resuelve la sesión Rust.
export function nativeStorage() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) throw new Error("Abrí Suki Journal desde la aplicación de escritorio para usar el guardado.");
  return {
    load: () => invoke("load_journal"),
    save: journal => invoke("save_journal", { journal }),
  };
}
