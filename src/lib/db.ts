// Minimal promise wrapper around IndexedDB (no extra dependencies).
const DB_NAME = 'thrive';
const DB_VERSION = 7;

/** All journal entries (quick and talk) live in this one store, keyed by `id`. */
export const JOURNAL_STORE = 'journal';
/** Index over [type, date] so we can ask for e.g. all "talk" entries on a given day. */
export const TYPE_DATE_INDEX = 'type_date';
/** Goals (added in version 3), keyed by `id`. */
export const GOALS_STORE = 'goals';
/** Positives saved on their own, outside a journal entry (added in version 4), keyed by `id`. */
export const POSITIVES_STORE = 'positives';
/** Time Capsule letters (added in version 5), keyed by `id`. */
export const LETTERS_STORE = 'letters';
/** My own affirmations (added in version 6), keyed by `id`. Built-in ones live in code. */
export const AFFIRMATIONS_STORE = 'affirmations';
/** Habit swaps (added in version 7), keyed by `id`. */
export const HABITS_STORE = 'habits';
/** Version 1 kept quick entries in "entries", keyed by date. */
const LEGACY_ENTRIES_STORE = 'entries';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('This browser does not support on-device storage.'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = req.result;
        const tx = req.transaction!;
        if (!db.objectStoreNames.contains(JOURNAL_STORE)) {
          const store = db.createObjectStore(JOURNAL_STORE, { keyPath: 'id' });
          store.createIndex(TYPE_DATE_INDEX, ['type', 'date']);
        }
        if (!db.objectStoreNames.contains(GOALS_STORE)) {
          db.createObjectStore(GOALS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(POSITIVES_STORE)) {
          db.createObjectStore(POSITIVES_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(LETTERS_STORE)) {
          db.createObjectStore(LETTERS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(AFFIRMATIONS_STORE)) {
          db.createObjectStore(AFFIRMATIONS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(HABITS_STORE)) {
          db.createObjectStore(HABITS_STORE, { keyPath: 'id' });
        }
        // Move quick entries saved by version 1 into the new store, then drop the old one.
        if (event.oldVersion < 2 && db.objectStoreNames.contains(LEGACY_ENTRIES_STORE)) {
          const all = tx.objectStore(LEGACY_ENTRIES_STORE).getAll();
          all.onsuccess = () => {
            const journal = tx.objectStore(JOURNAL_STORE);
            for (const old of all.result as { date: string }[]) {
              journal.put({ ...old, id: `quick-${old.date}`, type: 'quick' });
            }
            db.deleteObjectStore(LEGACY_ENTRIES_STORE);
          };
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error('Could not open on-device storage.'));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const req = action(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error('Saving was interrupted.'));
      }),
  );
}

export const idbGet = <T>(storeName: string, key: IDBValidKey) =>
  run<T | undefined>(storeName, 'readonly', (s) => s.get(key));

export const idbPut = <T>(storeName: string, value: T) =>
  run<IDBValidKey>(storeName, 'readwrite', (s) => s.put(value));

export const idbGetAllFromIndex = <T>(storeName: string, indexName: string, query: IDBValidKey | IDBKeyRange) =>
  run<T[]>(storeName, 'readonly', (s) => s.index(indexName).getAll(query));

export const idbDelete = (storeName: string, key: IDBValidKey) =>
  run<undefined>(storeName, 'readwrite', (s) => s.delete(key));

export const idbGetAll = <T>(storeName: string) => run<T[]>(storeName, 'readonly', (s) => s.getAll());

/** Replace everything in a store in ONE transaction: if any write fails, nothing changes. */
export function idbReplaceAll<T>(storeName: string, values: T[]): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        for (const v of values) store.put(v);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Restoring was interrupted.'));
        tx.onabort = () => reject(tx.error ?? new Error('Restoring was interrupted.'));
      }),
  );
}

/** Replace the contents of several stores in ONE transaction: all succeed, or nothing changes. */
export function idbReplaceStores(contents: Record<string, unknown[]>): Promise<void> {
  const names = Object.keys(contents);
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(names, 'readwrite');
        for (const name of names) {
          const store = tx.objectStore(name);
          store.clear();
          for (const v of contents[name]) store.put(v);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Restoring was interrupted.'));
        tx.onabort = () => reject(tx.error ?? new Error('Restoring was interrupted.'));
      }),
  );
}
