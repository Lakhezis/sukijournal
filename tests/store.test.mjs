import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../frontend/js/store.js";
import { addPage, selectPage } from "../frontend/js/journal.js";

const initial = () => ({ schemaVersion: 1, revision: 0, title: "Mi Bullet Journal",
  activePageId: "first", pages: [{ id: "first", title: "Página 1", elements: [] }] });
const tick = () => new Promise(resolve => setImmediate(resolve));

test("serializes rapid edits and uses the confirmed revision for the next save", async () => {
  const writes = [];
  const acknowledgements = [];
  let latest;
  const store = createStore({ load: async () => initial(), save: snapshot => {
    writes.push(snapshot);
    return new Promise(resolve => acknowledgements.push(resolve));
  } }, state => { latest = state; });
  await store.load();
  store.update(journal => addPage(journal, "second"));
  await tick();
  store.update(journal => addPage(journal, "third"));
  store.update(journal => selectPage(journal, "first"));
  assert.equal(writes.length, 1);
  assert.equal(latest.phase, "saving");
  acknowledgements.shift()(1);
  await tick();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].revision, 1);
  assert.equal(writes[1].pages.length, 3);
  assert.equal(writes[1].activePageId, "first");
  acknowledgements.shift()(2);
  assert.equal(await store.flush(), true);
  assert.equal(latest.phase, "saved");
  assert.equal(latest.journal.revision, 2);
});

test("retains pending edits after a save error and retries the same revision", async () => {
  let fail = true;
  let latest;
  const writes = [];
  const store = createStore({ load: async () => initial(), save: async journal => {
    writes.push(journal);
    if (fail) throw new Error("Disco no disponible");
    return journal.revision + 1;
  } }, state => { latest = state; });
  await store.load();
  store.update(journal => addPage(journal, "second"));
  assert.equal(await store.flush(), false);
  assert.equal(latest.phase, "error");
  assert.equal(latest.journal.pages.length, 2);
  assert.equal(latest.journal.revision, 0);
  fail = false;
  assert.equal(await store.retry(), true);
  assert.deepEqual(writes[0], writes[1]);
  assert.equal(latest.phase, "saved");
});

test("a failed load never creates replacement data and can be retried", async () => {
  let attempts = 0;
  let writes = 0;
  let latest;
  const store = createStore({ load: async () => {
    if (++attempts === 1) throw new Error("Journal no disponible");
    return initial();
  }, save: async () => { writes++; } }, state => { latest = state; });
  assert.equal(await store.load(), false);
  assert.equal(latest.journal, null);
  assert.equal(writes, 0);
  assert.equal(await store.retry(), true);
  assert.equal(latest.phase, "saved");
});

test("invalid load data is refused without replacing it", async () => {
  let latest;
  const store = createStore({ load: async () => ({ ...initial(), activePageId: "missing" }) },
    state => { latest = state; });
  assert.equal(await store.load(), false);
  assert.equal(latest.journal, null);
  assert.equal(latest.phase, "error");
});

test("preserves existing page content when adding and selecting pages", () => {
  const journal = initial();
  journal.pages[0].elements.push({ kind: "text", data: { text: "Ideas 🌱" } });
  const changed = selectPage(addPage(journal, "second"), "first");
  assert.deepEqual(changed.pages[0].elements, journal.pages[0].elements);
  assert.equal(journal.pages.length, 1);
});

test("confirmed reload replaces pending changes only after a successful read", async () => {
  let failLoad = false;
  let latest;
  const store = createStore({ load: async () => {
    if (failLoad) throw new Error("Lectura fallida");
    return initial();
  }, save: async () => { throw new Error("Conflicto de revisión"); } },
  state => { latest = state; });
  await store.load();
  store.update(journal => addPage(journal, "second"));
  await store.flush();
  failLoad = true;
  assert.equal(await store.load(), false);
  assert.equal(latest.journal.pages.length, 2);
  failLoad = false;
  assert.equal(await store.load(), true);
  assert.equal(latest.journal.pages.length, 1);
  assert.equal(latest.phase, "saved");
});
