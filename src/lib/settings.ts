// App settings, kept on this device in localStorage (separate from journal entries).

export const PET_KINDS = ['hippo', 'cat', 'platypus', 'panda', 'dog'] as const;
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
  /** My Life "About me": birthday as "MM-DD" (no year), or '' if not set. */
  birthday: string;
  /** My Life "About me": the year I was born (optional, only kept with a birthday), or null if not set. */
  birthYear: number | null;
  /** My Life "About me": a one-line description ('' if not set). */
  aboutMe: string;
  /** My Life "About me": blood type, one of BLOOD_TYPES, or '' if not set. Optional; nothing relies on it. */
  bloodType: BloodType | '';
  /** Journal "Health Journey": shown only when I turn it on in Settings (off by default). */
  showHealth: boolean;
  /** Journal "Dreams & Nightmares": shown only when I turn it on in Settings (off by default). */
  showDreams: boolean;
  /** My Life "About me": height in cm, or null if not set. A single current value, not a history. */
  heightCm: number | null;
  /** My Life "About me": weight in kg, or null if not set. A single current value, not a history. */
  weightKg: number | null;
  /** Daily Sprout targets: calories, protein (g), added sugar (g) and glasses of water a day. */
  calorieTarget: number;
  proteinTarget: number;
  addedSugarTarget: number;
  waterTarget: number;
  /** Which set of default targets these settings were made with (see TARGETS_VERSION). */
  targetsVersion: number;
};

/** Daily Sprout targets: starting values and sensible bounds (whole numbers). */
export const TARGETS = {
  calorieTarget: { start: 2000, min: 500, max: 10000, label: 'Calories', unit: 'kcal' },
  proteinTarget: { start: 80, min: 1, max: 500, label: 'Protein', unit: 'g' },
  addedSugarTarget: { start: 25, min: 0, max: 500, label: 'Added sugar', unit: 'g' },
  waterTarget: { start: 8, min: 1, max: 20, label: 'Water', unit: 'glasses' },
} as const;
export type TargetKey = keyof typeof TARGETS;

/**
 * Version 2: the default calorie target went from 1,600 to 2,000. Settings saved before that (no version, and
 * still exactly the old 1,600 default) move to 2,000; any other calorie target is the person's own and stays.
 * From version 2 on, a 1,600 someone types in themselves is kept like any other number.
 */
export const TARGETS_VERSION = 2;
const OLD_CALORIE_DEFAULT = 1600;
const target = (v: unknown, key: TargetKey) => {
  const t = TARGETS[key];
  return typeof v === 'number' && Number.isInteger(v) && v >= t.min && v <= t.max ? v : t.start;
};

/** Sensible bounds for the About me height (cm) and weight (kg) fields. */
export const HEIGHT_CM = { min: 30, max: 300 } as const;
export const WEIGHT_KG = { min: 1, max: 700 } as const;
const inRange = (v: unknown, r: { min: number; max: number }): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= r.min && v <= r.max;
/** One decimal at most. */
export const roundOne = (n: number) => Math.round(n * 10) / 10;

/** 165 → "5 ft 5 in" (whole inches). */
export function feetAndInches(cm: number): string {
  const total = Math.round(cm / 2.54);
  return `${Math.floor(total / 12)} ft ${total % 12} in`;
}
/** 60 → "132.3 lb". */
export const poundsFrom = (kg: number) => `${(Math.round((kg / 0.45359237) * 10) / 10).toFixed(1)} lb`;
/** "165 cm" / "60.5 kg" without a trailing ".0". */
export const showNumber = (n: number) => String(roundOne(n));

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Not sure'] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];
const isBloodType = (v: unknown): v is BloodType => BLOOD_TYPES.includes(v as BloodType);

export const PET_NAME_MAX = 20;
export const USER_NAME_MAX = 30;
export const ABOUT_ME_MAX = 120;

/** "03-04" → valid month/day (Feb 29 allowed). */
export const isBirthday = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{2}-\d{2}$/.test(v)) return false;
  const [m, d] = v.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(2024, m, 0).getDate();
};

/** Earliest year the birthday year picker offers. */
export const FIRST_BIRTH_YEAR = 1900;

/** A year that fits this birthday: a whole year from 1900 to this year, and a real date (no Feb 29 in 2023). */
export function isBirthYear(year: unknown, birthday: string): year is number {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < FIRST_BIRTH_YEAR || year > new Date().getFullYear()) return false;
  if (!isBirthday(birthday)) return false;
  const [m, d] = birthday.split('-').map(Number);
  return d <= new Date(year, m, 0).getDate();
}

/** "03-04" → "March 4"; with a year, "March 4, 1998". */
export function formatBirthday(v: string, year: number | null = null): string {
  if (!isBirthday(v)) return '';
  const [m, d] = v.split('-').map(Number);
  if (year !== null && isBirthYear(year, v)) {
    return new Date(year, m - 1, d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }
  return new Date(2024, m - 1, d).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

const KEY = 'thrive.settings';
const DEFAULTS: AppSettings = {
  companion: 'none',
  petName: '',
  readLessons: [],
  userName: '',
  companionMemory: false,
  birthday: '',
  birthYear: null,
  aboutMe: '',
  bloodType: '',
  heightCm: null,
  weightKg: null,
  calorieTarget: TARGETS.calorieTarget.start,
  proteinTarget: TARGETS.proteinTarget.start,
  addedSugarTarget: TARGETS.addedSugarTarget.start,
  waterTarget: TARGETS.waterTarget.start,
  targetsVersion: TARGETS_VERSION,
  showHealth: false,
  showDreams: false,
};

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
    birthday: isBirthday(parsed.birthday) ? parsed.birthday : '',
    birthYear: isBirthday(parsed.birthday) && isBirthYear(parsed.birthYear, parsed.birthday) ? parsed.birthYear : null,
    aboutMe: typeof parsed.aboutMe === 'string' ? parsed.aboutMe.slice(0, ABOUT_ME_MAX) : '',
    bloodType: isBloodType(parsed.bloodType) ? parsed.bloodType : '',
    showHealth: parsed.showHealth === true, // only ever on by my own choice
    showDreams: parsed.showDreams === true,
    heightCm: inRange(parsed.heightCm, HEIGHT_CM) ? roundOne(parsed.heightCm) : null,
    weightKg: inRange(parsed.weightKg, WEIGHT_KG) ? roundOne(parsed.weightKg) : null,
    calorieTarget:
      parsed.targetsVersion !== TARGETS_VERSION && parsed.calorieTarget === OLD_CALORIE_DEFAULT
        ? TARGETS.calorieTarget.start // still on the old default: the new default
        : target(parsed.calorieTarget, 'calorieTarget'),
    proteinTarget: target(parsed.proteinTarget, 'proteinTarget'),
    addedSugarTarget: target(parsed.addedSugarTarget, 'addedSugarTarget'),
    waterTarget: target(parsed.waterTarget, 'waterTarget'),
    targetsVersion: TARGETS_VERSION,
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

/** Fired after settings are saved (the automatic cloud backup listens). */
export const SETTINGS_SAVED = 'thrive:settings-saved';

/** Returns false if the browser refused to save (e.g. storage blocked). */
export function saveSettings(settings: AppSettings): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event(SETTINGS_SAVED)); // the automatic cloud backup follows changes here too
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
