import {
  MOODS,
  formatLongDay,
  formatTime,
  isIsoTime,
  listAllEntries,
  newId,
  quickId,
  todayKey,
  withMetadata,
  type JournalEntry,
  type Mood,
} from './journal';
import { loadSettings, normalizeSettings, saveSettings, type AppSettings } from './settings';
import { goalFromBackup, listAllGoals, type Goal } from './goals';
import {
  AFFIRMATIONS_STORE,
  GOALS_STORE,
  HABITS_STORE,
  JOURNAL_STORE,
  JOURNEYS_STORE,
  LISTS_STORE,
  LETTERS_STORE,
  POSITIVES_STORE,
  idbReplaceStores,
} from './db';
import { habitFromBackup, listHabits, type Habit } from './habits';
import { listFromBackup, listLists, type UserList } from './lists';
import { journeyFromBackup, listJourneys, type Journey } from './journeys';
import { affirmationFromBackup, listCustomAffirmations, type CustomAffirmation } from './affirmations';
import { letterFromBackup, lettersForBackup, type BackupLetter, type Letter } from './letters';
import { listStandalonePositives, positiveFromBackup, type StandalonePositive } from './positives';

/* Backup file format:
   version 1: { app: "thrive", kind: "backup", version: 1, exportedAt, settings, entries: [...] }
   version 2: same, plus goals: [...]
   version 3: same, plus positives: [...] (positives saved on their own)
   version 4: same, plus letters: [...] (Time Capsule; sealed ones keep their text encoded in "sealedBody")
   version 5: letters may have sealType "milestone" with a milestone (event text) and unsealedAt, instead of an unlockDate
   version 6: same, plus affirmations: [...] (my own; built-in ones aren't included)
   version 7: same, plus habits: [...] (habit swaps from My Life)
   version 8: same, plus lists: [...] (each list holds its items)
   version 9: same, plus journeys: [...] (Fear & Confidence; each journey holds its ladder of steps) */
const FORMAT = { app: 'thrive', kind: 'backup', version: 9 } as const;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export type Backup = typeof FORMAT & {
  exportedAt: string;
  settings: AppSettings;
  entries: JournalEntry[];
  goals: Goal[];
  positives: StandalonePositive[];
  letters: BackupLetter[];
  affirmations: CustomAffirmation[];
  habits: Habit[];
  lists: UserList[];
  journeys: Journey[];
};

export async function buildBackup(): Promise<Backup> {
  return {
    ...FORMAT,
    exportedAt: new Date().toISOString(),
    settings: loadSettings(),
    entries: await listAllEntries(),
    goals: await listAllGoals(),
    positives: await listStandalonePositives(),
    letters: await lettersForBackup(),
    affirmations: await listCustomAffirmations(),
    habits: await listHabits(),
    lists: await listLists(),
    journeys: await listJourneys(),
  };
}

export const backupFileName = () => `thrive-backup-${todayKey()}.json`;
export const readableFileName = () => `thrive-journal-${todayKey()}.txt`;

/** Save text as a file through the browser's normal download. */
export function downloadFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* ---------- Restore: read + check a file BEFORE anything changes ---------- */

export class BackupError extends Error {}

const isDayKey = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00`));
const isStr = (v: unknown): v is string => typeof v === 'string';

function checkEntry(raw: unknown, i: number): JournalEntry {
  const fail = (why: string) => {
    throw new BackupError(`Entry ${i + 1} in this backup isn't valid (${why}).`);
  };
  if (!raw || typeof raw !== 'object') fail('not an entry');
  const e = raw as Record<string, unknown>;
  if (!isDayKey(e.date)) fail('missing date');
  const date = e.date as string;

  if (e.type === 'quick') {
    if (!MOODS.includes(e.mood as Mood)) fail('unknown mood');
    if (!Array.isArray(e.positives) || !e.positives.every(isStr)) fail('positives');
    if (!isStr(e.note) || !isStr(e.intention)) fail('note or intention');
    // One quick entry per day: its id is always based on the date.
    return withMetadata({ ...(e as object), type: 'quick', date, id: quickId(date) } as JournalEntry);
  }
  if (e.type === 'talk') {
    if (!isStr(e.title) || !isStr(e.body)) fail('title or text');
    const id = isStr(e.id) && e.id.startsWith('talk-') ? e.id : `talk-${newId()}`;
    return withMetadata({ ...(e as object), type: 'talk', date, id } as JournalEntry);
  }
  return fail('unknown entry type');
}

