import {
  MOODS,
  formatLongDay,
  formatTime,
  isIsoTime,
  listAllEntries,
  newId,
  quickId,
  replaceAllEntries,
  todayKey,
  withMetadata,
  type JournalEntry,
  type Mood,
} from './journal';
import { loadSettings, normalizeSettings, saveSettings, type AppSettings } from './settings';

/* Backup file format (version 1):
   { app: "thrive", kind: "backup", version: 1, exportedAt, settings, entries: [...] } */
const FORMAT = { app: 'thrive', kind: 'backup', version: 1 } as const;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export type Backup = typeof FORMAT & {
  exportedAt: string;
  settings: AppSettings;
  entries: JournalEntry[];
};

export async function buildBackup(): Promise<Backup> {
  return {
    ...FORMAT,
    exportedAt: new Date().toISOString(),
    settings: loadSettings(),
    entries: await listAllEntries(),
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
  return {
    exportedAt: isIsoTime(d.exportedAt) ? d.exportedAt : null,
    settings: normalizeSettings(d.settings),
    entries,
    quickCount: entries.filter((e) => e.type === 'quick').length,
    talkCount: entries.filter((e) => e.type === 'talk').length,
  };
}

/** Replace everything in the app with a checked backup. Entries are swapped in one step. */
export async function applyBackup(backup: CheckedBackup): Promise<void> {
  await replaceAllEntries(backup.entries);
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
