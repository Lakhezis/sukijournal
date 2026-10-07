import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../frontend/js/store.js";
import { addPage, validateJournal } from "../frontend/js/journal.js";
import { createText, createPostit, createStamp, insertElement, editElementText,
  moveElement, resizeElement, deleteElement, PAPER } from "../frontend/js/elements.js";
import { STAMPS } from "../frontend/js/stamps.js";

const initial = () => ({ schemaVersion: 1, revision: 0, title: "Journal", activePageId: "first",
  pages: [{ id: "first", title: "Página 1", elements: [createText("text-1"), createPostit("note-1"),
    { type: "future", data: { keep: true } }] }] });

test("catalog stamps preserve text, notes, unknown elements and other pages", () => {
  const original = addPage(initial(), "second");
  for (const stamp of STAMPS) {
    let journal = insertElement(original, "first", createStamp("stamp-1", stamp.value, 9000, -1));
    const element = journal.pages[0].elements[3];
    assert.deepEqual(element, { type: "stamp", id: "stamp-1", stamp: stamp.value,
      x: PAPER.width - 160, y: 0, width: 160, height: 160 });
    journal = moveElement(journal, "first", "stamp-1", 0, 9000);
    assert.equal(journal.pages[0].elements[3].y, PAPER.height - 160);
    assert.deepEqual(journal.pages[0].elements.slice(0, 3), original.pages[0].elements);
    assert.deepEqual(journal.pages[1], original.pages[1]);
    assert.deepEqual(deleteElement(journal, "first", "stamp-1"), original);
  }
});

test("scaling preserves square proportions when growing, shrinking and reaching paper bounds", () => {
  let journal = insertElement(initial(), "first", createStamp("stamp-1", "star", 600, 800));
  journal = resizeElement(journal, "first", "stamp-1", 184, 160); // Flecha derecha.
  assert.deepEqual([journal.pages[0].elements[3].width, journal.pages[0].elements[3].height], [184, 184]);
  journal = resizeElement(journal, "first", "stamp-1", 184, 160); // Flecha arriba.
  assert.deepEqual([journal.pages[0].elements[3].width, journal.pages[0].elements[3].height], [160, 160]);
  journal = resizeElement(journal, "first", "stamp-1", 9000, 9000);
  assert.deepEqual([journal.pages[0].elements[3].width, journal.pages[0].elements[3].height], [252, 252]);
  journal = resizeElement(journal, "first", "stamp-1", -50, -100);
  assert.deepEqual([journal.pages[0].elements[3].width, journal.pages[0].elements[3].height], [96, 96]);
});

test("rejects unknown stamp keys, invalid geometry, text edits and IDs shared with notes", () => {
  assert.throws(() => createStamp("stamp-1", "../../other"));
  const journal = insertElement(initial(), "first", createStamp("stamp-1"));
  assert.throws(() => editElementText(journal, "first", "stamp-1", "text"));
  assert.throws(() => resizeElement(journal, "first", "stamp-1", NaN, 160));
  assert.throws(() => moveElement(journal, "first", "stamp-1", 0, NaN));
  assert.throws(() => insertElement(journal, "first", createStamp("note-1")));
  for (const [field, value] of [["stamp", "missing"], ["stamp", null], ["width", 95],
    ["height", 170], ["x", -1], ["y", 1078], ["id", "text-1"]]) {
    const invalid = structuredClone(journal);
    invalid.pages[0].elements[3][field] = value;
    assert.throws(() => validateJournal(invalid));
  }
});

test("stamp changes participate in history during pending saves and survive reopening", async () => {
  let saved = initial();
  let latest;
  let acknowledge;
  let delay = true;
  const store = createStore({ load: async () => structuredClone(saved), save: async journal => {
    if (delay) await new Promise(resolve => { acknowledge = resolve; });
    assert.equal(journal.revision, saved.revision);
    saved = { ...structuredClone(journal), revision: journal.revision + 1 };
    return saved.revision;
  } }, state => { latest = state; });
  await store.load();
  store.update(journal => insertElement(journal, "first", createStamp("stamp-1", "rainbow")));
  await new Promise(resolve => setImmediate(resolve));
  store.update(journal => moveElement(journal, "first", "stamp-1", 400, 300));
  store.update(journal => resizeElement(journal, "first", "stamp-1", 208, 208));
  store.undo();
  delay = false;
  acknowledge();
  await store.flush();
  assert.equal(latest.journal.pages[0].elements[3].width, 160);
  store.redo();
  await store.flush();
  const expected = structuredClone(latest.journal.pages[0].elements[3]);
  store.update(journal => deleteElement(journal, "first", "stamp-1"));
  store.undo();
  await store.flush();
  assert.deepEqual(latest.journal.pages[0].elements[3], expected);
  await store.load();
  assert.deepEqual(latest.journal.pages[0].elements[3], expected);
  assert.equal(latest.canUndo, false);
});
