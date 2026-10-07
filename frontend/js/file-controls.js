import { renamePage, renameJournal, deletePage, documentSignature } from "./journal.js";

export function createFileControls({ storage, getStore, getState, editor, setBusy, resetView }) {
  const buttons = [...document.querySelectorAll('[data-file-action], #rename-page, #delete-page')];
  const fileLabel = document.querySelector("#journal-file-label");
  const fileStatus = document.querySelector("#journal-file-status");
  const feedback = document.querySelector("#file-feedback");
  const nameDialog = document.querySelector("#name-dialog");
  const nameInput = document.querySelector("#name-input");
  const deleteDialog = document.querySelector("#delete-page-dialog");
  const switchDialog = document.querySelector("#switch-journal-dialog");
  let fileInfo = { path: null, savedJournal: null };
  let busy = false;
  let nameAction = null;
  let deleteId = null;
  let retryAction = null;

  const dirty = () => documentSignature(getState().journal) !== documentSignature(fileInfo.savedJournal);
  function message(text, error = false) {
    feedback.textContent = text;
    feedback.dataset.error = String(error);
    document.querySelector("#retry-file").hidden = !error;
  }
  function render(state = getState(), allowed = true) {
    const ready = allowed && Boolean(state.journal) && !busy && ["saved", "saving"].includes(state.phase);
    for (const button of buttons) button.disabled = !ready;
    fileLabel.textContent = fileInfo.path ? fileInfo.path.split(/[\\/]/).at(-1) : "Sin archivo";
    fileLabel.title = fileInfo.path || "Elegí Guardar para crear un archivo .suki";
    fileStatus.textContent = state.journal ? (dirty() ? "Cambios por guardar en archivo" : "Archivo guardado") : "";
    fileStatus.dataset.dirty = String(dirty());
    document.querySelector("#retry-file").disabled = busy;
  }
  async function refresh() {
    fileInfo = await storage.fileInfo();
    render();
  }
  function switchChoice() {
    return new Promise(resolve => {
      switchDialog.returnValue = "cancel";
      switchDialog.addEventListener("close", () => resolve(switchDialog.returnValue), { once: true });
      switchDialog.showModal();
    });
  }
  async function saveFile(saveAs = false) {
    const result = await storage.saveFile(saveAs, getState().journal.revision);
    if (!result) return false;
    fileInfo = result;
    getStore().acceptRevision(result.revision);
    message("Archivo guardado. El autoguardado sigue protegiendo tu edición.");
    render();
    return true;
  }
  async function canSwitch() {
    if (!dirty()) return true;
    const choice = await switchChoice();
    if (choice === "discard") return true;
    return choice === "save" ? saveFile() : false;
  }
  async function run(action) {
    if (busy || !getState().journal || !["saved", "saving"].includes(getState().phase)) return;
    editor.finish();
    editor.setPlacement(null);
    busy = true;
    setBusy(true);
    try {
      if (!await getStore().flush()) return;
      await action();
      retryAction = null;
    } catch (error) {
      retryAction = () => run(action);
      message(String(error?.message || error), true);
    } finally {
      busy = false;
      setBusy(false);
      render();
    }
  }
  async function changeJournal(kind, title) {
    if (!await canSwitch()) return;
    const result = kind === "new" ? await storage.newJournal(title, getState().journal.revision)
      : await storage.openFile(getState().journal.revision);
    if (!result) return;
    fileInfo = result;
    resetView();
    if (await getStore().load()) message(kind === "new" ? "Nuevo journal listo. Elegí Guardar para crear su archivo." : "Journal abierto. Podés continuar editándolo.");
  }
  function showName(kind) {
    const journal = getState().journal;
    if (!journal) return;
    const page = journal.pages.find(page => page.id === journal.activePageId);
    nameAction = { kind, id: page.id };
    nameDialog.returnValue = "cancel";
    document.querySelector("#name-heading").textContent = kind === "new" ? "Nuevo bullet journal" : kind === "page" ? "Nombre de la página" : "Nombre del journal";
    nameInput.value = kind === "new" ? "Mi Bullet Journal" : kind === "page" ? page.title : journal.title;
    nameInput.setCustomValidity("");
    nameDialog.showModal();
    nameInput.focus();
    nameInput.select();
  }
  nameInput.addEventListener("input", () => nameInput.setCustomValidity(
    !nameInput.value.trim() || [...nameInput.value.trim()].length > 200 ? "Escribí un nombre de 1 a 200 caracteres." : ""));
  nameDialog.addEventListener("close", () => {
    if (nameDialog.returnValue !== "apply" || !nameAction) return;
    const { kind, id } = nameAction, value = nameInput.value.trim();
    if (kind === "new") { void run(() => changeJournal("new", value)); return; }
    editor.finish();
    getStore().update(journal => kind === "page" ? renamePage(journal, id, value) : renameJournal(journal, value));
  });
  deleteDialog.addEventListener("close", () => {
    if (deleteDialog.returnValue !== "delete" || !deleteId) return;
    editor.finish();
    getStore().update(journal => deletePage(journal, deleteId, crypto.randomUUID()));
    document.querySelector("#journal-page").focus({ preventScroll: true });
  });
  document.querySelector("#rename-page").addEventListener("click", () => showName("page"));
  document.querySelector("#delete-page").addEventListener("click", () => {
    const journal = getState().journal, page = journal.pages.find(page => page.id === journal.activePageId);
    deleteId = page.id;
    deleteDialog.returnValue = "cancel";
    document.querySelector("#delete-page-name").textContent = page.title;
    deleteDialog.showModal();
  });
  for (const button of document.querySelectorAll("[data-file-action]")) {
    button.addEventListener("click", () => {
      document.querySelector("#file-menu").open = false;
      const action = button.dataset.fileAction;
      if (action === "new" || action === "rename") showName(action === "new" ? "new" : "journal");
      else if (action === "open") void run(() => changeJournal("open"));
      else void run(() => saveFile(action === "save-as"));
    });
  }
  document.querySelector("#retry-file").addEventListener("click", () => retryAction?.());
  document.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing || document.querySelector("dialog[open]")) return;
    const action = { s: event.shiftKey ? "save-as" : "save", o: "open", n: "new" }[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    document.querySelector(`[data-file-action="${action}"]`).click();
  });
  return { render, refresh, message };
}
