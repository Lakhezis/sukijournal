import { addPage, selectPage } from "./journal.js";
import { nativeStorage } from "./storage.js";
import { createStore } from "./store.js";

const workspace = document.querySelector("#workspace");
const page = document.querySelector("#journal-page");
const status = document.querySelector("#app-status");
const navigation = document.querySelector("#page-tabs");
const addButton = document.querySelector("#add-page");
const notice = document.querySelector("#storage-notice");
const noticeMessage = document.querySelector("#storage-message");
const retryButton = document.querySelector("#retry-storage");
const reloadButton = document.querySelector("#reload-journal");
const reloadDialog = document.querySelector("#reload-dialog");
let closing = false;
let activeId = null;
let lastState = { journal: null, phase: "loading", error: "" };

function revealActivePage() {
  const button = navigation.querySelector('[aria-current="page"]');
  if (!button) return;
  const tab = button.getBoundingClientRect();
  const container = navigation.getBoundingClientRect();
  if (tab.right > container.right - 5) navigation.scrollLeft += tab.right - container.right + 5;
  else if (tab.left < container.left + 5) navigation.scrollLeft -= container.left - tab.left + 5;
}

// También mantener visible la selección cuando cambie el ancho de las pestañas.
new ResizeObserver(revealActivePage).observe(navigation);

function render(state) {
  lastState = state;
  const { journal, phase, error } = state;
  const ready = Boolean(journal) && (phase === "saved" || phase === "saving") && !closing;
  const active = journal?.pages.find(item => item.id === journal.activePageId);
  status.textContent = closing ? "Cerrando…" : {
    loading: "Cargando…", saving: "Guardando…", saved: "Guardado", error: "Sin guardar",
  }[phase];
  status.closest(".save-status").dataset.state = phase;
  notice.hidden = phase !== "error";
  noticeMessage.textContent = error ? `${error}${journal ? " Tus cambios siguen en esta ventana." : ""}` : "";
  retryButton.disabled = closing;
  reloadButton.hidden = !journal;
  reloadButton.disabled = closing;
  addButton.disabled = !ready || journal.pages.length >= 10_000;
  page.hidden = !journal;
  if (journal) {
    document.querySelector("h1").textContent = journal.title;
    document.title = `${journal.title} · Suki Journal`;
  }
  document.querySelector("#current-page-title").textContent = active?.title ||
    (phase === "error" ? "Journal no disponible" : "Cargando journal…");
  document.querySelector("#page-subtitle").textContent = active
    ? (active.elements.length ? "Contenido de futuras herramientas" : "lienzo en blanco") : "";
  workspace.setAttribute("aria-label", active ? `Área de trabajo; hoja de ${active.title}` : "Área de trabajo");
  page.setAttribute("aria-label", active ? `${active.title}, hoja con trama de puntos` : "Hoja con trama de puntos");
  document.querySelector("#page-count").textContent = journal
    ? `${journal.pages.length} ${journal.pages.length === 1 ? "página" : "páginas"}` : "";

  // Conservar los botones mantiene el foco al guardar y al navegar con teclado.
  const existing = new Map([...navigation.children].map(button => [button.dataset.pageId, button]));
  for (const item of journal?.pages || []) {
    let button = existing.get(item.id);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "page-tab";
      button.dataset.pageId = item.id;
      button.addEventListener("click", () => {
        if (item.id !== activeId) store.update(current => selectPage(current, item.id));
      });
      navigation.append(button);
    }
    existing.delete(item.id);
    button.textContent = item.title;
    button.disabled = !ready;
    button.classList.toggle("is-active", item.id === journal.activePageId);
    if (item.id === journal.activePageId) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  for (const button of existing.values()) button.remove();
  if (active && active.id !== activeId) {
    activeId = active.id;
    workspace.scrollTo(0, 0);
    revealActivePage();
  }
}

let store;
try {
  store = createStore(nativeStorage(), render);
  const currentWindow = window.__TAURI__.window.getCurrentWindow();
  await currentWindow.onCloseRequested(async event => {
    event.preventDefault();
    if (closing) return;
    closing = true;
    render(lastState);
    if (await store.flush()) {
      try {
        await currentWindow.destroy();
        return;
      } catch (error) {
        render({ ...lastState, phase: "error", error: String(error) });
      }
    }
    closing = false;
    render(lastState);
  });
  addButton.addEventListener("click", () => store.update(current => addPage(current, crypto.randomUUID())));
  retryButton.addEventListener("click", () => { void store.retry(); });
  reloadButton.addEventListener("click", () => {
    reloadDialog.returnValue = "cancel";
    reloadDialog.showModal();
  });
  reloadDialog.addEventListener("close", () => {
    if (reloadDialog.returnValue === "reload") void store.load();
  });
  await store.load();
} catch (error) {
  render({ journal: null, phase: "error", error: String(error?.message || error) });
  retryButton.hidden = true;
}
