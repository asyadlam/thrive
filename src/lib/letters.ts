import { LETTERS_STORE, idbDelete, idbGet, idbGetAll, idbPut } from './db';
import { isIsoTime, newId, todayKey } from './journal';
import { isDayKey } from './goals';

export const LETTER_TITLE_MAX = 100;
export const MILESTONE_MAX = 120;

/** "date" opens on its unlock date; "milestone" opens when I confirm something happened. */
export type SealType = 'date' | 'milestone';

/** A letter to future me, as stored on this device. */
export type Letter = {
  id: string;
  title: string; // optional ('' if none)
  body: string;
  /** Older letters have no sealType: they are date letters. */
  sealType?: SealType;
  unlockDate: string; // YYYY-MM-DD for date letters; '' for milestone letters
  milestone?: string; // what I'm waiting for (milestone letters)
  unsealedAt?: string | null; // when I confirmed the milestone happened
  openedAt: string | null; // first time it was read
  createdAt: string;
  updatedAt: string;
};

/** What the list is allowed to see: never the letter text. */
export type LetterSummary = {
  id: string;
  title: string;
  sealType: SealType;
  unlockDate: string;
  milestone: string;
  openedAt: string | null;
  createdAt: string;
  ready: boolean;
};

/**
 * "Today" for unlocking date letters. While developing (npm run dev ONLY) it can be
 * overridden to test unlocking without waiting:
 *   localStorage.setItem('thrive.dev.today', '2026-12-25')
 * Production builds ignore this completely.
 */
export function letterToday(): string {
  if (import.meta.env.DEV) {
    try {
      const override = localStorage.getItem('thrive.dev.today');
      if (isDayKey(override)) return override;
    } catch {
      /* ignore */
    }
  }
  return todayKey();
}

export const isUnlocked = (unlockDate: string) => letterToday() >= unlockDate;

export const sealTypeOf = (l: Pick<Letter, 'sealType'>): SealType => (l.sealType === 'milestone' ? 'milestone' : 'date');

/** Can this letter be read now? Date letters: on/after their day. Milestone letters: once I've confirmed. */
export function isReady(l: Letter): boolean {
  return sealTypeOf(l) === 'milestone' ? Boolean(l.unsealedAt) : isUnlocked(l.unlockDate);
}

/** Earliest allowed unlock date: tomorrow. */
export function tomorrowKey(): string {
  const [y, m, d] = letterToday().split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + 1));
}

function summarize(l: Letter): LetterSummary {
  return {
    id: l.id,
    title: l.title,
    sealType: sealTypeOf(l),
    unlockDate: l.unlockDate,
    milestone: l.milestone ?? '',
    openedAt: l.openedAt,
    createdAt: l.createdAt,
    ready: isReady(l),
  };
}

export async function listLetterSummaries(): Promise<LetterSummary[]> {
  const summaries = (await idbGetAll<Letter>(LETTERS_STORE)).map(summarize);
  // Ready to open (unread) first; then sealed date letters by soonest date; then sealed
  // milestone letters (oldest first); then letters already opened (most recent first).
  const rank = (l: LetterSummary) =>
    l.ready && !l.openedAt ? 0 : !l.ready && l.sealType === 'date' ? 1 : !l.ready ? 2 : 3;
  const within = (a: LetterSummary, b: LetterSummary) => {
    switch (rank(a)) {
      case 1:
        return a.unlockDate.localeCompare(b.unlockDate);
      case 3:
        return (b.openedAt ?? '').localeCompare(a.openedAt ?? '');
      default:
        return a.createdAt.localeCompare(b.createdAt);
    }
  };
  return summaries.sort((a, b) => rank(a) - rank(b) || within(a, b));
}

export type LetterDraft = { title: string; body: string } & (
  | { sealType: 'date'; unlockDate: string }
  | { sealType: 'milestone'; milestone: string }
);

