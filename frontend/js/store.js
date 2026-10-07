import { validateJournal } from "./journal.js";

// Serializa las escrituras y guarda también los cambios que lleguen durante una.
export function createStore(storage, onChange) {
  let journal = null;
  let generation = 0;
  let savedGeneration = 0;
  let pending = null;
  let phase = "loading";
  let error = "";
  let saveTimer = null;
  const past = [];
  const future = [];
  let historyGroup = null;
  let groupTime = 0;

  const publish = () => onChange({ journal: journal && structuredClone(journal), phase, error,
    canUndo: past.length > 0, canRedo: future.length > 0 });
  const fail = reason => {
    phase = "error";
    error = String(reason?.message || reason);
    publish();
  };

  async function load() {
    if (pending) await pending;
    clearTimeout(saveTimer);
    saveTimer = null;
    phase = "loading";
    error = "";
    publish();
    try {
      journal = structuredClone(validateJournal(await storage.load()));
      generation = savedGeneration = 0;
      past.length = future.length = 0;
      historyGroup = null;
      phase = "saved";
      publish();
      return true;
    } catch (reason) {
      fail(reason);
      return false;
    }
  }

  function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (pending) return pending;
    if (!journal || generation === savedGeneration) return Promise.resolve(true);
    phase = "saving";
    error = "";
    publish();
    // Posponer el trabajo un microtask permite asignar pending antes de terminar.
    pending = Promise.resolve().then(async () => {
      try {
        while (savedGeneration !== generation) {
          const snapshot = structuredClone(journal);
          const savingGeneration = generation;
          const revision = await storage.save(snapshot);
          if (!Number.isSafeInteger(revision) || revision !== snapshot.revision + 1) {
            throw new Error("No se recibió una confirmación válida del guardado.");
          }
          journal.revision = revision;
          savedGeneration = savingGeneration;
        }
        phase = "saved";
        publish();
        return true;
      } catch (reason) {
        fail(reason);
        return false;
      } finally {
        pending = null;
      }
    });
    return pending;
  }

  function scheduleSave(deferSave) {
    if (pending) return;
    if (!deferSave) { void flush(); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void flush(); }, 300);
  }

  function update(transform, { recordHistory = true, group = null, deferSave = false } = {}) {
    if (!journal || phase === "error" || phase === "loading") return false;
    try {
      const next = structuredClone(validateJournal(transform(structuredClone(journal))));
      if (JSON.stringify(next) === JSON.stringify(journal)) return false;
      const now = Date.now();
      if (recordHistory) {
        if (!group || historyGroup !== group || now - groupTime > 1000) {
          past.push(structuredClone(journal));
          if (past.length > 100) past.shift();
        }
        future.length = 0;
      }
      historyGroup = recordHistory ? group : null;
      groupTime = now;
      journal = next;
      generation += 1;
      phase = "saving";
      publish();
      scheduleSave(deferSave);
      return true;
    } catch (reason) {
      fail(reason);
      return false;
    }
  }

  function restore(source, destination) {
    if (!journal || phase === "error" || phase === "loading" || !source.length) return false;
    destination.push(structuredClone(journal));
    // El historial modifica el documento; la revisión pertenece al almacenamiento actual.
    journal = { ...source.pop(), revision: journal.revision };
    historyGroup = null;
    generation += 1;
    phase = "saving";
    publish();
    void flush();
    return true;
  }

  return { load, update, flush, retry: () => journal ? flush() : load(),
    acceptRevision(revision) {
      if (pending || generation !== savedGeneration || !journal || !Number.isSafeInteger(revision) || revision < journal.revision) {
        throw new Error("No se pudo confirmar la revisión del archivo.");
      }
      journal.revision = revision;
      publish();
    },
    undo: () => restore(past, future), redo: () => restore(future, past),
    endGroup: () => { historyGroup = null; } };
}
