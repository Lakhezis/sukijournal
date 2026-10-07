import { CREATIVE_COLORS } from "./colors.js";

export const FORMAT_KINDS = Object.freeze(["underline", "highlight"]);
export const MARK_LIMIT = 2000;
export const HIGHLIGHT_COLORS = CREATIVE_COLORS;
export const validHighlightColor = color => HIGHLIGHT_COLORS.some(choice => choice.value === color);
const markColor = mark => mark.color ?? "yellow";

export function validateMarks(text, marks = []) {
  if (!Array.isArray(marks) || marks.length > MARK_LIMIT || marks.some(mark =>
    !mark || !FORMAT_KINDS.includes(mark.kind) || !Number.isInteger(mark.start) ||
    !Number.isInteger(mark.end) || mark.start < 0 || mark.end <= mark.start || mark.end > text.length ||
    (mark.color !== undefined && (mark.kind !== "highlight" || !validHighlightColor(mark.color))))) {
    throw new Error("El formato del texto no es válido.");
  }
}

function merge(marks) {
  const result = [];
  for (const kind of FORMAT_KINDS) {
    let ranges = [];
    for (const mark of marks.filter(mark => mark.kind === kind)) {
      ranges = ranges.flatMap(previous => subtract(previous, mark.start, mark.end));
      ranges.push({ ...mark });
    }
    for (const mark of ranges.sort((a, b) => a.start - b.start)) {
      const last = result.at(-1);
      if (last?.kind === kind && markColor(last) === markColor(mark) && mark.start <= last.end) last.end = Math.max(last.end, mark.end);
      else result.push({ ...mark });
    }
  }
  return result;
}

function subtract(mark, start, end) {
  if (mark.end <= start || mark.start >= end) return [mark];
  return [mark.start < start ? { ...mark, end: start } : null,
    mark.end > end ? { ...mark, start: end } : null].filter(Boolean);
}

export function toggleMarks(text, marks, kind, start, end, color = "yellow", toggle = true) {
  validateMarks(text, marks);
  if (kind === "highlight" && !validHighlightColor(color)) throw new Error("Elegí un color de remarcado válido.");
  const next = { kind, start, end, ...(kind === "highlight" && color !== "yellow" ? { color } : {}) };
  validateMarks(text, [next]);
  const normalized = merge(marks);
  const covered = normalized.some(mark => mark.kind === kind && (kind !== "highlight" || markColor(mark) === color) && mark.start <= start && mark.end >= end);
  const remaining = normalized.flatMap(mark => mark.kind === kind ? subtract(mark, start, end) : [mark]);
  return merge(toggle && covered ? remaining : [...remaining, next]);
}

export function rebaseMarks(before, after, marks = [], edit = null) {
  if (before === after) return marks;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let suffix = 0;
  while (suffix < before.length - start && suffix < after.length - start &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
  let end = before.length - suffix;
  // beforeinput precisa la ubicación cuando hay letras repetidas o un reemplazo.
  if (edit && Number.isInteger(edit.start) && Number.isInteger(edit.end) && edit.start >= 0 && edit.end <= before.length) {
    const inserted = after.length - before.length + edit.end - edit.start;
    if (inserted >= 0 && before.slice(0, edit.start) === after.slice(0, edit.start) &&
      before.slice(edit.end) === after.slice(edit.start + inserted)) { start = edit.start; end = edit.end; }
  }
  const added = after.length - before.length + end - start;
  const delta = after.length - before.length;
  return merge(marks.flatMap(mark => {
    if (mark.end <= start) return [{ ...mark }];
    if (mark.start >= end) return [{ ...mark, start: mark.start + delta, end: mark.end + delta }];
    const next = { ...mark, start: Math.min(mark.start, start),
      end: mark.end > end ? mark.end + delta : start + added };
    return next.end > next.start ? [next] : [];
  }));
}

export function formattedSegments(text, marks = []) {
  marks = merge(marks);
  const boundaries = [...new Set([0, text.length, ...marks.flatMap(mark => [mark.start, mark.end])])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => ({ text: text.slice(start, boundaries[index + 1]),
    underline: marks.some(mark => mark.kind === "underline" && mark.start <= start && mark.end >= boundaries[index + 1]),
    highlight: marks.some(mark => mark.kind === "highlight" && mark.start <= start && mark.end >= boundaries[index + 1]),
    highlightColor: marks.find(mark => mark.kind === "highlight" && mark.start <= start && mark.end >= boundaries[index + 1])?.color ?? "yellow" }));
}
