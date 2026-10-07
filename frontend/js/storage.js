// Adaptador de la persistencia nativa; las rutas las resuelve la sesión Rust.
export function nativeStorage() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) throw new Error("Abrí Suki Journal desde la aplicación de escritorio para usar el guardado.");
  return {
    load: () => invoke("load_journal"),
    save: journal => invoke("save_journal", { journal }),
    fileInfo: () => invoke("journal_file_info"),
    newJournal: (title, revision) => invoke("new_journal", { title, revision }),
    openFile: revision => invoke("open_journal_file", { revision }),
    saveFile: (saveAs, revision) => invoke("save_journal_file", { saveAs, revision }),
  };
}