export type CheckedBackup = {
  exportedAt: string | null;
  settings: AppSettings;
  entries: JournalEntry[];
  quickCount: number;
  talkCount: number;
  /** null = an older backup made before goals existed (current goals are kept). */
  goals: Goal[] | null;
  /** null = an older backup made before standalone positives existed (current ones are kept). */
  positives: StandalonePositive[] | null;
  /** null = an older backup made before the Time Capsule existed (current letters are kept). */
  letters: Letter[] | null;
  /** null = an older backup made before custom affirmations existed (current ones are kept). */
  affirmations: CustomAffirmation[] | null;
  /** null = an older backup made before habits existed (current habits are kept). */
  habits: Habit[] | null;
  /** null = an older backup made before lists existed (current lists are kept). */
  lists: UserList[] | null;
  /** null = an older backup made before Fear & Confidence journeys existed (current ones are kept). */
  journeys: Journey[] | null;
};

export async function readBackupFile(file: File): Promise<CheckedBackup> {
  if (file.size > MAX_FILE_BYTES) throw new BackupError('That file is too large to be a Thrive backup.');
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new BackupError("That file isn't a Thrive backup (it couldn't be read).");
  }
  const d = data as Record<string, unknown> | null;
  if (!d || d.app !== FORMAT.app || d.kind !== FORMAT.kind) {
    throw new BackupError("That file isn't a Thrive backup.");
  }
  if (typeof d.version !== 'number' || d.version > FORMAT.version) {
    throw new BackupError('This backup was made by a newer version of Thrive.');
  }
  if (!Array.isArray(d.entries)) throw new BackupError("This backup doesn't contain any journal entries list.");

  // Check every entry first; if two share an id, keep the most recently edited one.
  const byId = new Map<string, JournalEntry>();
  d.entries.forEach((raw, i) => {
    const entry = checkEntry(raw, i);
    const existing = byId.get(entry.id);
    if (!existing || existing.updatedAt < entry.updatedAt) byId.set(entry.id, entry);
  });
  const entries = [...byId.values()];

  let goals: Goal[] | null = null;
  if (d.goals !== undefined) {
    if (!Array.isArray(d.goals)) throw new BackupError("This backup's goals list isn't valid.");
    const goalsById = new Map<string, Goal>();
    d.goals.forEach((raw, i) => {
      const goal = goalFromBackup(raw);
      if (!goal) throw new BackupError(`Goal ${i + 1} in this backup isn't valid (missing title).`);
      const existing = goalsById.get(goal.id);
      if (!existing || existing.updatedAt < goal.updatedAt) goalsById.set(goal.id, goal);
    });
    goals = [...goalsById.values()];
  }

  let positives: StandalonePositive[] | null = null;
  if (d.positives !== undefined) {
    if (!Array.isArray(d.positives)) throw new BackupError("This backup's positives list isn't valid.");
    const positivesById = new Map<string, StandalonePositive>();
    d.positives.forEach((raw, i) => {
      const positive = positiveFromBackup(raw);
      if (!positive) throw new BackupError(`Positive ${i + 1} in this backup isn't valid (missing text or date).`);
      const existing = positivesById.get(positive.id);
      if (!existing || existing.updatedAt < positive.updatedAt) positivesById.set(positive.id, positive);
    });
    positives = [...positivesById.values()];
  }

  let letters: Letter[] | null = null;
  if (d.letters !== undefined) {
    if (!Array.isArray(d.letters)) throw new BackupError("This backup's letters list isn't valid.");
    const lettersById = new Map<string, Letter>();
    d.letters.forEach((raw, i) => {
      const letter = letterFromBackup(raw);
      if (!letter) throw new BackupError(`Letter ${i + 1} in this backup isn't valid (missing text, or its date or event).`);
      const existing = lettersById.get(letter.id);
      if (!existing || existing.updatedAt < letter.updatedAt) lettersById.set(letter.id, letter);
    });
    letters = [...lettersById.values()];
  }

  let affirmations: CustomAffirmation[] | null = null;
  if (d.affirmations !== undefined) {
    if (!Array.isArray(d.affirmations)) throw new BackupError("This backup's affirmations list isn't valid.");
    const affirmationsById = new Map<string, CustomAffirmation>();
    d.affirmations.forEach((raw, i) => {
      const affirmation = affirmationFromBackup(raw);
      if (!affirmation) throw new BackupError(`Affirmation ${i + 1} in this backup isn't valid (missing text).`);
      const existing = affirmationsById.get(affirmation.id);
      if (!existing || existing.updatedAt < affirmation.updatedAt) affirmationsById.set(affirmation.id, affirmation);
    });
    affirmations = [...affirmationsById.values()];
  }

  let habits: Habit[] | null = null;
  if (d.habits !== undefined) {
    if (!Array.isArray(d.habits)) throw new BackupError("This backup's habits list isn't valid.");
    const habitsById = new Map<string, Habit>();
    d.habits.forEach((raw, i) => {
      const habit = habitFromBackup(raw);
      if (!habit) throw new BackupError(`Habit ${i + 1} in this backup isn't valid (missing "When this happens" or "Instead, I can").`);
      const existing = habitsById.get(habit.id);
      if (!existing || existing.updatedAt < habit.updatedAt) habitsById.set(habit.id, habit);
    });
    habits = [...habitsById.values()];
  }

  let lists: UserList[] | null = null;
  if (d.lists !== undefined) {
    if (!Array.isArray(d.lists)) throw new BackupError("This backup's lists aren't valid.");
    const listsById = new Map<string, UserList>();
    d.lists.forEach((raw, i) => {
      const list = listFromBackup(raw);
      if (!list) throw new BackupError(`List ${i + 1} in this backup isn't valid (missing a title, or an item without text).`);
      const existing = listsById.get(list.id);
      if (!existing || existing.updatedAt < list.updatedAt) listsById.set(list.id, list);
    });
    lists = [...listsById.values()];
  }

  let journeys: Journey[] | null = null;
  if (d.journeys !== undefined) {
    if (!Array.isArray(d.journeys)) throw new BackupError("This backup's journeys aren't valid.");
    const journeysById = new Map<string, Journey>();
    d.journeys.forEach((raw, i) => {
      const journey = journeyFromBackup(raw);
      if (!journey) throw new BackupError(`Journey ${i + 1} in this backup isn't valid (missing a title, or a step without text).`);
      const existing = journeysById.get(journey.id);
      if (!existing || existing.updatedAt < journey.updatedAt) journeysById.set(journey.id, journey);
    });
    journeys = [...journeysById.values()];
  }
  return {
    exportedAt: isIsoTime(d.exportedAt) ? d.exportedAt : null,
    settings: normalizeSettings(d.settings),
    entries,
    quickCount: entries.filter((e) => e.type === 'quick').length,
    talkCount: entries.filter((e) => e.type === 'talk').length,
    goals,
    positives,
    letters,
    affirmations,
    habits,
    lists,
    journeys,
  };
}

