import { JOURNAL_STORE, TYPE_DATE_INDEX, idbDelete, idbGet, idbGetAll, idbGetAllFromIndex, idbPut, idbReplaceAll } from './db';

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
  /** Summaries saved from "Talk about this" chats (shown under "From your talk"). Each save adds one. */
  talkSummaries?: TalkSummary[];
  /** Older single-summary field, from before summaries became a list. Read only to migrate it. */
  talkSummary?: string;
};

/** "Sunday, November 22, 2026 at 9:41 PM" for a saved summary. */
export const formatTalkSummaryDate = (iso: string) => `${formatLongDay(todayKey(new Date(iso)))} at ${formatTime(iso)}`;

/** One line of a saved chat: who said it and what they said. */
export type TranscriptLine = { role: 'user' | 'assistant'; text: string };

/**
 * One saved summary of a "Talk about this" conversation. `transcript` is that chat, kept only because the
 * summary was saved (summaries saved before transcripts existed don't have one).
 */
export type TalkSummary = { id: string; text: string; createdAt: string; transcript?: TranscriptLine[] };

/** Keeps only well-formed transcript lines (used when saving and when reading a backup). */
export function cleanTranscript(raw: unknown): TranscriptLine[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const lines = raw
    .filter(
      (l): l is TranscriptLine =>
        !!l && ((l as TranscriptLine).role === 'user' || (l as TranscriptLine).role === 'assistant') && typeof (l as TranscriptLine).text === 'string',
    )
    .map((l) => ({ role: l.role, text: l.text }));
  return lines.length ? lines : undefined;
}

/** The id an old single summary gets when it becomes the first item of the list (the same everywhere). */
export const legacySummaryId = (entryId: string) => `summary-${entryId}-legacy`;

const isSummary = (v: unknown): v is TalkSummary =>
  !!v &&
  typeof (v as TalkSummary).id === 'string' &&
  typeof (v as TalkSummary).text === 'string' &&
  typeof (v as TalkSummary).createdAt === 'string';

/** All of an entry's saved summaries, oldest first, including an old single summary (migrated). */
export function talkSummariesOf(entry: TalkEntry): TalkSummary[] {
  const list = Array.isArray(entry.talkSummaries) ? entry.talkSummaries.filter(isSummary) : [];
  const old = typeof entry.talkSummary === 'string' ? entry.talkSummary.trim() : '';
  const legacyId = legacySummaryId(entry.id);
  if (old && !list.some((s) => s.id === legacyId)) list.unshift({ id: legacyId, text: old, createdAt: entry.updatedAt });
  return list;
}

/** The entry in the current shape: summaries as a list, the old single field gone. */
export function withSummaryList<T extends TalkEntry>(entry: T): T {
  const summaries = talkSummariesOf(entry);
  const { talkSummary: _old, talkSummaries: _list, ...rest } = entry;
  void _old;
  void _list;
  return (summaries.length ? { ...rest, talkSummaries: summaries } : rest) as T;
}

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

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function keepStorage() {
  // Ask the browser not to clear Thrive's data when space runs low (best effort).
  navigator.storage?.persist?.().catch(() => undefined);
}

/* ---------- Quick entries ---------- */

export const quickId = (date: string) => `quick-${date}`;

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
    ...(existing && talkSummariesOf(existing).length ? { talkSummaries: talkSummariesOf(existing) } : {}), // editing keeps every talk summary
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await idbPut(JOURNAL_STORE, entry);
  keepStorage();
  return entry;
}

export const TALK_SUMMARY_MAX = 1000;

/**
 * Adds a "From your talk" summary to a journal page, together with that chat's transcript.
 * This is the only moment a chat is ever stored. Earlier summaries are always kept.
 */
export async function saveTalkSummary(entryId: string, summary: string, transcript: TranscriptLine[]): Promise<TalkEntry> {
  const existing = await getTalkEntry(entryId);
  if (!existing) throw new Error('This journal page couldn’t be found on this device.');
  const now = new Date().toISOString();
  const current = withSummaryList(existing);
  const lines = cleanTranscript(transcript);
  const added: TalkSummary = {
    id: `summary-${newId()}`,
    text: summary.trim().slice(0, TALK_SUMMARY_MAX),
    createdAt: now,
    ...(lines ? { transcript: lines } : {}),
  };
  const updated: TalkEntry = {
    ...current,
    talkSummaries: [...talkSummariesOf(current), added],
    updatedAt: now,
  };
  await idbPut(JOURNAL_STORE, updated);
  keepStorage();
  return updated;
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

/** Long date with year, e.g. "Wednesday, November 18, 2026". */
export function formatLongDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/* ---------- Whole journal (backup / restore) ---------- */

/** Every entry of both types, oldest day first (then oldest written first). */
export async function listAllEntries(): Promise<JournalEntry[]> {
  const all = await idbGetAll<JournalEntry>(JOURNAL_STORE);
  return all.sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
}

/** Replace the whole journal with these entries, all at once. */
export function replaceAllEntries(entries: JournalEntry[]): Promise<void> {
  return idbReplaceAll(JOURNAL_STORE, entries);
}

/**
 * Fill in createdAt / updatedAt on any entry that is missing them (e.g. very early
 * entries), leaving every other field exactly as it was. Ids always exist: the
 * database requires one for every entry.
 */
export function withMetadata<T extends Partial<EntryBase> & { date: string }>(entry: T): T & EntryBase {
  const fallback = new Date(`${entry.date}T12:00:00`).toISOString();
  const createdAt = isIsoTime(entry.createdAt) ? entry.createdAt : isIsoTime(entry.updatedAt) ? entry.updatedAt : fallback;
  const updatedAt = isIsoTime(entry.updatedAt) ? entry.updatedAt : createdAt;
  return { ...entry, id: entry.id as string, createdAt, updatedAt };
}

export function isIsoTime(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

/** Runs once at startup; only writes entries that actually needed fixing. */
export async function ensureEntryMetadata(): Promise<number> {
  const all = await idbGetAll<JournalEntry>(JOURNAL_STORE);
  let fixed = 0;
  for (const entry of all) {
    if (isIsoTime(entry.createdAt) && isIsoTime(entry.updatedAt)) continue;
    await idbPut(JOURNAL_STORE, withMetadata(entry));
    fixed++;
  }
  return fixed;
}
