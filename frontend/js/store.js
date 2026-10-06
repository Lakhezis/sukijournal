import { validateJournal } from "./journal.js";

// Serializa las escrituras y guarda también los cambios que lleguen durante una.
export function createStore(storage, onChange) {
  let journal = null;
  let generation = 0;
  let savedGeneration = 0;
  let pending = null;
  let phase = "loading";
  let error = "";

  const publish = () => onChange({ journal: journal && structuredClone(journal), phase, error });
  const fail = reason => {
    phase = "error";
    error = String(reason?.message || reason);
    publish();
  };

  async function load() {
    phase = "loading";
    error = "";
    publish();
    try {
      journal = structuredClone(validateJournal(await storage.load()));
      generation = savedGeneration = 0;
      phase = "saved";
      publish();
      return true;
    } catch (reason) {
      fail(reason);
      return false;
    }
  }

  function flush() {
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

  function update(transform) {
    if (!journal || phase === "error" || phase === "loading") return;
    try {
      journal = structuredClone(validateJournal(transform(structuredClone(journal))));
      generation += 1;
      phase = "saving";
      publish();
      void flush();
    } catch (reason) {
      fail(reason);
    }
  }

  return { load, update, flush, retry: () => journal ? flush() : load() };
}
