import { GOALS_STORE, idbDelete, idbGet, idbGetAll, idbPut } from './db';
import { isIsoTime, newId } from './journal';

export const GOAL_LIMITS = { title: 80, note: 200 } as const;

export type Goal = {
  id: string;
  title: string;
  note: string; // optional: why it matters ('' if none)
  targetDate: string; // optional: YYYY-MM-DD ('' if none)
  completedAt: string | null; // ISO timestamp, or null while active
  createdAt: string;
  updatedAt: string;
};

export type GoalDraft = Pick<Goal, 'title' | 'note' | 'targetDate'>;

export const isDayKey = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00`));

/** Active goals: soonest target date first (no date last), then oldest first. Completed: newest first. */
export async function listGoals(): Promise<{ active: Goal[]; completed: Goal[] }> {
  const all = await idbGetAll<Goal>(GOALS_STORE);
  const active = all
    .filter((g) => !g.completedAt)
    .sort(
      (a, b) =>
        (a.targetDate || '9999').localeCompare(b.targetDate || '9999') || a.createdAt.localeCompare(b.createdAt),
    );
  const completed = all
    .filter((g) => g.completedAt)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return { active, completed };
}

export const listAllGoals = () => idbGetAll<Goal>(GOALS_STORE);
export const getGoal = (id: string) => idbGet<Goal>(GOALS_STORE, id);
export const deleteGoal = (id: string) => idbDelete(GOALS_STORE, id);

export async function saveGoal(draft: GoalDraft, existing?: Goal): Promise<Goal> {
  const now = new Date().toISOString();
  const goal: Goal = {
    id: existing?.id ?? `goal-${newId()}`,
    title: draft.title.trim().slice(0, GOAL_LIMITS.title),
    note: draft.note.trim().slice(0, GOAL_LIMITS.note),
    targetDate: isDayKey(draft.targetDate) ? draft.targetDate : '',
    completedAt: existing?.completedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await idbPut(GOALS_STORE, goal);
  return goal;
}

export async function setGoalCompleted(goal: Goal, done: boolean): Promise<Goal> {
  const now = new Date().toISOString();
  const updated: Goal = { ...goal, completedAt: done ? now : null, updatedAt: now };
  await idbPut(GOALS_STORE, updated);
  return updated;
}

/** Check one goal from a backup file; returns null if it isn't a usable goal. Fills missing id/timestamps. */
export function goalFromBackup(raw: unknown): Goal | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  if (typeof g.title !== 'string' || !g.title.trim()) return null;
  const createdAt = isIsoTime(g.createdAt) ? g.createdAt : isIsoTime(g.updatedAt) ? g.updatedAt : new Date().toISOString();
  return {
    ...(g as object),
    id: typeof g.id === 'string' && g.id.startsWith('goal-') ? g.id : `goal-${newId()}`,
    title: g.title,
    note: typeof g.note === 'string' ? g.note : '',
    targetDate: isDayKey(g.targetDate) ? g.targetDate : '',
    completedAt: isIsoTime(g.completedAt) ? g.completedAt : null,
    createdAt,
    updatedAt: isIsoTime(g.updatedAt) ? g.updatedAt : createdAt,
  } as Goal;
}
