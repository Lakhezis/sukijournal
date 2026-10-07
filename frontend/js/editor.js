import { createText, createPostit, createStamp, insertElement, editElementText, moveElement, resizeElement, deleteElement,
  colorPostit, createCalendar, changeCalendarPeriod, createWashi, createDrawingFromStrokes, styleDecoration,
  formatElementText, highlightCalendarDay, isEditableElement, resizedGeometry, POSTIT_COLORS, PAPER, TEXT_LIMIT } from "./elements.js";
import { findStamp } from "./stamps.js";
import { MONTHS, validPeriod } from "./calendar.js";
import { createCalendarView } from "./calendar-view.js";
import { createTextView } from "./text-view.js";
import { drawingArtwork, renderDrawing, styleSelect, WASHI_COLORS, WASHI_PATTERNS, DRAWING_COLORS } from "./decorations.js";
import { createDrawingPanel } from "./drawing-panel.js";
import { validHighlightColor } from "./formatting.js";

// Vista del editor: los gestos usan coordenadas de la hoja y producen cambios de estado.
export function createEditor({ paper, workspace, getStore, onPlacement, onFeedback = () => {} }) {
  const entries = new Map();
  let model = null;
  let ready = false;
  let selectedId = null;
  let placing = null;
  let stampValue = "flower";
  let calendarPeriod = null;
  let calendarPrepared = false;
  let gesture = null;
  let textSelection = null;
  let calendarSelection = null;
  let highlightColor = "yellow";
  let drawingPanel = null;
  let washiStyle = { color: "pink", pattern: "stripes" };
  let drawingStyle = { color: "ink", lineWidth: 3 };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function clearFormattingSelection() {
    textSelection = null;
    calendarSelection = null;
  }

  function keepsFormattingSelection(target) {
    // El traslado directo a las herramientas de formato conserva la selección.
    // Cualquier otro destino la abandona, aunque el textarea retenga su rango.
    if (target.closest?.("#tool-underline, #tool-highlight, #highlight-picker")) return true;
    if (textSelection && target === entries.get(textSelection.id)?.input) return true;
    const day = target.closest?.(".calendar-day");
    return Boolean(calendarSelection && day && Number(day.dataset.day) === calendarSelection.day &&
      entries.get(calendarSelection.id)?.node.contains(day));
  }

  for (const type of ["pointerdown", "focusin"]) {
    document.addEventListener(type, event => {
      if (!keepsFormattingSelection(event.target)) clearFormattingSelection();
    }, true);
  }

  function select(id) {
    selectedId = id;
    for (const [key, entry] of entries) entry.node.classList.toggle("is-selected", key === id);
  }

  function setPlacement(value, { preserveSelection = false } = {}) {
    if (drawingPanel && value !== "drawing") closeDrawingPanel();
    placing = ready && ["text", "postit", "stamp", "calendar", "washi", "drawing", "highlight"].includes(value) ? value : null;
    if (placing !== "highlight" && !preserveSelection) clearFormattingSelection();
    if (placing !== "calendar") calendarPrepared = false;
    paper.classList.toggle("is-placing-text", placing === "text");
    paper.classList.toggle("is-placing-postit", placing === "postit");
    paper.classList.toggle("is-placing-stamp", placing === "stamp");
    paper.classList.toggle("is-placing-calendar", placing === "calendar");
    paper.classList.toggle("is-placing-washi", placing === "washi");
    paper.classList.toggle("is-drawing", placing === "drawing");
    for (const entry of entries.values()) entry.calendarView?.setHighlighting(placing === "highlight");
    onPlacement(placing, calendarPrepared);
    if (placing) select(null);
  }

  function position(node, element) {
    for (const [property, value] of Object.entries({ left: element.x, top: element.y,
      width: element.width, height: element.height })) node.style[property] = `${value}px`;
  }

  function commitText(id) {
    const entry = entries.get(id);
    if (!ready || !entry?.input || !model?.elements.some(item => isEditableElement(item) && item.id === id)) return;
    getStore().update(journal => editElementText(journal, model.id, id, entry.input.value, entry.beforeEdit),
      { group: `text:${model.id}:${id}`, deferSave: true });
    entry.beforeEdit = null;
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
    (event.currentTarget === entry.node ? entry.move : event.currentTarget).focus({ preventScroll: true });
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
    gesture.preview = gesture.kind === "move"
      ? { ...original, x: clamp(original.x + dx, 0, PAPER.width - original.width),
        y: clamp(original.y + dy, 0, PAPER.height - original.height) }
      : resizedGeometry(original, original.width + dx, original.height + dy);
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
    const stamp = element.type === "stamp";
    const calendar = element.type === "calendar";
    const washi = element.type === "washi";
    const drawing = element.type === "drawing";
    const label = washi ? "washi tape" : drawing ? "dibujo" : calendar ? "calendario" : stamp ? "sellito" : postit ? "post-it" : "texto";
    const node = document.createElement("div");
    node.className = postit ? "text-element postit-element" : "text-element";
    if (stamp) node.classList.add("stamp-element");
    if (calendar) node.classList.add("calendar-element");
    if (washi) node.classList.add("washi-element");
    if (drawing) node.classList.add("drawing-element");
    node.dataset.elementId = element.id;
    node.setAttribute("role", "group");
    node.setAttribute("aria-label", stamp ? `Sellito: ${findStamp(element.stamp).label}` : postit ? "Post-it" : "Bloque de texto");
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
    let input = null;
    let artwork = null;
    let calendarView = null;
    let decoration = null;
    let textView = null;
    if (stamp) {
      artwork = document.createElement("img");
      artwork.className = "stamp-artwork";
      artwork.src = findStamp(element.stamp).src;
      artwork.alt = "";
      artwork.draggable = false;
    } else if (calendar) {
      calendarView = createCalendarView((year, month) => {
        if (ready) getStore().update(journal => changeCalendarPeriod(journal, model.id, element.id, year, month));
      }, day => {
        const current = model.elements.find(item => item.id === element.id);
        calendarSelection = { pageId: model.id, id: element.id, year: current.year, month: current.month, day };
        textSelection = null;
        select(element.id);
        if (placing === "highlight") formatSelection("highlight");
      });
    } else if (drawing) {
      decoration = drawingArtwork();
    } else if (washi) {
      decoration = document.createElement("div");
      decoration.className = "washi-artwork";
      decoration.setAttribute("aria-hidden", "true");
    } else {
      input = document.createElement("textarea");
      input.className = "text-input";
      input.setAttribute("aria-label", `Contenido del ${label}`);
      input.placeholder = postit ? "Algo para recordar…" : "Escribí tus ideas…";
      input.maxLength = TEXT_LIMIT;
      input.spellcheck = true;
      textView = createTextView(input);
    }
    const resize = document.createElement("button");
    resize.type = "button";
    resize.className = "text-resize";
    resize.textContent = "◢";
    resize.setAttribute("aria-label", `Cambiar tamaño del ${label}; arrastrá o usá las flechas`);
    resize.title = "Arrastrá para cambiar el tamaño. Flechas: 1 px; Shift + flechas: 24 px.";
    controls.append(move, removeButton);
    node.append(controls, input || artwork || decoration || calendarView.node, resize);
    if (textView) node.insertBefore(textView.node, input);
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
    let decorationColor = null, pattern = null, lineWidth = null;
    if (washi || drawing) {
      const styles = document.createElement("div");
      styles.className = "decoration-style";
      const updateStyle = changes => { if (ready) getStore().update(journal => styleDecoration(journal, model.id, element.id, changes)); };
      decorationColor = styleSelect(washi ? WASHI_COLORS : DRAWING_COLORS, `Color del ${label}`, color => updateStyle({ color }));
      styles.append(decorationColor);
      if (washi) {
        pattern = styleSelect(WASHI_PATTERNS, "Diseño del washi tape", pattern => updateStyle({ pattern }));
        styles.append(pattern);
      } else {
        lineWidth = styleSelect([1, 3, 6, 12].map(value => ({ value, label: `${value} px` })), "Grosor del dibujo", value => updateStyle({ lineWidth: Number(value) }));
        styles.append(lineWidth);
      }
      node.insertBefore(styles, resize);
    }
    const entry = { node, input, textView, artwork, calendarView, decoration, decorationColor, pattern, lineWidth,
      move, removeButton, resize, color, type: element.type, composing: false, beforeEdit: null };
    node.addEventListener("focusin", () => select(element.id));
    node.addEventListener("focusout", () => {
      // Esperar el traslado del foco evita ocultar el selector durante Shift+Tab en WebKit.
      setTimeout(() => {
        if (selectedId === element.id && !node.contains(document.activeElement)) select(null);
      }, 0);
    });
    node.addEventListener("pointerdown", event => {
      select(element.id);
      if (placing !== "highlight" || !event.target.closest(".calendar-day, .text-input")) setPlacement(false);
      if (stamp && event.target === node) move.focus({ preventScroll: true });
    });
    if (input) {
      const rememberSelection = () => {
        // Los eventos select pueden llegar después del blur. No deben revivir
        // una selección abandonada al hacer clic en otro lugar.
        if (document.activeElement !== input || entries.get(element.id)?.input !== input) return;
        calendarSelection = null;
        textSelection = { pageId: model.id, id: element.id, start: input.selectionStart, end: input.selectionEnd };
      };
      for (const type of ["select", "keyup", "pointerup", "focus"]) input.addEventListener(type, rememberSelection);
      input.addEventListener("beforeinput", event => {
        let start = input.selectionStart, end = input.selectionEnd;
        if (start === end && event.inputType === "deleteContentBackward") {
          start = Math.max(0, start - (/[\uDC00-\uDFFF]/.test(input.value[start - 1] || "") ? 2 : 1));
        } else if (start === end && event.inputType === "deleteContentForward") {
          end = Math.min(input.value.length, end + (/[\uD800-\uDBFF]/.test(input.value[end] || "") ? 2 : 1));
        }
        entry.beforeEdit = { start, end };
      });
      input.addEventListener("input", () => commitText(element.id));
      input.addEventListener("compositionstart", () => { entry.composing = true; });
      input.addEventListener("compositionend", () => { entry.composing = false; commitText(element.id); });
      input.addEventListener("blur", () => { commitText(element.id); getStore().endGroup(); });
    }
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
    if (drawing) {
      node.addEventListener("pointerdown", event => {
        if (event.target === node) beginGesture(event, element.id, "move", entry);
      });
      node.addEventListener("pointermove", previewGesture);
      node.addEventListener("pointerup", event => {
        if (gesture?.pointerId === event.pointerId) { previewGesture(event); endGesture(true); }
      });
      node.addEventListener("pointercancel", () => endGesture(false));
      node.addEventListener("lostpointercapture", () => endGesture(false));
    }
    return entry;
  }

  function render(nextPage, editable) {
    ready = editable;
    if (!ready) { endGesture(false); closeDrawingPanel(); setPlacement(false); }
    if (model?.id !== nextPage?.id) {
      endGesture(false);
      closeDrawingPanel();
      model = nextPage;
      const focused = paper.contains(document.activeElement);
      for (const entry of entries.values()) entry.textView?.destroy();
      entries.clear();
      clearFormattingSelection();
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
      if (entry.input) {
        if (!entry.composing && entry.input.value !== element.text) entry.input.value = element.text;
        entry.input.readOnly = !ready;
        entry.textView.render(element);
      }
      if (entry.artwork) {
        const stamp = findStamp(element.stamp);
        if (entry.artwork.getAttribute("src") !== stamp.src) entry.artwork.src = stamp.src;
        entry.node.setAttribute("aria-label", `Sellito: ${stamp.label}`);
      }
      if (entry.calendarView) {
        entry.calendarView.render(element, ready);
        entry.calendarView.setHighlighting(placing === "highlight");
        entry.node.setAttribute("aria-label", `Calendario: ${MONTHS[element.month - 1]} ${element.year}`);
      }
      if (entry.decoration) {
        entry.node.setAttribute("aria-label", element.type === "washi" ? "Washi tape" : "Dibujo a mano alzada");
        if (element.type === "drawing") renderDrawing(entry.decoration, element);
        entry.node.dataset.color = element.color;
        if (entry.pattern) { entry.pattern.value = element.pattern; entry.pattern.disabled = !ready; entry.node.dataset.pattern = element.pattern; }
        if (entry.lineWidth) { entry.lineWidth.value = element.lineWidth; entry.lineWidth.disabled = !ready; }
        entry.decorationColor.value = element.color;
        entry.decorationColor.disabled = !ready;
      }
      for (const button of [entry.move, entry.removeButton, entry.resize]) button.disabled = !ready;
      if (entry.color) {
        entry.color.value = element.color;
        entry.color.disabled = !ready;
        entry.node.dataset.color = element.color;
      }
    }
    for (const id of remaining) { entries.get(id).textView?.destroy(); entries.get(id).node.remove(); entries.delete(id); }
    if (selectedId && !entries.has(selectedId)) select(null);
    if (textSelection && !entries.get(textSelection.id)?.input) textSelection = null;
    if (calendarSelection) {
      const current = model?.elements.find(element => element.id === calendarSelection.id);
      if (current?.type !== "calendar" || current.year !== calendarSelection.year || current.month !== calendarSelection.month) calendarSelection = null;
    }
  }

  function addAt(x, y) {
    if (!ready || !model) return;
    if (placing === "highlight") return;
    if (placing === "drawing") { openDrawingPanel(x, y); return; }
    if (placing === "calendar" && !calendarPrepared) return;
    const id = crypto.randomUUID();
    const element = placing === "washi" ? createWashi(id, x, y, washiStyle.color, washiStyle.pattern)
      : placing === "calendar" ? createCalendar(id, calendarPeriod.year, calendarPeriod.month, x, y)
      : placing === "stamp" ? createStamp(id, stampValue, x, y)
      : placing === "postit" ? createPostit(id, x, y) : createText(id, x, y);
    if (getStore().update(journal => insertElement(journal, model.id, element))) {
      setPlacement(false);
      select(element.id);
      const entry = entries.get(element.id);
      (entry.input || entry.move).focus({ preventScroll: true });
    }
  }

  paper.addEventListener("click", event => {
    if (event.target !== paper || !ready) return;
    clearFormattingSelection();
    select(null);
    if (!placing) return;
    const rect = paper.getBoundingClientRect();
    addAt(event.clientX - rect.left - paper.clientLeft, event.clientY - rect.top - paper.clientTop);
  });
  paper.addEventListener("keydown", event => {
    if (!ready || event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      endGesture(false);
      closeDrawingPanel();
      setPlacement(false);
      select(null);
      paper.focus({ preventScroll: true });
    } else if (event.key === "Enter" && placing && event.target === paper) {
      event.preventDefault();
      const rect = paper.getBoundingClientRect();
      const visible = workspace.getBoundingClientRect();
      addAt(Math.max(24, visible.left + 24 - rect.left - paper.clientLeft),
        Math.max(24, visible.top + 24 - rect.top - paper.clientTop));
    } else if (event.key === "Delete" && selectedId && event.target.tagName === "BUTTON" && !event.target.closest(".calendar-day")) {
      event.preventDefault();
      remove(selectedId);
    }
  });

  function closeDrawingPanel() {
    const panel = drawingPanel;
    drawingPanel = null;
    panel?.destroy();
  }
  function openDrawingPanel(x, y) {
    if (drawingPanel) { drawingPanel.canvas.focus({ preventScroll: true }); return; }
    const pageId = model.id;
    const cancel = () => { setPlacement(null); paper.focus({ preventScroll: true }); };
    drawingPanel = createDrawingPanel({ getStyle: () => drawingStyle, onCancel: cancel, onFeedback,
      onConfirm(strokes, canvasRect) {
        if (!ready || model?.id !== pageId) return;
        const rect = paper.getBoundingClientRect();
        const originX = canvasRect.left - rect.left - paper.clientLeft;
        const originY = canvasRect.top - rect.top - paper.clientTop;
        const element = createDrawingFromStrokes(crypto.randomUUID(), strokes.map(stroke => ({
          ...stroke, points: stroke.points.map(([px, py]) => [originX + px * canvasRect.width, originY + py * canvasRect.height]),
        })));
        // El panel entero produce una única acción de historial y autoguardado.
        closeDrawingPanel();
        getStore().endGroup();
        if (getStore().update(journal => insertElement(journal, pageId, element))) {
          setPlacement(null);
          select(element.id);
          entries.get(element.id).move.focus({ preventScroll: true });
          onFeedback("Dibujo confirmado. Podés arrastrarlo o usar Mover.");
        }
      },
    });
    drawingPanel.node.style.left = `${clamp(x, 0, PAPER.width - 360)}px`;
    drawingPanel.node.style.top = `${clamp(y, 0, PAPER.height - 300)}px`;
    paper.append(drawingPanel.node);
    drawingPanel.node.scrollIntoView({ block: "nearest", inline: "nearest" });
    drawingPanel.canvas.focus({ preventScroll: true });
  }

  function formatSelection(kind, toggle = true, feedback = true) {
      const range = textSelection;
      // Cambiar de herramienta siempre cierra los paneles anteriores, incluso
      // cuando todavía no se haya seleccionado texto ni un día.
      setPlacement(kind === "highlight" ? "highlight" : null, { preserveSelection: true });
      if (kind === "highlight" && ready && calendarSelection?.pageId === model?.id) {
        const day = calendarSelection, current = model.elements.find(item => item.id === day.id);
        if (current?.type === "calendar" && current.year === day.year && current.month === day.month) {
          return getStore().update(journal => highlightCalendarDay(journal, model.id, day.id, day.day, highlightColor, toggle));
        }
      }
      if (!ready || range?.pageId !== model?.id || range.start === range.end || !entries.get(range.id)?.input) {
        if (feedback) onFeedback(kind === "highlight" ? "Seleccioná una frase o hacé clic en los días de un calendario para remarcarlos." : "Seleccioná una palabra o frase en un texto o post-it para subrayarla.");
        return false;
      }
      const input = entries.get(range.id).input;
      const changed = getStore().update(journal => formatElementText(journal, model.id, range.id, kind, range.start, range.end, highlightColor, toggle));
      if (changed) {
        select(range.id);
        input.focus({ preventScroll: true });
        input.setSelectionRange(range.start, range.end);
        textSelection = range;
        onFeedback(kind === "underline" ? "Subrayado actualizado." : "Remarcado actualizado.");
      }
      return changed;
  }

  return { render, setPlacement, formatSelection,
    drawingHistory(action) {
      if (!drawingPanel) return false;
      drawingPanel[action]();
      return true;
    },
    setHighlightColor(color) {
      if (!validHighlightColor(color)) return;
      highlightColor = color;
      if (placing === "highlight") formatSelection("highlight", false, false);
    },
    setDrawingStyle(color, lineWidth) {
      if (DRAWING_COLORS.some(choice => choice.value === color) && Number.isFinite(lineWidth) && lineWidth >= 1 && lineWidth <= 12) drawingStyle = { color, lineWidth };
    },
    setWashiStyle(color, pattern) {
      if (WASHI_COLORS.some(choice => choice.value === color) && WASHI_PATTERNS.some(choice => choice.value === pattern)) washiStyle = { color, pattern };
    },
    chooseCalendar(year, month) {
      if (!ready || !validPeriod(year, month)) return false;
      calendarPeriod = { year, month };
      calendarPrepared = true;
      setPlacement("calendar");
      paper.focus({ preventScroll: true });
      return true;
    },
    chooseStamp(value) {
      if (!ready || !findStamp(value)) return false;
      stampValue = value;
      setPlacement("stamp");
      paper.focus({ preventScroll: true });
      return true;
    },
    togglePlacement(type = "text") {
      if (type === "calendar") calendarPrepared = false;
      setPlacement(placing === type ? null : type);
      if (placing) paper.focus({ preventScroll: true });
    },
    finish() {
      endGesture(true);
      drawingPanel?.finish();
      for (const [id, entry] of entries) { commitText(id); entry.calendarView?.finish(); }
      getStore().endGroup();
    },
  };
}
