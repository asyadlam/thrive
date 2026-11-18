// App settings, kept on this device in localStorage (separate from journal entries).

export const PET_KINDS = ['hippo', 'cat', 'platypus'] as const;
export type PetKind = (typeof PET_KINDS)[number];
export type Companion = PetKind | 'none';

export type AppSettings = {
  companion: Companion;
  petName: string;
};

export const PET_NAME_MAX = 20;

const KEY = 'thrive.settings';
const DEFAULTS: AppSettings = { companion: 'none', petName: '' };

/** Earlier versions called the hippo "yoshi"; keep that choice instead of resetting it. */
const RENAMED: Record<string, Companion> = { yoshi: 'hippo' };

function toCompanion(v: unknown): Companion {
  if (typeof v !== 'string') return DEFAULTS.companion;
  const value = RENAMED[v] ?? v;
  return value === 'none' || PET_KINDS.includes(value as PetKind) ? (value as Companion) : DEFAULTS.companion;
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      companion: toCompanion(parsed.companion),
      petName: typeof parsed.petName === 'string' ? parsed.petName.slice(0, PET_NAME_MAX) : DEFAULTS.petName,
    };
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
