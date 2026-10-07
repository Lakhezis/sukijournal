import test from "node:test";
import assert from "node:assert/strict";
import { renamePage, renameJournal, deletePage, addPage, documentSignature, validateJournal } from "../frontend/js/journal.js";
import { createText, createPostit, createWashi, createDrawing, insertElement, formatElementText, editElementText,
  styleDecoration, resizeElement, moveElement, deleteElement, createCalendar, changeCalendarPeriod, highlightCalendarDay,
  createDrawingFromStrokes, validateElement } from "../frontend/js/elements.js";
import { createStore } from "../frontend/js/store.js";
import { formattedSegments, rebaseMarks, toggleMarks, validateMarks } from "../frontend/js/formatting.js";

const initial = () => ({ schemaVersion: 1, revision: 0, title: "Journal", activePageId: "first",
  pages: [{ id: "first", title: "Página 1", elements: [createText("text"), createPostit("note")] }] });

test("page names, deletion of active/other/last page and journal names preserve document invariants", () => {
  let journal = renameJournal(initial(), "  Viajes 🌱  ");
  journal = renamePage(journal, "first", " Ideas ");
  assert.equal(journal.title, "Viajes 🌱");
  assert.equal(journal.pages[0].title, "Ideas");
  const second = addPage(journal, "second");
  assert.equal(deletePage(second, "first", "unused").activePageId, "second");
  assert.equal(deletePage(second, "second", "unused").activePageId, "first");
  const empty = deletePage(journal, "first", "blank");
  assert.deepEqual(empty.pages, [{ id: "blank", title: "Página 1", elements: [] }]);
  assert.equal(empty.activePageId, "blank");
  for (const name of ["", " ", "x".repeat(201), null]) {
    assert.throws(() => renamePage(journal, "first", name));
    assert.throws(() => renameJournal(journal, name));
  }
  assert.throws(() => deletePage(journal, "missing", "blank"));
  assert.equal(documentSignature(second), documentSignature({ ...second, revision: 20, activePageId: "first" }));
  const reordered = structuredClone(second);
  reordered.pages[0].elements[0] = Object.fromEntries(Object.entries(reordered.pages[0].elements[0]).reverse());
  assert.equal(documentSignature(second), documentSignature(reordered));
});

test("underline and highlight compose and toggle only the selected portion without storing HTML", () => {
  let journal = editElementText(initial(), "first", "text", "Organizar <la semana> 🌱");
  journal = formatElementText(journal, "first", "text", "underline", 0, 9);
  journal = formatElementText(journal, "first", "text", "highlight", 4, 15);
  const element = journal.pages[0].elements[0];
  assert.deepEqual(element.marks, [{kind:"underline",start:0,end:9}, {kind:"highlight",start:4,end:15}]);
  const pieces = formattedSegments(element.text, element.marks);
  assert.equal(pieces.map(piece => piece.text).join(""), element.text);
  assert.ok(pieces.some(piece => piece.underline && piece.highlight));
  const removed = toggleMarks(element.text, element.marks, "underline", 3, 6);
  assert.deepEqual(removed.filter(mark => mark.kind === "underline"), [{kind:"underline",start:0,end:3}, {kind:"underline",start:6,end:9}]);
  assert.throws(() => formatElementText(journal, "first", "text", "bold", 0, 2));
  assert.throws(() => formatElementText(journal, "first", "text", "underline", 2, 2));
  assert.throws(() => formatElementText(journal, "first", "text", "underline", 0, 9000));
});

test("text edits move, extend and remove formatting, including repeated characters and emoji", () => {
  const mark = [{kind:"underline",start:3,end:6}];
  assert.deepEqual(rebaseMarks("abcDEFghi", "xabcDEFghi", mark), [{kind:"underline",start:4,end:7}]);
  assert.deepEqual(rebaseMarks("abcDEFghi", "abcDxyEFghi", mark), [{kind:"underline",start:3,end:8}]);
  assert.deepEqual(rebaseMarks("abcDEFghi", "abcghi", mark), []);
  assert.deepEqual(rebaseMarks("abcDEFghi", "abcZZghi", mark, {start:3,end:6}), [{kind:"underline",start:3,end:5}]);
  assert.deepEqual(rebaseMarks("aaaa", "aaa", [{kind:"highlight",start:1,end:3}], {start:0,end:1}), [{kind:"highlight",start:0,end:2}]);
  assert.deepEqual(rebaseMarks("🌱abc", "abc", [{kind:"highlight",start:2,end:5}], {start:0,end:2}), [{kind:"highlight",start:0,end:3}]);
});