/** Replace everything in the app with a checked backup. All journal data, goals, positives, letters, affirmations, habits, lists and journeys are swapped in one step. */
export async function applyBackup(backup: CheckedBackup): Promise<void> {
  const stores: Record<string, unknown[]> = { [JOURNAL_STORE]: backup.entries };
  if (backup.goals) stores[GOALS_STORE] = backup.goals;
  if (backup.positives) stores[POSITIVES_STORE] = backup.positives;
  if (backup.letters) stores[LETTERS_STORE] = backup.letters;
  if (backup.affirmations) stores[AFFIRMATIONS_STORE] = backup.affirmations;
  if (backup.habits) stores[HABITS_STORE] = backup.habits;
  if (backup.lists) stores[LISTS_STORE] = backup.lists;
  if (backup.journeys) stores[JOURNEYS_STORE] = backup.journeys;
  await idbReplaceStores(stores);
  saveSettings(backup.settings);
}

/* ---------- Readable copy ---------- */

export async function buildReadableText(): Promise<string> {
  const entries = await listAllEntries();
  const lines: string[] = [`Thrive journal`, `Exported ${formatLongDay(todayKey())} · ${entries.length} entries`, ''];
  if (entries.length === 0) lines.push('No entries yet.');
  for (const e of entries) {
    lines.push('────────────────────────────────', formatLongDay(e.date));
    if (e.type === 'quick') {
      lines.push(`Quick entry · ${formatTime(e.createdAt)}`, `Mood: ${e.mood}`);
      if (e.positives.length) lines.push('One positive:', ...e.positives.map((p) => `  • ${p}`));
      if (e.note) lines.push(`Note: ${e.note}`);
      if (e.intention) lines.push(`Tomorrow's intention: ${e.intention}`);
    } else {
      lines.push(`Journal page · ${formatTime(e.createdAt)}`);
      if (e.title) lines.push(`Title: ${e.title}`);
      lines.push('', e.body);
    }
    lines.push('');
  }
  return lines.join('\n');
}
