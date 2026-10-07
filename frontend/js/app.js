import { addPage, selectPage } from "./journal.js";
import { nativeStorage } from "./storage.js";
import { createStore } from "./store.js";
import { createEditor } from "./editor.js";
import { isEditableElement } from "./elements.js";
import { STAMPS } from "./stamps.js";

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
const textTool = document.querySelector("#tool-text");
const postitTool = document.querySelector("#tool-postit");
const stampTool = document.querySelector("#tool-stamp");
const stampPicker = document.querySelector("#stamp-picker");
let chosenStamp = "flower";
const undoButton = document.querySelector("#undo");
const redoButton = document.querySelector("#redo");
let closing = false;
let activeId = null;
let lastState = { journal: null, phase: "loading", error: "" };
let store;
const editor = createEditor({ paper: page, workspace, getStore: () => store,
  onPlacement(type) {
    for (const [tool, name] of [[textTool, "text"], [postitTool, "postit"], [stampTool, "stamp"]]) {
      tool.classList.toggle("is-active", type === name);
      tool.setAttribute("aria-pressed", String(type === name));
    }
    stampTool.setAttribute("aria-expanded", String(type === "stamp"));
    document.querySelector("#text-tool-help").hidden = type !== "text";
    document.querySelector("#postit-tool-help").hidden = type !== "postit";
    stampPicker.hidden = type !== "stamp";
  } });

for (const stamp of STAMPS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stamp-choice";
  button.dataset.stamp = stamp.value;
  button.disabled = true;
  button.setAttribute("aria-label", `Elegir sellito: ${stamp.label}`);
  button.setAttribute("aria-pressed", String(stamp.value === chosenStamp));
  const image = document.createElement("img");
  image.src = stamp.src;
  image.alt = "";
  image.width = image.height = 42;
  const label = document.createElement("span");
  label.textContent = stamp.label;
  button.append(image, label);
  button.addEventListener("click", () => {
    editor.finish();
    if (!editor.chooseStamp(stamp.value)) return;
    chosenStamp = stamp.value;
    for (const choice of stampPicker.querySelectorAll("button")) {
      choice.setAttribute("aria-pressed", String(choice.dataset.stamp === chosenStamp));
    }
  });
  document.querySelector("#stamp-options").append(button);
}
stampPicker.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  editor.setPlacement(null);
  stampTool.focus({ preventScroll: true });
});

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
  textTool.disabled = !ready;
  postitTool.disabled = !ready;
  stampTool.disabled = !ready;
  for (const choice of stampPicker.querySelectorAll("button")) choice.disabled = !ready;
  undoButton.disabled = !ready || !state.canUndo;
  redoButton.disabled = !ready || !state.canRedo;
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
  const texts = active?.elements.filter(element => element.type === "text").length || 0;
  const postits = active?.elements.filter(element => element.type === "postit").length || 0;
  const stamps = active?.elements.filter(element => element.type === "stamp").length || 0;
  const counts = [texts ? `${texts} ${texts === 1 ? "texto" : "textos"}` : "",
    postits ? `${postits} post-it` : "", stamps ? `${stamps} ${stamps === 1 ? "sellito" : "sellitos"}` : ""].filter(Boolean);
  document.querySelector("#page-subtitle").textContent = active
    ? (counts.join(" · ") || "lienzo en blanco") : "";
  document.querySelector("#unknown-elements").hidden = !active?.elements.some(element => !isEditableElement(element));
  editor.render(active, ready);
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
        if (item.id !== activeId) {
          editor.finish();
          store.update(current => selectPage(current, item.id), { recordHistory: false });
        }
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

try {
  store = createStore(nativeStorage(), render);
  const currentWindow = window.__TAURI__.window.getCurrentWindow();
  await currentWindow.onCloseRequested(async event => {
    event.preventDefault();
    if (closing) return;
    editor.finish();
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
  addButton.addEventListener("click", () => {
    editor.finish();
    store.update(current => addPage(current, crypto.randomUUID()));
  });
  for (const [tool, type] of [[textTool, "text"], [postitTool, "postit"], [stampTool, "stamp"]]) {
    tool.addEventListener("click", () => { editor.finish(); editor.togglePlacement(type); });
  }
  function history(action) {
    if (closing || !lastState.journal || lastState.phase === "error" || lastState.phase === "loading") return;
    editor.finish();
    store[action]();
  }
  undoButton.addEventListener("click", () => history("undo"));
  redoButton.addEventListener("click", () => history("redo"));
  document.addEventListener("keydown", event => {
    if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    history(key === "y" || event.shiftKey ? "redo" : "undo");
  });
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
