// Coordenadas en el interior de la hoja, independientes del scroll de la ventana.
export const PAPER = Object.freeze({ width: 852, height: 1078 });
export const TEXT_LIMIT = 10_000;
export const MIN_TEXT_SIZE = Object.freeze({ width: 120, height: 88 });
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function validateTextElement(element) {
  if (element.type !== "text" || typeof element.id !== "string" || !element.id || element.id.length > 100 ||
      typeof element.text !== "string" || element.text.length > TEXT_LIMIT ||
      ![element.x, element.y, element.width, element.height].every(Number.isFinite) ||
      element.x < 0 || element.y < 0 || element.width < MIN_TEXT_SIZE.width ||
      element.height < MIN_TEXT_SIZE.height || element.x + element.width > PAPER.width ||
      element.y + element.height > PAPER.height) {
    throw new Error("Hay un bloque de texto inválido o fuera de la hoja.");
  }
  return element;
}

export function createText(id, x = 24, y = 24) {
  return validateTextElement({ type: "text", id, text: "", width: 240, height: 160,
    x: clamp(x, 0, PAPER.width - 240), y: clamp(y, 0, PAPER.height - 160) });
}

function changePage(journal, pageId, transform) {
  if (!journal.pages.some(page => page.id === pageId)) throw new Error("No se encontró la página.");
  return { ...journal, pages: journal.pages.map(page => page.id === pageId
    ? { ...page, elements: transform(page.elements) } : page) };
}

export function insertText(journal, pageId, element) {
  validateTextElement(element);
  return changePage(journal, pageId, elements => {
    if (elements.some(item => item.id === element.id)) throw new Error("El identificador del texto ya existe.");
    return [...elements, element];
  });
}

function changeText(journal, pageId, id, transform) {
  return changePage(journal, pageId, elements => {
    if (!elements.some(item => item.type === "text" && item.id === id)) {
      throw new Error("No se encontró el bloque de texto.");
    }
    return elements.map(item => item.type === "text" && item.id === id
      ? validateTextElement(transform(item)) : item);
  });
}

export function editText(journal, pageId, id, text) {
  return changeText(journal, pageId, id, element => ({ ...element, text }));
}

export function moveText(journal, pageId, id, x, y) {
  return changeText(journal, pageId, id, element => ({ ...element,
    x: clamp(x, 0, PAPER.width - element.width), y: clamp(y, 0, PAPER.height - element.height) }));
}

export function resizeText(journal, pageId, id, width, height) {
  return changeText(journal, pageId, id, element => ({ ...element,
    width: clamp(width, MIN_TEXT_SIZE.width, PAPER.width - element.x),
    height: clamp(height, MIN_TEXT_SIZE.height, PAPER.height - element.y) }));
}

export function deleteText(journal, pageId, id) {
  return changePage(journal, pageId,
    elements => elements.filter(item => item.type !== "text" || item.id !== id));
}
