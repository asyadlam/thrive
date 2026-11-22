// App settings, kept on this device in localStorage (separate from journal entries).

export const PET_KINDS = ['hippo', 'cat', 'platypus'] as const;
export type PetKind = (typeof PET_KINDS)[number];
export type Companion = PetKind | 'none';

export type AppSettings = {
  companion: Companion;
  petName: string;
  /** Ids of Learn lessons I've marked "Finished reading". */
  readLessons: string[];
  /** "What should Thrive call you?" ('' = greet without a name). */
  userName: string;
  /** Companion memory: off unless I turn it on. When off, notes are kept but never used or proposed. */
  companionMemory: boolean;
};

export const PET_NAME_MAX = 20;
export const USER_NAME_MAX = 30;

const KEY = 'thrive.settings';
const DEFAULTS: AppSettings = { companion: 'none', petName: '', readLessons: [], userName: '', companionMemory: false };

/** Earlier versions called the hippo "yoshi"; keep that choice instead of resetting it. */
const RENAMED: Record<string, Companion> = { yoshi: 'hippo' };

function toCompanion(v: unknown): Companion {
  if (typeof v !== 'string') return DEFAULTS.companion;
  const value = RENAMED[v] ?? v;
  return value === 'none' || PET_KINDS.includes(value as PetKind) ? (value as Companion) : DEFAULTS.companion;
}

/** Turn anything (saved JSON, a backup file) into valid settings, using defaults for bad values. */
export function normalizeSettings(value: unknown): AppSettings {
  const parsed = (value && typeof value === 'object' ? value : {}) as Partial<AppSettings>;
  return {
    companion: toCompanion(parsed.companion),
    petName: typeof parsed.petName === 'string' ? parsed.petName.slice(0, PET_NAME_MAX) : DEFAULTS.petName,
    readLessons: Array.isArray(parsed.readLessons)
      ? [...new Set(parsed.readLessons.filter((id): id is string => typeof id === 'string'))]
      : [],
    userName: typeof parsed.userName === 'string' ? parsed.userName.slice(0, USER_NAME_MAX) : DEFAULTS.userName,
    companionMemory: parsed.companionMemory === true, // only ever on by my own choice
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULTS, readLessons: [] };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Returns false if the browser refused to save (e.g. storage blocked). */
export function saveSettings(settings: AppSettings): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** Mark a Learn lesson as read (or not). Saved with the rest of the app settings. */
export function setLessonRead(id: string, read: boolean): AppSettings {
  const current = loadSettings();
  const others = current.readLessons.filter((x) => x !== id);
  const next = { ...current, readLessons: read ? [...others, id] : others };
  saveSettings(next);
  return next;
}

/* ---------- Last backup date (device info, not part of the backup itself) ---------- */

const LAST_BACKUP_KEY = 'thrive.lastBackupAt';

export function getLastBackupAt(): string | null {
  try {
    const v = localStorage.getItem(LAST_BACKUP_KEY);
    return v && !Number.isNaN(Date.parse(v)) ? v : null;
  } catch {
    return null;
  }
}

export function setLastBackupAt(iso: string): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, iso);
  } catch {
    /* storage blocked: nothing else to do */
  }
}