export async function sealLetter(draft: LetterDraft): Promise<Letter> {
  if (!draft.body.trim()) throw new Error('A letter needs some words.');
  const now = new Date().toISOString();
  const base = {
    id: `letter-${newId()}`,
    title: draft.title.trim().slice(0, LETTER_TITLE_MAX),
    body: draft.body,
    openedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  let letter: Letter;
  if (draft.sealType === 'milestone') {
    const milestone = draft.milestone.trim().slice(0, MILESTONE_MAX);
    if (!milestone) throw new Error('Say what you are waiting for.');
    letter = { ...base, sealType: 'milestone', unlockDate: '', milestone, unsealedAt: null };
  } else {
    if (!isDayKey(draft.unlockDate) || draft.unlockDate <= letterToday()) throw new Error('Pick a day after today.');
    letter = { ...base, sealType: 'date', unlockDate: draft.unlockDate };
  }
  await idbPut(LETTERS_STORE, letter);
  return letter;
}

/**
 * "This happened — open it": unseals a MILESTONE letter after I confirm.
 * Refuses date letters — those only ever open on their date.
 */
export async function confirmMilestone(id: string): Promise<boolean> {
  const letter = await idbGet<Letter>(LETTERS_STORE, id);
  if (!letter || sealTypeOf(letter) !== 'milestone') return false;
  if (letter.unsealedAt) return true;
  const now = new Date().toISOString();
  await idbPut(LETTERS_STORE, { ...letter, unsealedAt: now, updatedAt: now });
  return true;
}

export type OpenResult =
  | { state: 'missing' }
  | { state: 'sealed'; letter: LetterSummary } // no text, ever
  | { state: 'open'; letter: Letter };

/** The ONLY way to get a letter's text: refuses (and leaves out the text) while it is sealed. */
export async function openLetter(id: string): Promise<OpenResult> {
  const letter = await idbGet<Letter>(LETTERS_STORE, id);
  if (!letter) return { state: 'missing' };
  if (!isReady(letter)) return { state: 'sealed', letter: summarize(letter) };
  if (!letter.openedAt) {
    const now = new Date().toISOString();
    const opened = { ...letter, openedAt: now, updatedAt: now };
    await idbPut(LETTERS_STORE, opened);
    return { state: 'open', letter: opened };
  }
  return { state: 'open', letter };
}

export const deleteLetter = (id: string) => idbDelete(LETTERS_STORE, id);

/* ---------- Backup ---------- */

// Sealed letters go into the backup file with their text encoded, so opening the
// file in a text editor doesn't spoil them at a glance. (Not encryption — just a seal.)
const encode = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};
const decode = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

export type BackupLetter = Omit<Letter, 'body'> & { body?: string; sealedBody?: string };

export async function lettersForBackup(): Promise<BackupLetter[]> {
  const all = await idbGetAll<Letter>(LETTERS_STORE);
  return all.map((letter) => {
    const { body, ...rest } = letter;
    return isReady(letter) ? { ...rest, body } : { ...rest, sealedBody: encode(body) };
  });
}

export const listAllLetterIds = async () => (await idbGetAll<Letter>(LETTERS_STORE)).map((l) => l.id);

/** Check one letter from a backup file; null if unusable. Keeps seal type + event text; fills missing id/timestamps. */
export function letterFromBackup(raw: unknown): Letter | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  const sealType: SealType = l.sealType === 'milestone' ? 'milestone' : 'date';
  if (sealType === 'date' && !isDayKey(l.unlockDate)) return null;
  if (sealType === 'milestone' && (typeof l.milestone !== 'string' || !l.milestone.trim())) return null;

  let body: string | null = null;
  if (typeof l.sealedBody === 'string') {
    try {
      body = decode(l.sealedBody);
    } catch {
      return null;
    }
  } else if (typeof l.body === 'string') {
    body = l.body;
  }
  if (body === null || !body.trim()) return null;

  const createdAt = isIsoTime(l.createdAt) ? l.createdAt : isIsoTime(l.updatedAt) ? l.updatedAt : new Date().toISOString();
  const { sealedBody: _sealed, ...rest } = l;
  void _sealed;
  const letter = {
    ...(rest as object),
    id: typeof l.id === 'string' && l.id.startsWith('letter-') ? l.id : `letter-${newId()}`,
    title: typeof l.title === 'string' ? l.title : '',
    body,
    openedAt: isIsoTime(l.openedAt) ? l.openedAt : null,
    createdAt,
    updatedAt: isIsoTime(l.updatedAt) ? l.updatedAt : createdAt,
  } as Letter;
  if (sealType === 'milestone') {
    letter.sealType = 'milestone';
    letter.unlockDate = '';
    letter.milestone = l.milestone as string;
    letter.unsealedAt = isIsoTime(l.unsealedAt) ? l.unsealedAt : null;
  } else {
    letter.unlockDate = l.unlockDate as string;
  }
  return letter;
}
