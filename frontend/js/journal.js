// Estado del editor. No conoce comandos Tauri, SQL ni ubicaciones de archivos.
import { isEditableElement, validateElement } from "./elements.js";

export function validateJournal(journal) {
  if (!journal || journal.schemaVersion !== 1 ||
      !Number.isSafeInteger(journal.revision) || journal.revision < 0 ||
      typeof journal.title !== "string" || !journal.title.trim() ||
      [...journal.title].length > 200 ||
      !Array.isArray(journal.pages) || !journal.pages.length) {
    throw new Error("El estado del journal no es válido o usa otra versión.");
  }
  const ids = new Set();
  for (const page of journal.pages) {
    if (typeof page.id !== "string" || !page.id || ids.has(page.id) ||
        typeof page.title !== "string" || !page.title.trim() ||
        [...page.title].length > 200 ||
        !Array.isArray(page.elements) ||
        page.elements.some(element => !element || typeof element !== "object" || Array.isArray(element))) {
      throw new Error("El journal contiene una página inválida.");
    }
    ids.add(page.id);
    const elementIds = new Set();
    for (const element of page.elements) {
      if (!isEditableElement(element)) continue;
      validateElement(element);
      if (elementIds.has(element.id)) throw new Error("Hay elementos con identificadores repetidos.");
      elementIds.add(element.id);
    }
  }
  if (!ids.has(journal.activePageId)) throw new Error("No se encontró la página activa.");
  return journal;
}

export function addPage(journal, id) {
  if (journal.pages.length >= 10_000) throw new Error("Se alcanzó el límite de páginas.");
  return validateJournal({
    ...journal,
    activePageId: id,
    pages: [...journal.pages, { id, title: `Página ${journal.pages.length + 1}`, elements: [] }],
  });
}

export function selectPage(journal, id) {
  return validateJournal({ ...journal, activePageId: id });
}

const title = value => {
  if (typeof value !== "string" || !value.trim() || [...value.trim()].length > 200) {
    throw new Error("El nombre debe tener entre 1 y 200 caracteres.");
  }
  return value.trim();
};

export function renameJournal(journal, name) {
  return validateJournal({ ...journal, title: title(name) });
}

export function renamePage(journal, id, name) {
  if (!journal.pages.some(page => page.id === id)) throw new Error("No se encontró la página.");
  const nameValue = title(name);
  return validateJournal({ ...journal, pages: journal.pages.map(page => page.id === id ? { ...page, title: nameValue } : page) });
}

export function deletePage(journal, id, replacementId) {
  const index = journal.pages.findIndex(page => page.id === id);
  if (index < 0) throw new Error("No se encontró la página.");
  const pages = journal.pages.filter(page => page.id !== id);
  if (!pages.length) return validateJournal({ ...journal, activePageId: replacementId,
    pages: [{ id: replacementId, title: "Página 1", elements: [] }] });
  return validateJournal({ ...journal, pages,
    activePageId: journal.activePageId === id ? pages[Math.min(index, pages.length - 1)].id : journal.activePageId });
}

export function documentSignature(journal) {
  if (!journal) return null;
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical({ schemaVersion: journal.schemaVersion, title: journal.title, pages: journal.pages }));
}
