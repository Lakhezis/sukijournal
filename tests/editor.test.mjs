import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../frontend/js/store.js";
import { addPage, selectPage, validateJournal } from "../frontend/js/journal.js";
import { createText, insertText, editText, moveText, resizeText, deleteText, PAPER } from "../frontend/js/elements.js";

const initial = () => ({ schemaVersion: 1, revision: 0, title: "Journal", activePageId: "first",
  pages: [{ id: "first", title: "Página 1", elements: [{type:"future", data:{value:"conservar"}}] }] });

test("undo and redo remain consistent while an earlier revision is being saved", async () => {
  let latest;
  const writes = [];
  const acknowledgements = [];
  const store = createStore({load: async () => initial(), save: snapshot => {
    writes.push(snapshot);
    return new Promise(resolve => acknowledgements.push(resolve));
  }}, state => { latest = state; });
  await store.load();
  store.update(journal => insertText(journal, "first", createText("text-1")));
  await new Promise(resolve => setImmediate(resolve));
  store.update(journal => editText(journal, "first", "text-1", "Una idea"));
  store.undo();
  store.undo();
  store.redo();
  acknowledgements.shift()(1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 2);
  assert.equal(writes[1].revision, 1);
  assert.equal(writes[1].pages[0].elements[1].text, "");
  acknowledgements.shift()(2);
  await store.flush();
  store.redo();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes[2].revision, 2);
  acknowledgements.shift()(3);
  await store.flush();
  assert.equal(latest.journal.pages[0].elements[1].text, "Una idea");
  assert.equal(latest.journal.revision, 3);
});

test("text operations keep other elements and pages intact and clamp geometry to the paper", () => {
  const original = addPage(initial(), "second");
  let journal = insertText(original, "first", createText("text-1", 2000, -24));
  assert.equal(journal.pages[0].elements[1].x, PAPER.width - 240);
  assert.equal(journal.pages[0].elements[1].y, 0);
  journal = editText(journal, "first", "text-1", "<hola>\nIdeas 🌱");
  journal = moveText(journal, "first", "text-1", -100, 5000);
  journal = resizeText(journal, "first", "text-1", 9000, -20);
  const element = journal.pages[0].elements[1];
  assert.equal(element.x, 0);
  assert.equal(element.y, PAPER.height - 160);
  assert.equal(element.width, PAPER.width);
  assert.equal(element.height, 88);
  assert.equal(element.text, "<hola>\nIdeas 🌱");
  assert.deepEqual(journal.pages[0].elements[0], original.pages[0].elements[0]);
  assert.deepEqual(journal.pages[1], original.pages[1]);
  assert.equal(original.pages[0].elements.length, 1);
  assert.deepEqual(deleteText(journal, "first", "text-1"), original);
});

test("rejects duplicate IDs, nonfinite geometry, and text beyond the supported length", () => {
  const journal = insertText(initial(), "first", createText("text-1"));
  assert.throws(() => insertText(journal, "first", createText("text-1")));
  assert.throws(() => moveText(journal, "first", "text-1", NaN, 24));
  assert.throws(() => editText(journal, "first", "text-1", "x".repeat(10_001)));
  const duplicate = structuredClone(journal);
  duplicate.pages[0].elements.push(duplicate.pages[0].elements[1]);
  assert.throws(() => validateJournal(duplicate));
});

test("undo and redo group typing and retain the latest storage revision", async () => {
  let latest;
  let saved = initial();
  const store = createStore({ load: async () => saved, save: async journal => {
    assert.equal(journal.revision, saved.revision);
    saved = {...structuredClone(journal), revision: journal.revision + 1};
    return saved.revision;
  } }, state => { latest = state; });
  await store.load();
  store.update(journal => insertText(journal, "first", createText("text-1")));
  await store.flush();
  for (const text of ["H", "Ho", "Hola"]) {
    store.update(journal => editText(journal, "first", "text-1", text), { group: "typing", deferSave: true });
  }
  await store.flush();
  assert.equal(latest.journal.revision, 2);
  assert.equal(store.undo(), true);
  await store.flush();
  assert.equal(latest.journal.pages[0].elements[1].text, "");
  assert.equal(latest.journal.revision, 3);
  assert.equal(store.redo(), true);
  await store.flush();
  assert.equal(latest.journal.pages[0].elements[1].text, "Hola");
  assert.equal(latest.journal.revision, 4);
  store.undo();
  await store.flush();
  store.update(journal => editText(journal, "first", "text-1", "Nueva idea"));
  await store.flush();
  assert.equal(latest.canRedo, false);
  assert.equal(store.redo(), false);
});

test("navigation does not add history and undo restores the page with the affected content", async () => {
  let latest;
  const store = createStore({ load: async () => addPage(initial(), "second"),
    save: async journal => journal.revision + 1 }, state => { latest = state; });
  await store.load();
  store.update(journal => selectPage(journal, "first"), { recordHistory: false });
  await store.flush();
  assert.equal(latest.canUndo, false);
  store.update(journal => insertText(journal, "first", createText("text-1")));
  await store.flush();
  store.update(journal => selectPage(journal, "second"), { recordHistory: false });
  await store.flush();
  store.undo();
  await store.flush();
  assert.equal(latest.journal.activePageId, "first");
  assert.equal(latest.journal.pages[0].elements.length, 1);
  store.redo();
  await store.flush();
  assert.equal(latest.journal.pages[0].elements.length, 2);
});

test("flush saves deferred typing immediately and a failed save retains content and history", async () => {
  let latest;
  let writes = 0;
  let fail = true;
  const store = createStore({ load: async () => insertText(initial(), "first", createText("text-1")),
    save: async journal => { writes++; if (fail) throw new Error("disco"); return journal.revision + 1; } },
  state => { latest = state; });
  await store.load();
  store.update(journal => editText(journal, "first", "text-1", "Cerrar ahora"), { deferSave: true });
  assert.equal(writes, 0);
  assert.equal(await store.flush(), false);
  assert.equal(writes, 1);
  assert.equal(latest.journal.pages[0].elements[1].text, "Cerrar ahora");
  assert.equal(latest.canUndo, true);
  assert.equal(store.undo(), false);
  fail = false;
  await store.retry();
  assert.equal(latest.phase, "saved");
  store.undo();
  await store.flush();
  assert.equal(latest.journal.pages[0].elements[1].text, "");
});

test("no-op edits do not write or add history, and a reload clears session history", async () => {
  let latest;
  let writes = 0;
  const store = createStore({ load: async () => initial(), save: async journal => { writes++; return journal.revision + 1; } },
    state => { latest = state; });
  await store.load();
  store.update(journal => selectPage(journal, "first"));
  assert.equal(writes, 0);
  assert.equal(latest.canUndo, false);
  store.update(journal => insertText(journal, "first", createText("text-1")));
  await store.flush();
  assert.equal(latest.canUndo, true);
  await store.load();
  assert.equal(latest.canUndo, false);
  assert.equal(latest.canRedo, false);
});
