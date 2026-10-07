import { CREATIVE_COLORS } from "./colors.js";

export const WASHI_COLORS = CREATIVE_COLORS;
export const WASHI_PATTERNS = Object.freeze([
  { value: "stripes", label: "Rayas" }, { value: "dots", label: "Puntos" }, { value: "grid", label: "Cuadrícula" },
]);
export const DRAWING_COLORS = Object.freeze([
  { value: "ink", label: "Tinta", css: "#0d2426" }, { value: "salmon", label: "Rosa", css: "#b77878" },
  { value: "olive", label: "Oliva", css: "#727259" }, { value: "lilac", label: "Lila", css: "#927bba" },
]);
export const POINT_LIMIT = 4096;
export const DRAWING_POINT_LIMIT = 65_536;

export function validStroke(stroke) {
  return Boolean(stroke) && DRAWING_COLORS.some(color => color.value === stroke.color) &&
    Number.isFinite(stroke.lineWidth) && stroke.lineWidth >= 1 && stroke.lineWidth <= 12 &&
    Array.isArray(stroke.points) && stroke.points.length >= 2 && stroke.points.length <= POINT_LIMIT &&
    stroke.points.every(point => Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
}

export function validDrawing(element) {
  if (!DRAWING_COLORS.some(color => color.value === element.color) ||
      !Number.isFinite(element.lineWidth) || element.lineWidth < 1 || element.lineWidth > 12) return false;
  if (element.strokes === undefined) return validStroke(element);
  return element.points === undefined && Array.isArray(element.strokes) && element.strokes.length > 0 &&
    element.strokes.every(validStroke) &&
    element.strokes.reduce((count, stroke) => count + stroke.points.length, 0) <= DRAWING_POINT_LIMIT;
}

export function drawingPath() {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  return path;
}

export function renderDrawing(svg, element) {
  const strokes = element.strokes ?? [element];
  while (svg.children.length > strokes.length) svg.lastElementChild.remove();
  while (svg.children.length < strokes.length) svg.append(drawingPath());
  // Las coordenadas normalizadas permiten mover y redimensionar sin perder el trazo.
  const width = Math.max(1, element.width - 28), height = Math.max(1, element.height - 42);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  strokes.forEach((stroke, index) => {
    const path = svg.children[index];
    path.setAttribute("d", stroke.points.map(([x, y], index) => `${index ? "L" : "M"}${x * width},${y * height}`).join(" "));
    path.setAttribute("stroke", DRAWING_COLORS.find(color => color.value === stroke.color).css);
    path.setAttribute("stroke-width", stroke.lineWidth);
  });
}

export function drawingArtwork() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("drawing-artwork");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.append(drawingPath());
  return svg;
}

export function styleSelect(choices, label, onChange) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", label);
  for (const choice of choices) {
    const option = document.createElement("option");
    option.value = choice.value;
    option.textContent = choice.label;
    select.append(option);
  }
  select.addEventListener("change", () => onChange(select.value));
  return select;
}
