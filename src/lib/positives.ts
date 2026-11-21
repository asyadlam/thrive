import { POSITIVES_STORE, idbGetAll, idbPut } from './db';
import { LIMITS, isIsoTime, listAllEntries, newId, todayKey } from './journal';
import { isDayKey } from './goals';

/** A positive saved on its own, without a journal entry. */
export type StandalonePositive = {
  id: string;
  text: string;
  date: string; // YYYY-MM-DD, the day it was saved
  createdAt: string;
  updatedAt: string;
};

/** One item in the combined collection (from a quick entry or saved on its own). */
export type PositiveItem = {
  key: string;
  text: string;
  date: string;
  source: 'journal' | 'standalone';
  createdAt: string;
};

export const POSITIVE_MAX = LIMITS.positive;

export const listStandalonePositives = () => idbGetAll<StandalonePositive>(POSITIVES_STORE);

export async function addStandalonePositive(text: string): Promise<StandalonePositive> {
  const now = new Date().toISOString();
  const positive: StandalonePositive = {
    id: `positive-${newId()}`,
    text: text.trim().slice(0, POSITIVE_MAX),
    date: todayKey(),
    createdAt: now,
    updatedAt: now,
  };
  await idbPut(POSITIVES_STORE, positive);
  return positive;
}

/**
 * Every positive, newest day first: the "One positive" lines from quick entries
 * (read straight from the journal, never copied) plus standalone ones.
 */
export async function listAllPositives(): Promise<PositiveItem[]> {
  const [entries, standalone] = await Promise.all([listAllEntries(), listStandalonePositives()]);
  const items: PositiveItem[] = [];
  for (const e of entries) {
    if (e.type !== 'quick') continue;
    e.positives.forEach((text, i) => {
      if (text.trim()) items.push({ key: `${e.id}#${i}`, text, date: e.date, source: 'journal', createdAt: e.createdAt });
    });
  }
  for (const p of standalone) {
    items.push({ key: p.id, text: p.text, date: p.date, source: 'standalone', createdAt: p.createdAt });
  }
  // Newest day first; within a day, most recently written first (lines of one entry keep their order).
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** Check one standalone positive from a backup file; null if unusable. Fills missing id/timestamps. */
export function positiveFromBackup(raw: unknown): StandalonePositive | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.text !== 'string' || !p.text.trim() || !isDayKey(p.date)) return null;
  const createdAt = isIsoTime(p.createdAt)
    ? p.createdAt
    : isIsoTime(p.updatedAt)
      ? p.updatedAt
      : new Date(`${p.date}T12:00:00`).toISOString();
  return {
    ...(p as object),
    id: typeof p.id === 'string' && p.id.startsWith('positive-') ? p.id : `positive-${newId()}`,
    text: p.text,
    date: p.date,
    createdAt,
    updatedAt: isIsoTime(p.updatedAt) ? p.updatedAt : createdAt,
  } as StandalonePositive;
}
