// Estado del editor. No conoce comandos Tauri, SQL ni ubicaciones de archivos.
import { isEditableElement, validateElement } from "./elements.js";

export function validateJournal(journal) {
  if (!journal || journal.schemaVersion !== 1 ||
      !Number.isSafeInteger(journal.revision) || journal.revision < 0 ||
      typeof journal.title !== "string" || !journal.title.trim() ||
      !Array.isArray(journal.pages) || !journal.pages.length) {
    throw new Error("El estado del journal no es válido o usa otra versión.");
  }
  const ids = new Set();
  for (const page of journal.pages) {
    if (typeof page.id !== "string" || !page.id || ids.has(page.id) ||
        typeof page.title !== "string" || !page.title.trim() ||
        !Array.isArray(page.elements) ||
        page.elements.some(element => !element || typeof element !== "object" || Array.isArray(element))) {
      throw new Error("El journal contiene una página inválida.");
    }
    ids.add(page.id);
    const elementIds = new Set();
    for (const element of page.elements) {
      if (!isEditableElement(element)) continue;
      validateElement(element);
      if (elementIds.has(element.id)) throw new Error("Hay textos o post-it con identificadores repetidos.");
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