test("washi designs and drawing geometry survive scaling with normalized paths", () => {
  let journal = insertElement(initial(), "first", createWashi("tape", 9000, 9000, "sage", "dots"));
  journal = styleDecoration(journal, "first", "tape", {pattern:"grid",color:"lilac"});
  assert.equal(journal.pages[0].elements[2].pattern, "grid");
  const drawing = createDrawing("draw", [[100,200],[150,240],[210,300]], "salmon", 6);
  journal = insertElement(journal, "first", drawing);
  journal = resizeElement(journal, "first", "draw", 400, 300);
  assert.deepEqual(journal.pages[0].elements[3].points, drawing.points);
  assert.equal(journal.pages[0].elements[3].lineWidth, 6);
  assert.deepEqual(deleteElement(journal, "first", "draw").pages[0].elements.length, 3);
  assert.throws(() => styleDecoration(journal, "first", "tape", {pattern:"invalid"}));
  assert.throws(() => styleDecoration(journal, "first", "draw", {points:[]}));
  for (const [field, value] of [["points", [[NaN,0],[1,1]]], ["points", [[-1,0],[1,1]]],
    ["points", [[0,0]]], ["color","invalid"], ["lineWidth",13]]) {
    const invalid = structuredClone(journal);
    invalid.pages[0].elements[3][field] = value;
    assert.throws(() => validateJournal(invalid));
  }
});

test("page deletion, formatting and decorations can be undone while saves are pending; manual save keeps history", async () => {
  let saved = initial(), latest;
  const store = createStore({load:async()=>structuredClone(saved),save:async journal=>{
    saved={...structuredClone(journal),revision:journal.revision+1}; return saved.revision;
  }}, state=>{latest=state;});
  await store.load();
  store.update(journal=>editElementText(journal,"first","text","Mi semana"));
  store.update(journal=>formatElementText(journal,"first","text","highlight",0,2));
  store.update(journal=>insertElement(journal,"first",createWashi("tape")));
  store.update(journal=>deletePage(journal,"first","blank"));
  store.undo();
  await store.flush();
  assert.equal(latest.journal.activePageId,"first");
  assert.equal(latest.journal.pages[0].elements.length,3);
  // La capa nativa actualiza metadata en la misma transacción y confirma otra revisión.
  store.acceptRevision(latest.journal.revision+1);
  assert.equal(latest.canUndo,true);
  store.undo();
  await store.flush();
  assert.equal(latest.journal.pages[0].elements.length,2);
  assert.deepEqual(latest.journal.pages[0].elements[0].marks,[{kind:"highlight",start:0,end:2}]);
});

test("highlight colors replace overlapping portions, preserve legacy yellow and survive text edits", () => {
  let marks = toggleMarks("abcdefghij", [], "highlight", 0, 10);
  marks = toggleMarks("abcdefghij", marks, "highlight", 3, 7, "pink");
  assert.deepEqual(marks, [{kind:"highlight",start:0,end:3}, {kind:"highlight",start:3,end:7,color:"pink"}, {kind:"highlight",start:7,end:10}]);
  marks = toggleMarks("abcdefghij", marks, "highlight", 4, 6, "sage");
  assert.equal(formattedSegments("abcdefghij", marks).find(segment => segment.text === "ef").highlightColor, "sage");
  const edited = rebaseMarks("abcdefghij", "xabcdefghij", marks);
  assert.deepEqual(edited.find(mark => mark.color === "sage"), {kind:"highlight",start:5,end:7,color:"sage"});
  const recolored = toggleMarks("abcdefghij", marks, "highlight", 0, 10, "lilac", false);
  assert.deepEqual(recolored, [{kind:"highlight",start:0,end:10,color:"lilac"}]);
  assert.deepEqual(toggleMarks("abcdefghij", recolored, "highlight", 0, 10, "lilac"), []);
  assert.deepEqual(toggleMarks("abc", [{kind:"underline",start:0,end:3}], "underline", 0, 3, "pink"), []);
  assert.equal(formattedSegments("abc", [{kind:"highlight",start:0,end:3}])[0].highlightColor, "yellow");
  assert.throws(() => toggleMarks("abc", [], "highlight", 0, 3, "invalid"));
  assert.throws(() => validateMarks("abc", [{kind:"underline",start:0,end:3,color:"pink"}]));
});

