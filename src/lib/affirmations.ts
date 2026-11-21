import { AFFIRMATIONS_STORE, idbDelete, idbGetAll, idbPut } from './db';
import { isIsoTime, newId } from './journal';

export const AFFIRMATION_MAX = 140;

/** Built into the app: calm, believable lines for hard days. These can't be deleted. */
export const BUILT_IN_AFFIRMATIONS: readonly string[] = [
  'I can do hard things one small step at a time.',
  "I don't have to have it all figured out today.",
  "It's okay to rest. Rest is part of moving forward.",
  'My feelings make sense, even the messy ones.',
  "I'm allowed to go at my own pace.",
  "I've gotten through hard days before.",
  'Small progress is still progress.',
  'I can be kind to myself, even when I get things wrong.',
  'This feeling is real, and it will pass.',
  "I'm doing what I can with what I have right now.",
  "Asking for help is a strength, not a failure.",
  'One breath, one step, one moment at a time.',
];

/** One of my own affirmations, as stored. */
export type CustomAffirmation = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

/** Anything that can be shown in the card. */
export type AffirmationItem = { key: string; text: string; mine: boolean };

export const builtInItems = (): AffirmationItem[] =>
  BUILT_IN_AFFIRMATIONS.map((text, i) => ({ key: `builtin-${i + 1}`, text, mine: false }));

/** My own affirmations, oldest first. */
export async function listCustomAffirmations(): Promise<CustomAffirmation[]> {
  const all = await idbGetAll<CustomAffirmation>(AFFIRMATIONS_STORE);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addCustomAffirmation(text: string): Promise<CustomAffirmation> {
  const now = new Date().toISOString();
  const affirmation: CustomAffirmation = {
    id: `affirmation-${newId()}`,
    text: text.trim().slice(0, AFFIRMATION_MAX),
    createdAt: now,
    updatedAt: now,
  };
  await idbPut(AFFIRMATIONS_STORE, affirmation);
  return affirmation;
}

/** Only my own can be deleted; built-in ones aren't stored, so they can't be. */
export function deleteCustomAffirmation(id: string): Promise<undefined> {
  if (!id.startsWith('affirmation-')) return Promise.reject(new Error("Built-in affirmations can't be deleted."));
  return idbDelete(AFFIRMATIONS_STORE, id);
}

/** Check one custom affirmation from a backup file; null if unusable. Fills missing id/timestamps. */
export function affirmationFromBackup(raw: unknown): CustomAffirmation | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.text !== 'string' || !a.text.trim()) return null;
  const createdAt = isIsoTime(a.createdAt) ? a.createdAt : isIsoTime(a.updatedAt) ? a.updatedAt : new Date().toISOString();
  return {
    ...(a as object),
    id: typeof a.id === 'string' && a.id.startsWith('affirmation-') ? a.id : `affirmation-${newId()}`,
    text: a.text,
    createdAt,
    updatedAt: isIsoTime(a.updatedAt) ? a.updatedAt : createdAt,
  } as CustomAffirmation;
}
