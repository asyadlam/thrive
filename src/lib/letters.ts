import { LETTERS_STORE, idbDelete, idbGet, idbGetAll, idbPut } from './db';
import { isIsoTime, newId, todayKey } from './journal';
import { isDayKey } from './goals';

export const LETTER_TITLE_MAX = 100;

/** A letter to future me, as stored on this device. */
export type Letter = {
  id: string;
  title: string; // optional ('' if none)
  body: string;
  unlockDate: string; // YYYY-MM-DD; sealed until this day
  openedAt: string | null; // first time it was read
  createdAt: string;
  updatedAt: string;
};

/** What the list is allowed to see: never the letter text. */
export type LetterSummary = Pick<Letter, 'id' | 'title' | 'unlockDate' | 'openedAt' | 'createdAt'> & {
  ready: boolean;
};

/**
 * "Today" for unlocking letters. While developing (npm run dev ONLY) it can be
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

/** Earliest allowed unlock date: tomorrow. */
export function tomorrowKey(): string {
  const [y, m, d] = letterToday().split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + 1));
}

export async function listLetterSummaries(): Promise<LetterSummary[]> {
  const all = await idbGetAll<Letter>(LETTERS_STORE);
  const summaries = all.map(({ id, title, unlockDate, openedAt, createdAt }) => ({
    id,
    title,
    unlockDate,
    openedAt,
    createdAt,
    ready: isUnlocked(unlockDate),
  }));
  // Ready to open (unread) first, then still-sealed by soonest date, then already opened.
  const rank = (l: LetterSummary) => (l.ready && !l.openedAt ? 0 : !l.ready ? 1 : 2);
  return summaries.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 2 ? (b.openedAt ?? '').localeCompare(a.openedAt ?? '') : a.unlockDate.localeCompare(b.unlockDate)),
  );
}

export async function sealLetter(draft: { title: string; body: string; unlockDate: string }): Promise<Letter> {
  if (!draft.body.trim()) throw new Error('A letter needs some words.');
  if (!isDayKey(draft.unlockDate) || draft.unlockDate <= letterToday()) throw new Error('Pick a day after today.');
  const now = new Date().toISOString();
  const letter: Letter = {
    id: `letter-${newId()}`,
    title: draft.title.trim().slice(0, LETTER_TITLE_MAX),
    body: draft.body,
    unlockDate: draft.unlockDate,
    openedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await idbPut(LETTERS_STORE, letter);
  return letter;
}

export type OpenResult =
  | { state: 'missing' }
  | { state: 'sealed'; letter: LetterSummary } // no text, ever
  | { state: 'open'; letter: Letter };

/** The ONLY way to get a letter's text: refuses (and leaves out the text) before the unlock date. */
export async function openLetter(id: string): Promise<OpenResult> {
  const letter = await idbGet<Letter>(LETTERS_STORE, id);
  if (!letter) return { state: 'missing' };
  if (!isUnlocked(letter.unlockDate)) {
    const { title, unlockDate, openedAt, createdAt } = letter;
    return { state: 'sealed', letter: { id, title, unlockDate, openedAt, createdAt, ready: false } };
  }
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
  return all.map(({ body, ...rest }) => (isUnlocked(rest.unlockDate) ? { ...rest, body } : { ...rest, sealedBody: encode(body) }));
}

export const listAllLetterIds = async () => (await idbGetAll<Letter>(LETTERS_STORE)).map((l) => l.id);

/** Check one letter from a backup file; null if unusable. Fills missing id/timestamps. */
export function letterFromBackup(raw: unknown): Letter | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  if (!isDayKey(l.unlockDate)) return null;
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
  return {
    ...(rest as object),
    id: typeof l.id === 'string' && l.id.startsWith('letter-') ? l.id : `letter-${newId()}`,
    title: typeof l.title === 'string' ? l.title : '',
    body,
    unlockDate: l.unlockDate,
    openedAt: isIsoTime(l.openedAt) ? l.openedAt : null,
    createdAt,
    updatedAt: isIsoTime(l.updatedAt) ? l.updatedAt : createdAt,
  } as Letter;
}
