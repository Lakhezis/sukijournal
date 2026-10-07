// Coordenadas en el interior de la hoja, independientes del scroll de la ventana.
import { findStamp } from "./stamps.js";
import { validPeriod, validDay, validateDayHighlights } from "./calendar.js";
import { validateMarks, rebaseMarks, toggleMarks } from "./formatting.js";
import { validHighlightColor } from "./formatting.js";
import { WASHI_PATTERNS, validDrawing, POINT_LIMIT } from "./decorations.js";
export const PAPER = Object.freeze({ width: 852, height: 1078 });
export const TEXT_LIMIT = 10_000;
export const MIN_TEXT_SIZE = Object.freeze({ width: 120, height: 88 });
export const MIN_POSTIT_SIZE = Object.freeze({ width: 160, height: 144 });
export const MIN_STAMP_SIZE = Object.freeze({ width: 96, height: 96 });
export const MIN_CALENDAR_SIZE = Object.freeze({ width: 280, height: 280 });
export const MIN_WASHI_SIZE = Object.freeze({ width: 160, height: 72 });
export const MIN_DRAWING_SIZE = Object.freeze({ width: 160, height: 112 });
export const POSTIT_COLORS = Object.freeze([
  { value: "yellow", label: "Amarillo" }, { value: "pink", label: "Rosa" },
  { value: "sage", label: "Verde" }, { value: "lilac", label: "Lila" },
].map(Object.freeze));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const isTextElement = element => element.type === "text" || element.type === "postit";
export const isEditableElement = element => isTextElement(element) || ["stamp", "calendar", "washi", "drawing"].includes(element.type);
export const minimumSize = element => element.type === "stamp" ? MIN_STAMP_SIZE
  : element.type === "washi" ? MIN_WASHI_SIZE : element.type === "drawing" ? MIN_DRAWING_SIZE
  : element.type === "calendar" ? MIN_CALENDAR_SIZE : element.type === "postit" ? MIN_POSTIT_SIZE : MIN_TEXT_SIZE;

export function validateElement(element) {
  if (isTextElement(element)) validateMarks(element.text, element.marks);
  if (element.type === "calendar") validateDayHighlights(element.dayHighlights);
  const minimum = minimumSize(element);
  if (!isEditableElement(element) || typeof element.id !== "string" || !element.id || element.id.length > 100 ||
      (isTextElement(element) && (typeof element.text !== "string" || element.text.length > TEXT_LIMIT)) ||
      ![element.x, element.y, element.width, element.height].every(Number.isFinite) ||
      element.x < 0 || element.y < 0 || element.width < minimum.width ||
      element.height < minimum.height || element.x + element.width > PAPER.width ||
      element.y + element.height > PAPER.height ||
      (element.type === "postit" && !POSTIT_COLORS.some(color => color.value === element.color)) ||
      (element.type === "calendar" && !validPeriod(element.year, element.month)) ||
      (element.type === "washi" && (!WASHI_PATTERNS.some(pattern => pattern.value === element.pattern) || !POSTIT_COLORS.some(color => color.value === element.color))) ||
      (element.type === "drawing" && !validDrawing(element)) ||
      (element.type === "stamp" && (!findStamp(element.stamp) || element.width !== element.height))) {
    throw new Error("Hay un elemento inválido o fuera de la hoja.");
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

export function createStamp(id, stamp = "flower", x = 24, y = 24) {
  return validateElement({ type: "stamp", id, stamp, width: 160, height: 160,
    x: clamp(x, 0, PAPER.width - 160), y: clamp(y, 0, PAPER.height - 160) });
}

export function createCalendar(id, year, month, x = 24, y = 24) {
  return validateElement({ type: "calendar", id, year, month, width: 360, height: 340,
    x: clamp(x, 0, PAPER.width - 360), y: clamp(y, 0, PAPER.height - 340) });
}

export function createWashi(id, x = 24, y = 24, color = "pink", pattern = "stripes") {
  return validateElement({ type: "washi", id, color, pattern, width: 264, height: 96,
    x: clamp(x, 0, PAPER.width - 264), y: clamp(y, 0, PAPER.height - 96) });
}

export function createDrawing(id, points, color = "ink", lineWidth = 3) {
  if (!Array.isArray(points) || !points.length || points.length > POINT_LIMIT || points.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) {
    throw new Error("El trazo no es válido.");
  }
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  const x = clamp(Math.min(...xs) - 14, 0, PAPER.width - MIN_DRAWING_SIZE.width);
  const y = clamp(Math.min(...ys) - 28, 0, PAPER.height - MIN_DRAWING_SIZE.height);
  const width = clamp(Math.max(...xs) - x + 14, MIN_DRAWING_SIZE.width, PAPER.width - x);
  const height = clamp(Math.max(...ys) - y + 14, MIN_DRAWING_SIZE.height, PAPER.height - y);
  const normalized = points.map(([px, py]) => [clamp((px - x - 14) / (width - 28), 0, 1), clamp((py - y - 28) / (height - 42), 0, 1)]);
  if (normalized.length === 1) normalized.push([...normalized[0]]);
  return validateElement({ type: "drawing", id, x, y, width, height, points: normalized, color, lineWidth });
}

export function styleDecoration(journal, pageId, id, changes) {
  return changeElement(journal, pageId, id, element => {
    if (!["washi", "drawing"].includes(element.type) || Object.keys(changes).some(key =>
      !(element.type === "washi" ? ["color", "pattern"] : ["color", "lineWidth"]).includes(key))) {
      throw new Error("No se puede aplicar ese estilo al elemento.");
    }
    return { ...element, ...changes };
  });
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
      throw new Error("No se encontró el elemento.");
    }
    return elements.map(item => isEditableElement(item) && item.id === id
      ? validateElement(transform(item)) : item);
  });
}

