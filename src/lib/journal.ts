import { JOURNAL_STORE, TYPE_DATE_INDEX, idbDelete, idbGet, idbGetAllFromIndex, idbPut } from './db';

export const MOODS = ['Rough', 'Low', 'Okay', 'Good', 'Great', 'Stressed', 'Tired', 'Excited'] as const;
export type Mood = (typeof MOODS)[number];

export const MAX_POSITIVES = 3;
export const LIMITS = { positive: 120, note: 500, intention: 200, title: 100 } as const;

type EntryBase = {
  id: string;
  date: string; // local calendar day, YYYY-MM-DD
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
};

/** "Quick entry": one per day. */
export type QuickEntry = EntryBase & {
  type: 'quick';
  mood: Mood;
  positives: string[];
  note: string;
  intention: string;
};

/** "Need to talk about it": free writing, as many as you like. */
export type TalkEntry = EntryBase & {
  type: 'talk';
  title: string;
  body: string;
};

export type JournalEntry = QuickEntry | TalkEntry;

export type QuickDraft = Pick<QuickEntry, 'mood' | 'positives' | 'note' | 'intention'>;
export type TalkDraft = Pick<TalkEntry, 'title' | 'body'>;

/** Today's date in the user's own time zone, e.g. "2026-11-18". */
export function todayKey(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function keepStorage() {
  // Ask the browser not to clear Thrive's data when space runs low (best effort).
  navigator.storage?.persist?.().catch(() => undefined);
}

/* ---------- Quick entries ---------- */

const quickId = (date: string) => `quick-${date}`;

export function getQuickEntry(date: string): Promise<QuickEntry | undefined> {
  return idbGet<QuickEntry>(JOURNAL_STORE, quickId(date));
}

export async function saveQuickEntry(date: string, draft: QuickDraft, existing?: QuickEntry): Promise<QuickEntry> {
  const now = new Date().toISOString();
  const entry: QuickEntry = {
    id: quickId(date),
    type: 'quick',
    date,
    mood: draft.mood,
    positives: draft.positives.map((p) => p.trim()).filter(Boolean).slice(0, MAX_POSITIVES),
    note: draft.note.trim(),
    intention: draft.intention.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await idbPut(JOURNAL_STORE, entry);
  keepStorage();
  return entry;
}

/* ---------- "Need to talk about it" entries ---------- */

export async function getTalkEntry(id: string): Promise<TalkEntry | undefined> {
  const entry = await idbGet<JournalEntry>(JOURNAL_STORE, id);
  return entry?.type === 'talk' ? entry : undefined;
}

export async function saveTalkEntry(draft: TalkDraft, existing?: TalkEntry): Promise<TalkEntry> {
  const now = new Date().toISOString();
  const entry: TalkEntry = {
    id: existing?.id ?? `talk-${newId()}`,
    type: 'talk',
    date: existing?.date ?? todayKey(),
    title: draft.title.trim(),
    body: draft.body, // kept exactly as written; no length limit
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await idbPut(JOURNAL_STORE, entry);
  keepStorage();
  return entry;
}

export async function listTalkEntries(date: string): Promise<TalkEntry[]> {
  const entries = await idbGetAllFromIndex<TalkEntry>(JOURNAL_STORE, TYPE_DATE_INDEX, ['talk', date]);
  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function talkEntryLabel(entry: TalkEntry): string {
  return entry.title || 'Untitled';
}

/* ---------- Any entry type (used by Look back) ---------- */

export function getEntry(id: string): Promise<JournalEntry | undefined> {
  return idbGet<JournalEntry>(JOURNAL_STORE, id);
}

export function deleteEntry(id: string): Promise<undefined> {
  return idbDelete(JOURNAL_STORE, id);
}

/** All entries (both types) whose date falls between two YYYY-MM-DD keys, inclusive. */
export async function listEntriesBetween(start: string, end: string): Promise<JournalEntry[]> {
  const range = (type: JournalEntry['type']) => IDBKeyRange.bound([type, start], [type, end]);
  const [quick, talk] = await Promise.all([
    idbGetAllFromIndex<QuickEntry>(JOURNAL_STORE, TYPE_DATE_INDEX, range('quick')),
    idbGetAllFromIndex<TalkEntry>(JOURNAL_STORE, TYPE_DATE_INDEX, range('talk')),
  ]);
  return [...quick, ...talk];
}

/** Short date like "Wed, Nov 18". */
export function formatShortDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
