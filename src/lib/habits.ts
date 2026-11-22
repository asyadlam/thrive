import { HABITS_STORE, idbDelete, idbGetAll, idbPut } from './db';
import { isIsoTime, newId } from './journal';

export const HABIT_FIELD_MAX = 140;

/** A habit swap: when <trigger> happens, instead of <oldHabit>, I can <newHabit>. A plan, not a tracker. */
export type Habit = {
  id: string;
  trigger: string; // "When this happens"
  oldHabit: string; // "I usually" (optional, '' if none)
  newHabit: string; // "Instead, I can"
  createdAt: string;
  updatedAt: string;
};

export type HabitDraft = Pick<Habit, 'trigger' | 'oldHabit' | 'newHabit'>;

const clean = (v: string) => v.trim().slice(0, HABIT_FIELD_MAX);

/** All habits, in the order I added them. */
export async function listHabits(): Promise<Habit[]> {
  const all = await idbGetAll<Habit>(HABITS_STORE);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveHabit(draft: HabitDraft, existing?: Habit): Promise<Habit> {
  const now = new Date().toISOString();
  const habit: Habit = {
    id: existing?.id ?? `habit-${newId()}`,
    trigger: clean(draft.trigger),
    oldHabit: clean(draft.oldHabit),
    newHabit: clean(draft.newHabit),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await idbPut(HABITS_STORE, habit);
  return habit;
}

export const deleteHabit = (id: string) => idbDelete(HABITS_STORE, id);

/** Check one habit from a backup file; null if unusable. Fills missing id/timestamps. */
export function habitFromBackup(raw: unknown): Habit | null {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, unknown>;
  if (typeof h.trigger !== 'string' || !h.trigger.trim()) return null;
  if (typeof h.newHabit !== 'string' || !h.newHabit.trim()) return null;
  const createdAt = isIsoTime(h.createdAt) ? h.createdAt : isIsoTime(h.updatedAt) ? h.updatedAt : new Date().toISOString();
  return {
    ...(h as object),
    id: typeof h.id === 'string' && h.id.startsWith('habit-') ? h.id : `habit-${newId()}`,
    trigger: h.trigger,
    oldHabit: typeof h.oldHabit === 'string' ? h.oldHabit : '',
    newHabit: h.newHabit,
    createdAt,
    updatedAt: isIsoTime(h.updatedAt) ? h.updatedAt : createdAt,
  } as Habit;
}