export function editElementText(journal, pageId, id, text, edit = null) {
  return changeElement(journal, pageId, id, element => {
    if (!isTextElement(element)) throw new Error("Este elemento no contiene texto editable.");
    return { ...element, text, ...(element.marks ? { marks: rebaseMarks(element.text, text, element.marks, edit) } : {}) };
  });
}

export function formatElementText(journal, pageId, id, kind, start, end, color = "yellow", toggle = true) {
  return changeElement(journal, pageId, id, element => {
    if (!isTextElement(element)) throw new Error("Seleccioná texto en un bloque o post-it.");
    return { ...element, marks: toggleMarks(element.text, element.marks || [], kind, start, end, color, toggle) };
  });
}

export function highlightCalendarDay(journal, pageId, id, day, color = "yellow", toggle = true) {
  return changeElement(journal, pageId, id, element => {
    if (element.type !== "calendar" || !validDay(element.year, element.month, day) || !validHighlightColor(color)) {
      throw new Error("Elegí un día y un color de remarcado válidos.");
    }
    const marks = element.dayHighlights || [];
    const sameDate = mark => mark.year === element.year && mark.month === element.month && mark.day === day;
    const previous = marks.find(sameDate);
    const dayHighlights = marks.filter(mark => !sameDate(mark));
    if (!toggle || previous?.color !== color) dayHighlights.push({ year: element.year, month: element.month, day, color });
    return { ...element, dayHighlights };
  });
}

export function colorPostit(journal, pageId, id, color) {
  return changeElement(journal, pageId, id, element => {
    if (element.type !== "postit") throw new Error("El color solo se aplica a los post-it.");
    return { ...element, color };
  });
}

export function changeCalendarPeriod(journal, pageId, id, year, month) {
  return changeElement(journal, pageId, id, element => {
    if (element.type !== "calendar") throw new Error("El mes y el año solo se aplican a calendarios.");
    return { ...element, year, month };
  });
}

export function moveElement(journal, pageId, id, x, y) {
  return changeElement(journal, pageId, id, element => ({ ...element,
    x: clamp(x, 0, PAPER.width - element.width), y: clamp(y, 0, PAPER.height - element.height) }));
}

export function resizedGeometry(element, width, height) {
  if (![width, height].every(Number.isFinite)) throw new Error("El tamaño del elemento no es válido.");
  if (element.type === "stamp") {
    const requested = Math.abs(width - element.width) >= Math.abs(height - element.height) ? width : height;
    const size = clamp(requested, MIN_STAMP_SIZE.width, Math.min(PAPER.width - element.x, PAPER.height - element.y));
    return { ...element, width: size, height: size };
  }
  return { ...element,
    width: clamp(width, minimumSize(element).width, PAPER.width - element.x),
    height: clamp(height, minimumSize(element).height, PAPER.height - element.y) };
}

export function resizeElement(journal, pageId, id, width, height) {
  return changeElement(journal, pageId, id, element => resizedGeometry(element, width, height));
}

export function deleteElement(journal, pageId, id) {
  return changePage(journal, pageId,
    elements => elements.filter(item => !isEditableElement(item) || item.id !== id));
}
