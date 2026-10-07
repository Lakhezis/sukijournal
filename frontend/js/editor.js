import { createText, createPostit, insertElement, editElementText, moveElement, resizeElement, deleteElement,
  colorPostit, isEditableElement, minimumSize, POSTIT_COLORS, PAPER, TEXT_LIMIT } from "./elements.js";

// Vista del editor: los gestos usan coordenadas de la hoja y producen cambios de estado.
export function createEditor({ paper, workspace, getStore, onPlacement }) {
  const entries = new Map();
  let model = null;
  let ready = false;
  let selectedId = null;
  let placing = null;
  let gesture = null;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function select(id) {
    selectedId = id;
    for (const [key, entry] of entries) entry.node.classList.toggle("is-selected", key === id);
  }

  function setPlacement(value) {
    placing = ready && (value === "text" || value === "postit") ? value : null;
    paper.classList.toggle("is-placing-text", placing === "text");
    paper.classList.toggle("is-placing-postit", placing === "postit");
    onPlacement(placing);
    if (placing) select(null);
  }

  function position(node, element) {
    for (const [property, value] of Object.entries({ left: element.x, top: element.y,
      width: element.width, height: element.height })) node.style[property] = `${value}px`;
  }

  function commitText(id) {
    const entry = entries.get(id);
    if (!ready || !entry || !model?.elements.some(item => isEditableElement(item) && item.id === id)) return;
    getStore().update(journal => editElementText(journal, model.id, id, entry.input.value),
      { group: `text:${model.id}:${id}`, deferSave: true });
  }

  function endGesture(commit) {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    current.entry.node.classList.remove("is-dragging");
    if (current.handle.hasPointerCapture(current.pointerId)) {
      current.handle.releasePointerCapture(current.pointerId);
    }
    if (commit && ready && model?.id === current.pageId) {
      getStore().update(journal => current.kind === "move"
        ? moveElement(journal, current.pageId, current.id, current.preview.x, current.preview.y)
        : resizeElement(journal, current.pageId, current.id, current.preview.width, current.preview.height));
    } else {
      const original = model?.elements.find(item => isEditableElement(item) && item.id === current.id);
      if (original) position(current.entry.node, original);
    }
  }

  function beginGesture(event, id, kind, entry) {
    if (!ready || event.button !== 0 || !model) return;
    const element = model.elements.find(item => isEditableElement(item) && item.id === id);
    if (!element) return;
    event.preventDefault();
    endGesture(false);
    select(id);
    setPlacement(false);
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture = { id, pageId: model.id, kind, entry, handle: event.currentTarget,
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      scrollX: workspace.scrollLeft, scrollY: workspace.scrollTop,
      original: { ...element }, preview: { ...element } };
    entry.node.classList.add("is-dragging");
    getStore().endGroup();
  }

  function previewGesture(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX + workspace.scrollLeft - gesture.scrollX;
    const dy = event.clientY - gesture.startY + workspace.scrollTop - gesture.scrollY;
    const original = gesture.original;
    const minimum = minimumSize(original);
    gesture.preview = gesture.kind === "move"
      ? { ...original, x: clamp(original.x + dx, 0, PAPER.width - original.width),
        y: clamp(original.y + dy, 0, PAPER.height - original.height) }
      : { ...original, width: clamp(original.width + dx, minimum.width, PAPER.width - original.x),
        height: clamp(original.height + dy, minimum.height, PAPER.height - original.y) };
    position(gesture.entry.node, gesture.preview);
  }

  function adjustWithKeyboard(event, id, kind) {
    if (!ready || event.isComposing) return;
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!directions[event.key] || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const element = model.elements.find(item => isEditableElement(item) && item.id === id);
    const [dx, dy] = directions[event.key].map(value => value * (event.shiftKey ? 24 : 1));
    getStore().update(journal => kind === "move"
      ? moveElement(journal, model.id, id, element.x + dx, element.y + dy)
      : resizeElement(journal, model.id, id, element.width + dx, element.height + dy),
    { group: `${kind}:${model.id}:${id}` });
  }

  function remove(id) {
    if (!ready || !model) return;
    endGesture(false);
    const focusInNote = entries.get(id)?.node.contains(document.activeElement);
    getStore().update(journal => deleteElement(journal, model.id, id));
    if (focusInNote) paper.focus({ preventScroll: true });
  }

  function newEntry(element) {
    const postit = element.type === "postit";
    const label = postit ? "post-it" : "texto";
    const node = document.createElement("div");
    node.className = postit ? "text-element postit-element" : "text-element";
    node.dataset.elementId = element.id;
    node.setAttribute("role", "group");
    node.setAttribute("aria-label", postit ? "Post-it" : "Bloque de texto");
    const controls = document.createElement("div");
    controls.className = "text-controls";
    const move = document.createElement("button");
    move.type = "button";
    move.className = "text-move";
    move.textContent = "⠿ Mover";
    move.setAttribute("aria-label", `Mover ${label}; arrastrá o usá las flechas`);
    move.title = "Arrastrá para mover. Flechas: 1 px; Shift + flechas: 24 px.";
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "text-remove";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Eliminar ${label}`);
    removeButton.title = `Eliminar ${label}`;
    const input = document.createElement("textarea");
    input.className = "text-input";
    input.setAttribute("aria-label", `Contenido del ${label}`);
    input.placeholder = postit ? "Algo para recordar…" : "Escribí tus ideas…";
    input.maxLength = TEXT_LIMIT;
    input.spellcheck = true;
    const resize = document.createElement("button");
    resize.type = "button";
    resize.className = "text-resize";
    resize.textContent = "◢";
    resize.setAttribute("aria-label", `Cambiar tamaño del ${label}; arrastrá o usá las flechas`);
    resize.title = "Arrastrá para cambiar el tamaño. Flechas: 1 px; Shift + flechas: 24 px.";
    controls.append(move, removeButton);
    node.append(controls, input, resize);
    let color = null;
    if (postit) {
      color = document.createElement("select");
      color.className = "postit-color";
      color.setAttribute("aria-label", "Color del post-it");
      for (const choice of POSTIT_COLORS) {
        const option = document.createElement("option");
        option.value = choice.value;
        option.textContent = choice.label;
        color.append(option);
      }
      color.addEventListener("change", () => {
        if (!ready) return;
        const selectedColor = color.value;
        commitText(element.id);
        getStore().update(journal => colorPostit(journal, model.id, element.id, selectedColor));
      });
      // El orden de Tab permite escribir, elegir color y después cambiar tamaño.
      node.insertBefore(color, resize);
    }
    const entry = { node, input, move, removeButton, resize, color, type: element.type, composing: false };
    node.addEventListener("focusin", () => select(element.id));
    node.addEventListener("focusout", event => {
      if (selectedId === element.id && !node.contains(event.relatedTarget)) select(null);
    });
    node.addEventListener("pointerdown", () => { select(element.id); setPlacement(false); });
    input.addEventListener("input", () => commitText(element.id));
    input.addEventListener("compositionstart", () => { entry.composing = true; });
    input.addEventListener("compositionend", () => { entry.composing = false; commitText(element.id); });
    input.addEventListener("blur", () => { commitText(element.id); getStore().endGroup(); });
    removeButton.addEventListener("click", () => remove(element.id));
    for (const [handle, kind] of [[move, "move"], [resize, "resize"]]) {
      handle.addEventListener("pointerdown", event => beginGesture(event, element.id, kind, entry));
      handle.addEventListener("pointermove", previewGesture);
      handle.addEventListener("pointerup", event => {
        if (gesture?.pointerId === event.pointerId) { previewGesture(event); endGesture(true); }
      });
      handle.addEventListener("pointercancel", () => endGesture(false));
      handle.addEventListener("lostpointercapture", () => endGesture(false));
      handle.addEventListener("keydown", event => adjustWithKeyboard(event, element.id, kind));
    }
    return entry;
  }

  function render(nextPage, editable) {
    ready = editable;
    if (!ready) { endGesture(false); setPlacement(false); }
    if (model?.id !== nextPage?.id) {
      endGesture(false);
      model = nextPage;
      const focused = paper.contains(document.activeElement);
      entries.clear();
      paper.replaceChildren();
      selectedId = null;
      setPlacement(false);
      if (focused) paper.focus({ preventScroll: true });
    }
    model = nextPage;
    const remaining = new Set(entries.keys());
    for (const element of model?.elements || []) {
      if (!isEditableElement(element)) continue;
      let entry = entries.get(element.id);
      if (entry && entry.type !== element.type) { entry.node.remove(); entry = null; }
      if (!entry) {
        entry = newEntry(element);
        entries.set(element.id, entry);
        paper.append(entry.node);
      }
      remaining.delete(element.id);
      if (gesture?.id !== element.id) position(entry.node, element);
      // Evita reemplazar el campo mientras se escribe o se compone texto con un IME.
      if (!entry.composing && entry.input.value !== element.text) entry.input.value = element.text;
      entry.input.readOnly = !ready;
      for (const button of [entry.move, entry.removeButton, entry.resize]) button.disabled = !ready;
      if (entry.color) {
        entry.color.value = element.color;
        entry.color.disabled = !ready;
        entry.node.dataset.color = element.color;
      }
    }
    for (const id of remaining) { entries.get(id).node.remove(); entries.delete(id); }
    if (selectedId && !entries.has(selectedId)) select(null);
  }

  function addAt(x, y) {
    if (!ready || !model) return;
    const element = placing === "postit" ? createPostit(crypto.randomUUID(), x, y) : createText(crypto.randomUUID(), x, y);
    if (getStore().update(journal => insertElement(journal, model.id, element))) {
      setPlacement(false);
      select(element.id);
      entries.get(element.id).input.focus({ preventScroll: true });
    }
  }

  paper.addEventListener("click", event => {
    if (event.target !== paper || !ready) return;
    if (!placing) { select(null); return; }
    const rect = paper.getBoundingClientRect();
    addAt(event.clientX - rect.left - paper.clientLeft, event.clientY - rect.top - paper.clientTop);
  });
  paper.addEventListener("keydown", event => {
    if (!ready || event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      endGesture(false);
      setPlacement(false);
      select(null);
      paper.focus({ preventScroll: true });
    } else if (event.key === "Enter" && placing && event.target === paper) {
      event.preventDefault();
      const rect = paper.getBoundingClientRect();
      const visible = workspace.getBoundingClientRect();
      addAt(Math.max(24, visible.left + 24 - rect.left - paper.clientLeft),
        Math.max(24, visible.top + 24 - rect.top - paper.clientTop));
    } else if (event.key === "Delete" && selectedId && event.target.tagName === "BUTTON") {
      event.preventDefault();
      remove(selectedId);
    }
  });

  return { render, setPlacement,
    togglePlacement(type = "text") { setPlacement(placing === type ? null : type); if (placing) paper.focus({ preventScroll: true }); },
    finish() { endGesture(true); for (const id of entries.keys()) commitText(id); getStore().endGroup(); },
  };
}
