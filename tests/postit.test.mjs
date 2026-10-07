import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../frontend/js/store.js";
import { validateJournal, addPage } from "../frontend/js/journal.js";
import { createText, createPostit, insertElement, editElementText, moveElement,
  resizeElement, colorPostit, deleteElement, PAPER, POSTIT_COLORS } from "../frontend/js/elements.js";

const initial = () => ({ schemaVersion: 1, revision: 0, title: "Journal", activePageId: "first",
  pages: [{ id: "first", title: "Página 1", elements: [createText("text-1"),
    { type: "future", data: { value: "conservar" } }] }] });

test("post-it changes preserve texts, unknown elements and other pages", () => {
  const original = addPage(initial(), "second");
  let journal = insertElement(original, "first", createPostit("note-1", 9999, -1));
  assert.deepEqual(journal.pages[0].elements[2], {
    type: "postit", id: "note-1", x: PAPER.width - 240, y: 0,
    width: 240, height: 240, text: "", color: "yellow",
  });
  journal = editElementText(journal, "first", "note-1", "Recordar 🌱\n<texto literal>");
  journal = colorPostit(journal, "first", "note-1", "lilac");
  journal = moveElement(journal, "first", "note-1", -1, 9999);
  journal = resizeElement(journal, "first", "note-1", 9000, -1);
  assert.deepEqual(journal.pages[0].elements[2], {
    type: "postit", id: "note-1", x: 0, y: PAPER.height - 240,
    width: PAPER.width, height: 144, text: "Recordar 🌱\n<texto literal>", color: "lilac",
  });
  assert.deepEqual(journal.pages[0].elements.slice(0, 2), original.pages[0].elements);
  assert.deepEqual(journal.pages[1], original.pages[1]);
  assert.deepEqual(deleteElement(journal, "first", "note-1"), original);
});

test("validates colors, text limits, note geometry and IDs shared with text", () => {
  for (const color of POSTIT_COLORS) validateJournal(insertElement(initial(), "first", createPostit("note-1", 0, 0, color.value)));
  assert.throws(() => createPostit("note-1", 0, 0, "unknown"));
  const journal = insertElement(initial(), "first", createPostit("note-1"));
  assert.throws(() => colorPostit(journal, "first", "note-1", "#ffffff"));
  assert.throws(() => colorPostit(journal, "first", "text-1", "pink"));
  assert.throws(() => editElementText(journal, "first", "note-1", "🌱".repeat(5001)));
  assert.throws(() => moveElement(journal, "first", "note-1", NaN, 24));
  assert.throws(() => insertElement(journal, "first", createPostit("text-1")));
  for (const field of ["color", "text", "x", "width", "height"]) {
    const invalid = structuredClone(journal);
    delete invalid.pages[0].elements[2][field];
    assert.throws(() => validateJournal(invalid));
  }
  const tooSmall = structuredClone(journal);
  tooSmall.pages[0].elements[2].height = 143;
  assert.throws(() => validateJournal(tooSmall));
  const duplicate = structuredClone(journal);
  duplicate.pages[0].elements[2].id = "text-1";
  assert.throws(() => validateJournal(duplicate));
});

test("post-it content, color, geometry and deletion support history and reopening", async () => {
  let saved = initial();
  let latest;
  const storage = { load: async () => structuredClone(saved), save: async journal => {
    assert.equal(journal.revision, saved.revision);
    saved = { ...structuredClone(journal), revision: journal.revision + 1 };
    return saved.revision;
  } };
  const store = createStore(storage, state => { latest = state; });
  await store.load();
  store.update(journal => insertElement(journal, "first", createPostit("note-1")));
  store.update(journal => editElementText(journal, "first", "note-1", "Mi nota"), { deferSave: true });
  store.update(journal => colorPostit(journal, "first", "note-1", "pink"));
  store.update(journal => moveElement(journal, "first", "note-1", 96, 72));
  store.update(journal => resizeElement(journal, "first", "note-1", 288, 264));
  await store.flush();
  const expected = structuredClone(latest.journal.pages[0].elements[2]);
  store.update(journal => deleteElement(journal, "first", "note-1"));
  store.undo();
  await store.flush();
  assert.deepEqual(latest.journal.pages[0].elements[2], expected);
  store.redo();
  await store.flush();
  assert.equal(latest.journal.pages[0].elements.length, 2);
  store.undo(); // Eliminación.
  store.undo(); // Tamaño.
  store.undo(); // Posición.
  store.undo(); // Color.
  await store.flush();
  assert.equal(latest.journal.pages[0].elements[2].color, "yellow");
  assert.equal(latest.journal.pages[0].elements[2].text, "Mi nota");
  for (let index = 0; index < 3; index++) store.redo();
  await store.flush();
  await store.load();
  assert.deepEqual(latest.journal.pages[0].elements[2], expected);
  assert.equal(latest.canUndo, false);
});

test("a failed color save retains the note and retries before allowing undo", async () => {
  let latest;
  let fail = true;
  const saved = insertElement(initial(), "first", createPostit("note-1"));
  const store = createStore({ load: async () => saved, save: async journal => {
    if (fail) throw new Error("Disco no disponible");
    return journal.revision + 1;
  } }, state => { latest = state; });
  await store.load();
  store.update(journal => colorPostit(journal, "first", "note-1", "sage"));
  assert.equal(await store.flush(), false);
  assert.equal(latest.journal.pages[0].elements[2].color, "sage");
  assert.equal(store.undo(), false);
  fail = false;
  await store.retry();
  store.undo();
  await store.flush();
  assert.equal(latest.journal.pages[0].elements[2].color, "yellow");
});
