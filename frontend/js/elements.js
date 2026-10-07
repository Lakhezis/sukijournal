// Coordenadas en el interior de la hoja, independientes del scroll de la ventana.
export const PAPER = Object.freeze({ width: 852, height: 1078 });
export const TEXT_LIMIT = 10_000;
export const MIN_TEXT_SIZE = Object.freeze({ width: 120, height: 88 });
export const MIN_POSTIT_SIZE = Object.freeze({ width: 160, height: 144 });
export const POSTIT_COLORS = Object.freeze([
  { value: "yellow", label: "Amarillo" }, { value: "pink", label: "Rosa" },
  { value: "sage", label: "Verde" }, { value: "lilac", label: "Lila" },
].map(Object.freeze));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const isEditableElement = element => element.type === "text" || element.type === "postit";
export const minimumSize = element => element.type === "postit" ? MIN_POSTIT_SIZE : MIN_TEXT_SIZE;

export function validateElement(element) {
  const minimum = minimumSize(element);
  if (!isEditableElement(element) || typeof element.id !== "string" || !element.id || element.id.length > 100 ||
      typeof element.text !== "string" || element.text.length > TEXT_LIMIT ||
      ![element.x, element.y, element.width, element.height].every(Number.isFinite) ||
      element.x < 0 || element.y < 0 || element.width < minimum.width ||
      element.height < minimum.height || element.x + element.width > PAPER.width ||
      element.y + element.height > PAPER.height ||
      (element.type === "postit" && !POSTIT_COLORS.some(color => color.value === element.color))) {
    throw new Error("Hay un texto o post-it inválido o fuera de la hoja.");
  }
  return element;
}

export function createText(id, x = 24, y = 24) {
  return validateElement({ type: "text", id, text: "", width: 240, height: 160,
    x: clamp(x, 0, PAPER.width - 240), y: clamp(y, 0, PAPER.height - 160) });
}

export function createPostit(id, x = 24, y = 24, color = "yellow") {
  return validateElement({ type: "postit", id, text: "", color, width: 240, height: 240,
    x: clamp(x, 0, PAPER.width - 240), y: clamp(y, 0, PAPER.height - 240) });
}

function changePage(journal, pageId, transform) {
  if (!journal.pages.some(page => page.id === pageId)) throw new Error("No se encontró la página.");
  return { ...journal, pages: journal.pages.map(page => page.id === pageId
    ? { ...page, elements: transform(page.elements) } : page) };
}

export function insertElement(journal, pageId, element) {
  validateElement(element);
  return changePage(journal, pageId, elements => {
    if (elements.some(item => item.id === element.id)) throw new Error("El identificador del elemento ya existe.");
    return [...elements, element];
  });
}

function changeElement(journal, pageId, id, transform) {
  return changePage(journal, pageId, elements => {
    if (!elements.some(item => isEditableElement(item) && item.id === id)) {
      throw new Error("No se encontró el texto o post-it.");
    }
    return elements.map(item => isEditableElement(item) && item.id === id
      ? validateElement(transform(item)) : item);
  });
}

export function editElementText(journal, pageId, id, text) {
  return changeElement(journal, pageId, id, element => ({ ...element, text }));
}

export function colorPostit(journal, pageId, id, color) {
  return changeElement(journal, pageId, id, element => {
    if (element.type !== "postit") throw new Error("El color solo se aplica a los post-it.");
    return { ...element, color };
  });
}

export function moveElement(journal, pageId, id, x, y) {
  return changeElement(journal, pageId, id, element => ({ ...element,
    x: clamp(x, 0, PAPER.width - element.width), y: clamp(y, 0, PAPER.height - element.height) }));
}

export function resizeElement(journal, pageId, id, width, height) {
  return changeElement(journal, pageId, id, element => ({ ...element,
    width: clamp(width, minimumSize(element).width, PAPER.width - element.x),
    height: clamp(height, minimumSize(element).height, PAPER.height - element.y) }));
}

export function deleteElement(journal, pageId, id) {
  return changePage(journal, pageId,
    elements => elements.filter(item => !isEditableElement(item) || item.id !== id));
}
