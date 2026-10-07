import test from "node:test";
import assert from "node:assert/strict";
import { calendarWeeks, validPeriod } from "../frontend/js/calendar.js";
import { createStore } from "../frontend/js/store.js";
import { addPage, validateJournal } from "../frontend/js/journal.js";
import { createCalendar, createText, createPostit, createStamp, changeCalendarPeriod,
  insertElement, editElementText, moveElement, resizeElement, deleteElement, PAPER } from "../frontend/js/elements.js";

const initial = () => ({ schemaVersion: 1, revision: 0, title: "Journal", activePageId: "first",
  pages: [{ id: "first", title: "Página 1", elements: [createText("text"), createPostit("note"),
    createStamp("stamp"), { type: "future", data: { keep: true } }] }] });
const calendar = journal => journal.pages[0].elements[4];

test("Monday-first calendars cover leap centuries, four/six weeks and years below 100", () => {
  assert.deepEqual(calendarWeeks(2024, 2)[0], [null, null, null, 1, 2, 3, 4]);
  assert.equal(calendarWeeks(2024, 2).flat().filter(Boolean).length, 29);
  assert.equal(calendarWeeks(1900, 2).flat().filter(Boolean).length, 28);
  assert.equal(calendarWeeks(2000, 2).flat().filter(Boolean).length, 29);
  assert.equal(calendarWeeks(2100, 2).flat().filter(Boolean).length, 28);
  assert.equal(calendarWeeks(2021, 2).length, 4);
  assert.deepEqual(calendarWeeks(2026, 3)[0], [null, null, null, null, null, null, 1]);
  assert.equal(calendarWeeks(2026, 3).length, 6);
  assert.deepEqual(calendarWeeks(1, 1)[0], [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(calendarWeeks(99, 1)[0], [null, null, null, 1, 2, 3, 4]);
  assert.equal(calendarWeeks(9999, 12).flat().filter(Boolean).length, 31);
});

test("every month in a Gregorian cycle has consecutive days and complete weeks", () => {
  for (let year = 2000; year < 2400; year++) {
    for (let month = 1; month <= 12; month++) {
      const weeks = calendarWeeks(year, month);
      const expectedDays = month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28)
        : [4, 6, 9, 11].includes(month) ? 30 : 31;
      assert.ok(weeks.length >= 4 && weeks.length <= 6);
      assert.ok(weeks.every(week => week.length === 7));
      assert.deepEqual(weeks.flat().filter(Boolean), Array.from({ length: expectedDays }, (_, index) => index + 1));
    }
  }
});

test("period edits and geometry preserve other elements and pages", () => {
  const original = addPage(initial(), "second");
  let journal = insertElement(original, "first", createCalendar("calendar", 2024, 2, 9000, -1));
  assert.deepEqual(calendar(journal), { type: "calendar", id: "calendar", year: 2024, month: 2,
    x: PAPER.width - 360, y: 0, width: 360, height: 340 });
  journal = moveElement(journal, "first", "calendar", 0, 9000);
  assert.equal(calendar(journal).y, PAPER.height - 340);
  journal = resizeElement(journal, "first", "calendar", -1, -1);
  assert.deepEqual([calendar(journal).width, calendar(journal).height], [280, 280]);
  journal = resizeElement(journal, "first", "calendar", 9000, 9000);
  assert.deepEqual([calendar(journal).width, calendar(journal).height], [852, 340]);
  journal = changeCalendarPeriod(journal, "first", "calendar", 2100, 12);
  assert.equal(calendar(journal).year, 2100);
  assert.equal(calendar(journal).month, 12);
  assert.deepEqual(journal.pages[0].elements.slice(0, 4), original.pages[0].elements);
  assert.deepEqual(journal.pages[1], original.pages[1]);
  assert.deepEqual(deleteElement(journal, "first", "calendar"), original);
});

test("invalid periods, geometry and shared IDs are rejected", () => {
  for (const [year, month] of [[0, 1], [10000, 1], [2024.5, 1], [NaN, 1], ["2024", 1],
    [2024, 0], [2024, 13], [2024, 1.5], [2024, "2"], [null, 2]]) {
    assert.equal(validPeriod(year, month), false);
    assert.throws(() => calendarWeeks(year, month));
    assert.throws(() => createCalendar("calendar", year, month));
  }
  const journal = insertElement(initial(), "first", createCalendar("calendar", 2024, 2));
  assert.throws(() => editElementText(journal, "first", "calendar", "text"));
  assert.throws(() => changeCalendarPeriod(journal, "first", "text", 2024, 2));
  assert.throws(() => insertElement(journal, "first", createCalendar("stamp", 2024, 2)));
  for (const [field, value] of [["year", null], ["month", 13], ["width", 279], ["height", 279],
    ["x", -1], ["y", 1078], ["id", "note"]]) {
    const invalid = structuredClone(journal);
    calendar(invalid)[field] = value;
    assert.throws(() => validateJournal(invalid));
  }
});

test("period, size and deletion history survive a pending save and reopening", async () => {
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
  store.update(journal => insertElement(journal, "first", createCalendar("calendar", 2024, 2)));
  await new Promise(resolve => setImmediate(resolve));
  store.update(journal => changeCalendarPeriod(journal, "first", "calendar", 2026, 3));
  store.undo();
  assert.equal(calendar(latest.journal).month, 2);
  store.redo();
  store.update(journal => resizeElement(journal, "first", "calendar", 408, 364));
  store.update(journal => moveElement(journal, "first", "calendar", 100, 400));
  delay = false;
  acknowledge();
  await store.flush();
  const expected = structuredClone(calendar(latest.journal));
  store.update(journal => deleteElement(journal, "first", "calendar"));
  store.undo();
  await store.flush();
  await store.load();
  assert.deepEqual(calendar(latest.journal), expected);
  assert.equal(latest.canUndo, false);
});

test("a failed period save retains the edit, blocks changes and can retry before undo", async () => {
  let saved = insertElement(initial(), "first", createCalendar("calendar", 2024, 2));
  let latest;
  let failSave = true;
  const store = createStore({ load: async () => structuredClone(saved), save: async journal => {
    if (failSave) throw new Error("Disco no disponible");
    saved = { ...structuredClone(journal), revision: journal.revision + 1 };
    return saved.revision;
  } }, state => { latest = state; });
  await store.load();
  store.update(journal => changeCalendarPeriod(journal, "first", "calendar", 2100, 2));
  assert.equal(await store.flush(), false);
  assert.equal(latest.phase, "error");
  assert.equal(calendar(latest.journal).year, 2100);
  assert.equal(calendar(saved).year, 2024);
  assert.equal(store.update(journal => deleteElement(journal, "first", "calendar")), false);
  failSave = false;
  assert.equal(await store.retry(), true);
  store.undo();
  await store.flush();
  assert.equal(calendar(saved).year, 2024);
});