test("calendar highlights belong to real dates, recolor and toggle without moving to another month", () => {
  let journal = insertElement(initial(), "first", createCalendar("cal", 2024, 2));
  journal = highlightCalendarDay(journal, "first", "cal", 29, "pink");
  journal = changeCalendarPeriod(journal, "first", "cal", 2100, 2);
  assert.throws(() => highlightCalendarDay(journal, "first", "cal", 29, "pink"));
  journal = highlightCalendarDay(journal, "first", "cal", 1, "lilac");
  assert.deepEqual(journal.pages[0].elements[2].dayHighlights, [{year:2024,month:2,day:29,color:"pink"}, {year:2100,month:2,day:1,color:"lilac"}]);
  journal = changeCalendarPeriod(journal, "first", "cal", 2024, 2);
  journal = highlightCalendarDay(journal, "first", "cal", 29, "sage");
  assert.equal(journal.pages[0].elements[2].dayHighlights.find(mark => mark.year === 2024).color, "sage");
  journal = highlightCalendarDay(journal, "first", "cal", 29, "sage");
  assert.deepEqual(journal.pages[0].elements[2].dayHighlights, [{year:2100,month:2,day:1,color:"lilac"}]);
  for (const marks of [null, [{year:2024,month:4,day:31,color:"pink"}], [{year:2024,month:2,day:1,color:"bad"}],
    [{year:2024,month:2,day:1,color:"pink"}, {year:2024,month:2,day:1,color:"sage"}]]) {
    const invalid = structuredClone(journal);
    invalid.pages[0].elements[2].dayHighlights = marks;
    assert.throws(() => validateJournal(invalid));
  }
});

test("colored text and calendar marks support undo, redo, autosave and reopening", async () => {
  let saved = insertElement(initial(), "first", createCalendar("cal", 2024, 2)), latest;
  const storage = {load:async()=>structuredClone(saved), save:async journal=>{
    saved = {...structuredClone(journal),revision:journal.revision+1}; return saved.revision;
  }};
  const store = createStore(storage, state=>{latest=state;});
  await store.load();
  store.update(journal=>editElementText(journal,"first","text","Ideas"));
  store.update(journal=>formatElementText(journal,"first","text","highlight",0,5,"pink"));
  store.update(journal=>highlightCalendarDay(journal,"first","cal",29,"lilac"));
  store.undo();
  await store.flush();
  assert.equal(latest.journal.pages[0].elements[2].dayHighlights, undefined);
  store.redo();
  await store.flush();
  const reopened = createStore(storage, state=>{latest=state;});
  await reopened.load();
  assert.equal(latest.journal.pages[0].elements[0].marks[0].color,"pink");
  assert.deepEqual(latest.journal.pages[0].elements[2].dayHighlights,[{year:2024,month:2,day:29,color:"lilac"}]);
});

