// Minimal promise wrapper around IndexedDB (no extra dependencies).
import { foldIntoJourneys } from './journeyParts';
import { ensureBuiltInLists, foldIntoLists } from './listParts';
import { asLengthKind } from './measureParts';
const DB_NAME = 'thrive';
const DB_VERSION = 19; // 19: Wishlist and Bucket list are built in (added back if missing). 18: Health Journey (days + medications). 17: every measurement is a length (cm). 16: Wishlist + Bucket list move into My Life lists, with starter lists. 15: Dreams & Nightmares journal (its own store). 10: talk summaries became a list (see the migration below). 11: companion memory notes. 12: My Life profile. 13: bucket list. 14: goals + habit swaps move into journeys

/** All journal entries (quick and talk) live in this one store, keyed by `id`. */
export const JOURNAL_STORE = 'journal';
/** Dreams & Nightmares entries (added in version 15): same shape and index as the journal, kept apart. */
export const DREAMS_STORE = 'dreams';
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
/** My lists, each holding its own items (added in version 8), keyed by `id`. */
export const LISTS_STORE = 'lists';
/** Companion memory: short notes I approved for the "Talk about this" companion (added in version 11), keyed by `id`. */
export const MEMORIES_STORE = 'memories';
/** My Life profile (added in version 12), each keyed by `id`: measurement kinds (each holding its logged values), */
export const MEASUREMENTS_STORE = 'measurements';
/** …my routine ("when → what" reference entries), */
export const ROUTINE_STORE = 'routine';
/** …my wishlist, */
export const WISHLIST_STORE = 'wishlist';
/** …and my bucket list (added in version 13). */
export const BUCKETLIST_STORE = 'bucketlist';
/** Health Journey (added in version 18): one record per logged day, keyed by `id` ("health-YYYY-MM-DD"), */
export const HEALTH_STORE = 'health';
/** …and my own medication list, keyed by `id`. */
export const MEDICATIONS_STORE = 'medications';
/** Fear & Confidence journeys, each holding its ladder of steps (added in version 9), keyed by `id`. */
export const JOURNEYS_STORE = 'journeys';
/** Version 1 kept quick entries in "entries", keyed by date. */
const LEGACY_ENTRIES_STORE = 'entries';

let dbPromise: Promise<IDBDatabase> | null = null;
let current: IDBDatabase | null = null;

/** Errors that mean the connection was closed under us (worth reopening and trying again). */
function isClosedConnection(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name ?? '';
  const message = String((err as { message?: string } | null)?.message ?? '').toLowerCase();
  return name === 'InvalidStateError' || name === 'TransactionInactiveError' || message.includes('closing') || message.includes('closed');
}

const RETRIES = 3;

/**
 * Runs some work on the database. If it fails because the connection closed, the connection is reopened and the
 * work is tried again, up to 3 more times, before the error is passed on.
 */
