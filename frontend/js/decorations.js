export const WASHI_PATTERNS = Object.freeze([
  { value: "stripes", label: "Rayas" }, { value: "dots", label: "Puntos" }, { value: "grid", label: "Cuadrícula" },
]);
export const DRAWING_COLORS = Object.freeze([
  { value: "ink", label: "Tinta", css: "#0d2426" }, { value: "salmon", label: "Rosa", css: "#b77878" },
  { value: "olive", label: "Oliva", css: "#727259" }, { value: "lilac", label: "Lila", css: "#927bba" },
]);
export const POINT_LIMIT = 4096;

export function validDrawing(element) {
  return DRAWING_COLORS.some(color => color.value === element.color) &&
    Number.isFinite(element.lineWidth) && element.lineWidth >= 1 && element.lineWidth <= 12 &&
    Array.isArray(element.points) && element.points.length >= 2 && element.points.length <= POINT_LIMIT &&
    element.points.every(point => Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
}

export function renderDrawing(svg, element) {
  const path = svg.firstElementChild;
  // Las coordenadas normalizadas permiten mover y redimensionar sin perder el trazo.
  const width = Math.max(1, element.width - 28), height = Math.max(1, element.height - 42);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  path.setAttribute("d", element.points.map(([x, y], index) => `${index ? "L" : "M"}${x * width},${y * height}`).join(" "));
  path.setAttribute("stroke", DRAWING_COLORS.find(color => color.value === element.color).css);
  path.setAttribute("stroke-width", element.lineWidth);
}

export function drawingArtwork() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("drawing-artwork");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("preserveAspectRatio", "none");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
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