test("new colors support tape creation/editing, text and calendar history and saved journals", async () => {
  let saved = insertElement(initial(), "first", createCalendar("cal", 2024, 2)), latest;
  const storage = {load:async()=>structuredClone(saved), save:async journal=>{
    saved = {...structuredClone(journal),revision:journal.revision+1}; return saved.revision;
  }};
  const store = createStore(storage, state=>{latest=state;});
  await store.load();
  store.update(journal=>editElementText(journal,"first","text","Ideas"));
  store.update(journal=>editElementText(journal,"first","note","Notas"));
  for (const [index,color] of ["mint","cyan","blue","violet"].entries()) {
    store.update(journal=>formatElementText(journal,"first","text","highlight",index,index+1,color));
    store.update(journal=>formatElementText(journal,"first","note","highlight",index,index+1,color));
    store.update(journal=>highlightCalendarDay(journal,"first","cal",index+1,color));
    store.update(journal=>insertElement(journal,"first",createWashi(`tape-${index}`,24,24,color,"dots")));
    assert.throws(()=>createPostit("note",24,24,color));
  }
  store.update(journal=>styleDecoration(journal,"first","tape-0",{color:"violet",pattern:"grid"}));
  assert.equal(latest.journal.pages[0].elements[3].color,"violet");
  store.undo();
  assert.equal(latest.journal.pages[0].elements[3].color,"mint");
  store.redo();
  assert.equal(latest.journal.pages[0].elements[3].pattern,"grid");
  await store.flush();
  const expected = structuredClone(latest.journal.pages);
  const reopened = createStore(storage,state=>{latest=state;});
  await reopened.load();
  assert.deepEqual(latest.journal.pages,expected);
  validateJournal(latest.journal);
  assert.deepEqual(latest.journal.pages[0].elements[0].marks.map(mark=>mark.color),["mint","cyan","blue","violet"]);
  assert.deepEqual(latest.journal.pages[0].elements[2].dayHighlights.map(mark=>mark.color),["mint","cyan","blue","violet"]);
  assert.throws(()=>createWashi("bad",24,24,"unknown"));
});

test("a confirmed drawing groups separate styled strokes, moves/resizes and persists as one history action", async () => {
  const drawing = createDrawingFromStrokes("group", [
    {color:"lilac",lineWidth:6,points:[[100,200],[150,240],[210,200]]},
    {color:"ink",lineWidth:3,points:[[100,280],[180,320],[230,280]]},
    {color:"olive",lineWidth:1,points:[[200,250]]},
  ]);
  assert.equal(drawing.strokes.length,3);
  assert.equal(drawing.points,undefined);
  assert.deepEqual(drawing.strokes[2].points[0],drawing.strokes[2].points[1]);
  let saved = initial(), latest;
  const storage = {load:async()=>structuredClone(saved),save:async journal=>{
    saved={...structuredClone(journal),revision:journal.revision+1};return saved.revision;
  }};
  const store=createStore(storage,state=>{latest=state;});
  await store.load();
  store.update(journal=>insertElement(journal,"first",drawing));
  store.undo();
  assert.equal(latest.journal.pages[0].elements.length,2);
  store.redo();
  const transformed=resizeElement(moveElement(latest.journal,"first","group",200,300),"first","group",300,260);
  assert.deepEqual(transformed.pages[0].elements[2].strokes,drawing.strokes);
  store.update(()=>transformed);
  await store.flush();
  const expected=structuredClone(latest.journal.pages);
  await createStore(storage,state=>{latest=state;}).load();
  assert.deepEqual(latest.journal.pages,expected);
  const recolored=styleDecoration(latest.journal,"first","group",{color:"salmon",lineWidth:12});
  assert.ok(recolored.pages[0].elements[2].strokes.every(stroke=>stroke.color==="salmon" && stroke.lineWidth===12));
  validateElement(createDrawing("legacy",[[100,100],[200,200]],"ink",3));
});

test("grouped drawings reject ambiguous paths, malformed strokes and excessive total points", () => {
  const drawing=createDrawingFromStrokes("group",[{color:"ink",lineWidth:3,points:[[0,0],[100,100]]}]);
  for (const strokes of [null,[],[null],[{color:"bad",lineWidth:3,points:[[0,0],[1,1]]}],
    [{color:"ink",lineWidth:13,points:[[0,0],[1,1]]}],
    [{color:"ink",lineWidth:3,points:[[0,0],[1,2]]}]]) {
    assert.throws(()=>validateElement({...drawing,strokes}));
  }
  assert.throws(()=>validateElement({...drawing,points:[[0,0],[1,1]]}));
  assert.throws(()=>createDrawingFromStrokes("bad",[{color:"ink",lineWidth:3,points:[[NaN,0]]}]));
  const stroke={color:"ink",lineWidth:3,points:Array.from({length:4096},()=>[0,0])};
  validateElement({...drawing,strokes:Array.from({length:16},()=>stroke)});
  assert.throws(()=>validateElement({...drawing,strokes:Array.from({length:17},()=>stroke)}));
});