async function withDb<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await work(await openDb());
    } catch (err) {
      if (attempt >= RETRIES || !isClosedConnection(err)) throw err;
      try {
        current?.close();
      } catch {
        /* already closed */
      }
      current = null;
      dbPromise = null;
      await new Promise((r) => setTimeout(r, 60 * (attempt + 1)));
    }
  }
}

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
        if (!db.objectStoreNames.contains(DREAMS_STORE)) {
          const store = db.createObjectStore(DREAMS_STORE, { keyPath: 'id' });
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
        if (!db.objectStoreNames.contains(LISTS_STORE)) {
          db.createObjectStore(LISTS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(JOURNEYS_STORE)) {
          db.createObjectStore(JOURNEYS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(MEMORIES_STORE)) {
          db.createObjectStore(MEMORIES_STORE, { keyPath: 'id' });
        }
        for (const name of [MEASUREMENTS_STORE, ROUTINE_STORE, WISHLIST_STORE, BUCKETLIST_STORE, HEALTH_STORE, MEDICATIONS_STORE]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
        // Version 10: a journal page's single talk summary becomes the first item of its summaries list.
        // (Same id and shape as talkSummariesOf in journal.ts, so backups and merges line up.)
        if (event.oldVersion >= 1 && event.oldVersion < 10 && db.objectStoreNames.contains(JOURNAL_STORE)) {
          const journal = tx.objectStore(JOURNAL_STORE);
          const cursorReq = journal.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) return;
            const entry = cursor.value as {
              id: string;
              type: string;
              updatedAt: string;
              talkSummary?: unknown;
              talkSummaries?: { id: string; text: string; createdAt: string }[];
            };
            if (entry.type === 'talk' && 'talkSummary' in entry) {
              const { talkSummary, ...rest } = entry;
              const list = Array.isArray(entry.talkSummaries) ? [...entry.talkSummaries] : [];
              const legacyId = `summary-${entry.id}-legacy`;
              if (typeof talkSummary === 'string' && talkSummary.trim() && !list.some((s) => s.id === legacyId)) {
                list.unshift({ id: legacyId, text: talkSummary.trim(), createdAt: entry.updatedAt });
              }
              cursor.update(list.length ? { ...rest, talkSummaries: list } : rest);
            }
            cursor.continue();
          };
        }
        // Version 14: Growth's journeys now hold a goal, steps and habit swaps. Every ladder gets its aim as its goal,
        // and every standalone goal / habit swap moves into a journey of its own (see journeyParts.ts). Nothing is
        // lost: the records are moved into journeys, then the old goals and habits stores are emptied.
        if (event.oldVersion >= 1 && event.oldVersion < 14) {
          const read = (name: string, done: (rows: never[]) => void) => {
            if (!db.objectStoreNames.contains(name)) return done([]);
            const r = tx.objectStore(name).getAll();
            r.onsuccess = () => done(r.result as never[]);
          };
          read(JOURNEYS_STORE, (journeys) =>
            read(GOALS_STORE, (goals) =>
              read(HABITS_STORE, (habits) => {
                const store = tx.objectStore(JOURNEYS_STORE);
                for (const j of foldIntoJourneys(journeys, goals, habits)) store.put(j);
                tx.objectStore(GOALS_STORE).clear();
                tx.objectStore(HABITS_STORE).clear();
              }),
            ),
          );
        }
        // Version 16: My Life has one Lists section. Everyone gets the starter lists (To do, Wishlist, Bucket list,
        // Groceries); the old Wishlist and Bucket list items move into those lists with the same ids, keeping their
        // "Got it" / "Did it" dates (see listParts.ts). Then the old wishlist and bucket list stores are emptied.
        if (event.oldVersion < 16) {
          const read = (name: string, done: (rows: never[]) => void) => {
            if (!db.objectStoreNames.contains(name)) return done([]);
            const r = tx.objectStore(name).getAll();
            r.onsuccess = () => done(r.result as never[]);
          };
          read(LISTS_STORE, (lists) =>
            read(WISHLIST_STORE, (wishes) =>
              read(BUCKETLIST_STORE, (buckets) => {
                const store = tx.objectStore(LISTS_STORE);
                const before = new Map((lists as { id: string }[]).map((l) => [l.id, l]));
                for (const l of foldIntoLists(lists, wishes, buckets, { addStarters: true, stamp: new Date().toISOString() })) {
                  if (before.get(l.id) !== l) store.put(l); // only lists that are new or changed
                }
                tx.objectStore(WISHLIST_STORE).clear();
                tx.objectStore(BUCKETLIST_STORE).clear();
              }),
            ),
          );
        }
        // Version 19: the Wishlist and Bucket list are built in. If either was deleted (or renamed) before, it comes
        // back (empty, or with its own name); every item and every other list stays exactly as it was.
        if (event.oldVersion >= 16 && event.oldVersion < 19 && db.objectStoreNames.contains(LISTS_STORE)) {
          const store = tx.objectStore(LISTS_STORE);
          const r = store.getAll();
          r.onsuccess = () => {
            const before = r.result as { id: string }[];
            const byId = new Map(before.map((l) => [l.id, l]));
            for (const l of ensureBuiltInLists(r.result, new Date().toISOString())) if (byId.get(l.id) !== l) store.put(l);
          };
        }
        // Version 17: Measurements no longer have a type: every kind is a length in cm. A weight or plain-number kind
        // keeps all its numbers exactly as they were and notes its old type and unit (formerType / formerUnit).
        if (event.oldVersion >= 1 && event.oldVersion < 17 && db.objectStoreNames.contains(MEASUREMENTS_STORE)) {
          const store = tx.objectStore(MEASUREMENTS_STORE);
          const r = store.getAll();
          r.onsuccess = () => {
            for (const k of r.result as Parameters<typeof asLengthKind>[0][]) {
              const converted = asLengthKind(k);
              if (JSON.stringify(converted) !== JSON.stringify(k)) store.put(converted);
            }
          };
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
        // If the browser (or a newer Thrive in another tab) closes this connection, forget it so the next
        // save opens a fresh one instead of failing.
        const forget = () => {
          if (current === db) {
            current = null;
            dbPromise = null;
          }
        };
        db.onversionchange = () => {
          db.close();
          forget();
        };
        db.onclose = forget;
        current = db;
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
  return withDb(
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
  return withDb(
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
  return withDb(
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

/** Add/put records into several stores in ONE transaction (nothing is cleared): all succeed, or nothing changes. */
export function idbPutMany(contents: Record<string, unknown[]>): Promise<void> {
  const names = Object.keys(contents).filter((n) => contents[n].length > 0);
  if (names.length === 0) return Promise.resolve();
  return withDb(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(names, 'readwrite');
        for (const name of names) {
          const store = tx.objectStore(name);
          for (const v of contents[name]) store.put(v);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Adding was interrupted.'));
        tx.onabort = () => reject(tx.error ?? new Error('Adding was interrupted.'));
      }),
  );
}
