import { DRAWING_COLORS, POINT_LIMIT, DRAWING_POINT_LIMIT, drawingPath } from "./decorations.js";

export function createDrawingPanel({ getStyle, onConfirm, onCancel, onFeedback }) {
  const node = document.createElement("section");
  node.className = "drawing-panel";
  node.setAttribute("aria-label", "Dibujo en edición");
  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = "Tu dibujo";
  const count = document.createElement("span");
  count.className = "drawing-stroke-count";
  count.setAttribute("role", "status");
  header.append(title, count);
  const canvas = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.classList.add("drawing-pad");
  canvas.setAttribute("viewBox", "0 0 320 220");
  canvas.setAttribute("preserveAspectRatio", "none");
  canvas.setAttribute("tabindex", "0");
  canvas.setAttribute("aria-label", "Área de dibujo; arrastrá para hacer trazos. Ctrl+Enter confirma y Escape cancela.");
  const actions = document.createElement("footer");
  function button(label, text, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = text;
    actions.append(button);
    return button;
  }
  const undoButton = button("Deshacer trazo", "↶", "drawing-undo");
  const redoButton = button("Rehacer trazo", "↷", "drawing-redo");
  const cancel = button("Cancelar dibujo", "× Cancelar", "drawing-cancel");
  const confirm = button("Confirmar dibujo", "✓ Listo", "drawing-confirm");
  node.append(header, canvas, actions);
  let strokes = [], undone = [], gesture = null;
  const clamp = value => Math.max(0, Math.min(1, value));
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return [clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height)];
  }
  function paint(path, stroke) {
    const points = stroke.points.length === 1 ? [stroke.points[0], stroke.points[0]] : stroke.points;
    path.setAttribute("d", points.map(([x, y], index) => `${index ? "L" : "M"}${x * 320},${y * 220}`).join(" "));
    path.setAttribute("stroke", DRAWING_COLORS.find(color => color.value === stroke.color).css);
    path.setAttribute("stroke-width", stroke.lineWidth);
  }
  function update() {
    count.textContent = `${strokes.length} ${strokes.length === 1 ? "trazo" : "trazos"}`;
    confirm.disabled = strokes.length === 0 || Boolean(gesture);
    undoButton.disabled = strokes.length === 0 || Boolean(gesture);
    redoButton.disabled = undone.length === 0 || Boolean(gesture);
  }
  function finish(commit = true) {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    if (canvas.hasPointerCapture(current.pointerId)) canvas.releasePointerCapture(current.pointerId);
    if (commit) {
      if (current.stroke.points.length === 1) current.stroke.points.push([...current.stroke.points[0]]);
      strokes.push(current.stroke);
      undone = [];
    } else current.path.remove();
    update();
  }
  function sample(event) {
    if (gesture?.pointerId !== event.pointerId) return;
    const next = point(event), last = gesture.stroke.points.at(-1);
    if (Math.hypot((next[0] - last[0]) * 320, (next[1] - last[1]) * 220) < 1) return;
    const total = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) + gesture.stroke.points.length;
    if (gesture.stroke.points.length >= POINT_LIMIT || total >= DRAWING_POINT_LIMIT) return;
    gesture.stroke.points.push(next);
    paint(gesture.path, gesture.stroke);
  }
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0 || gesture) return;
    const total = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
    if (total + 2 > DRAWING_POINT_LIMIT) {
      onFeedback("El dibujo alcanzó su límite de puntos. Podés deshacer un trazo o confirmarlo.");
      return;
    }
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const stroke = { ...getStyle(), points: [point(event)] };
    const path = drawingPath();
    paint(path, stroke);
    canvas.append(path);
    gesture = { pointerId: event.pointerId, stroke, path };
    canvas.setPointerCapture(event.pointerId);
    update();
  });
  canvas.addEventListener("pointermove", sample);
  canvas.addEventListener("pointerup", event => {
    if (gesture?.pointerId === event.pointerId) { sample(event); finish(); }
  });
  for (const type of ["pointercancel", "lostpointercapture"]) canvas.addEventListener(type, () => finish(false));
  function undo() {
    finish(false);
    if (strokes.length) { undone.push(strokes.pop()); canvas.lastElementChild.remove(); }
    update();
  }
  function redo() {
    finish(false);
    if (undone.length) {
      const stroke = undone.pop(), path = drawingPath();
      strokes.push(stroke);
      paint(path, stroke);
      canvas.append(path);
    }
    update();
  }
  function accept() {
    finish();
    if (strokes.length) onConfirm(structuredClone(strokes), canvas.getBoundingClientRect());
  }
  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);
  cancel.addEventListener("click", onCancel);
  confirm.addEventListener("click", accept);
  node.addEventListener("keydown", event => {
    const modifier = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (event.isComposing || event.altKey) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
    else if (modifier && event.key === "Enter") { event.preventDefault(); event.stopPropagation(); accept(); }
    else if (modifier && ["z", "y"].includes(key)) {
      event.preventDefault(); event.stopPropagation();
      if (key === "y" || event.shiftKey) redo(); else undo();
    }
  });
  update();
  return { node, canvas, finish, undo, redo, destroy() { finish(false); node.remove(); } };
}
