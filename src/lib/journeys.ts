import { JOURNEYS_STORE, idbDelete, idbGet, idbGetAll, idbPut } from './db';
import { isIsoTime, newId } from './journal';
import { GOAL_LIMITS, goalFromBackup, isDayKey, type Goal, type GoalDraft } from './goals';
import { HABIT_FIELD_MAX, habitFromBackup, type Habit, type HabitDraft } from './habits';
import { withJourneyParts } from './journeyParts';

export const JOURNEY_TITLE_MAX = 80;
export const STEP_MAX = 140;
export const REFLECTION_MAX = 1000;

/** One rung of the ladder. */
export type JourneyStep = {
  id: string;
  text: string;
  triedAt: string | null; // when I marked "Tried it"
  reflection: string; // "How did it go?" ('' if skipped)
  createdAt: string;
  updatedAt: string;
};

/**
 * A Journey: one thing I'm working on, with its goal, its small steps (kept in ladder order, smallest first)
 * and the habit swaps that get in its way. Every part except the name is optional.
 */
export type Journey = {
  id: string;
  title: string;
  /** The goal for this journey (null = none yet). */
  goal: Goal | null;
  steps: JourneyStep[];
  /** Habit swaps attached to this journey. */
  swaps: Habit[];
  createdAt: string;
  updatedAt: string;
};

const now = () => new Date().toISOString();

/** Descriptive only, e.g. "3 of 7 steps tried". */
export function journeySummary(j: Journey): string {
  if (j.steps.length === 0) return 'No steps yet';
  const tried = j.steps.filter((s) => s.triedAt).length;
  return `${tried} of ${j.steps.length} ${j.steps.length === 1 ? 'step' : 'steps'} tried`;
}

export async function listJourneys(): Promise<Journey[]> {
  const all = await idbGetAll<Journey>(JOURNEYS_STORE);
  return all.map(withJourneyParts).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getJourney(id: string): Promise<Journey | undefined> {
  const j = await idbGet<Journey>(JOURNEYS_STORE, id);
  return j ? withJourneyParts(j) : undefined;
}
export const deleteJourney = (id: string) => idbDelete(JOURNEYS_STORE, id);

async function save(j: Journey): Promise<Journey> {
  await idbPut(JOURNEYS_STORE, j);
  return j;
}

/** A new journey: just a name, and optionally a goal line. Steps and swaps are added on its page. */
export function createJourney(title: string, goalTitle = ''): Promise<Journey> {
  const t = now();
  const goal: Goal | null = goalTitle.trim()
    ? { id: `goal-${newId()}`, title: goalTitle.trim().slice(0, GOAL_LIMITS.title), note: '', targetDate: '', completedAt: null, createdAt: t, updatedAt: t }
    : null;
  return save({ id: `journey-${newId()}`, title: title.trim().slice(0, JOURNEY_TITLE_MAX), goal, steps: [], swaps: [], createdAt: t, updatedAt: t });
}

/* ---------- The goal ---------- */

/** Set or change this journey's goal. */
export function saveJourneyGoal(j: Journey, draft: GoalDraft): Promise<Journey> {
  const t = now();
  const goal: Goal = {
    id: j.goal?.id ?? `goal-${newId()}`,
    title: draft.title.trim().slice(0, GOAL_LIMITS.title),
    note: draft.note.trim().slice(0, GOAL_LIMITS.note),
    targetDate: isDayKey(draft.targetDate) ? draft.targetDate : '',
    completedAt: j.goal?.completedAt ?? null,
    createdAt: j.goal?.createdAt ?? t,
    updatedAt: t,
  };
  return save({ ...j, goal, updatedAt: t });
}

/** "I reached it 🎉" (or, if tapped by mistake, not yet). The goal stays visible either way. */
export function setJourneyGoalReached(j: Journey, reached: boolean): Promise<Journey> {
  if (!j.goal) return Promise.resolve(j);
  const t = now();
  return save({ ...j, goal: { ...j.goal, completedAt: reached ? t : null, updatedAt: t }, updatedAt: t });
}

export const removeJourneyGoal = (j: Journey) => save({ ...j, goal: null, updatedAt: now() });

/* ---------- Habit swaps ---------- */

const cleanSwap = (v: string) => v.trim().slice(0, HABIT_FIELD_MAX);

export function saveJourneySwap(j: Journey, draft: HabitDraft, existing?: Habit): Promise<Journey> {
  const t = now();
  const swap: Habit = {
    id: existing?.id ?? `habit-${newId()}`,
    trigger: cleanSwap(draft.trigger),
    oldHabit: cleanSwap(draft.oldHabit),
    newHabit: cleanSwap(draft.newHabit),
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  };
  const swaps = existing ? j.swaps.map((s) => (s.id === existing.id ? swap : s)) : [...j.swaps, swap];
  return save({ ...j, swaps, updatedAt: t });
}

export const deleteJourneySwap = (j: Journey, swapId: string) =>
  save({ ...j, swaps: j.swaps.filter((s) => s.id !== swapId), updatedAt: now() });

export function renameJourney(j: Journey, title: string): Promise<Journey> {
  return save({ ...j, title: title.trim().slice(0, JOURNEY_TITLE_MAX), updatedAt: now() });
}

export function addStep(j: Journey, text: string): Promise<Journey> {
  const t = now();
  const step: JourneyStep = {
    id: `step-${newId()}`,
    text: text.trim().slice(0, STEP_MAX),
    triedAt: null,
    reflection: '',
    createdAt: t,
    updatedAt: t,
  };
  return save({ ...j, steps: [...j.steps, step], updatedAt: t });
}

/** Change one step; its updatedAt (and the journey's) move to now. */
function updateStep(j: Journey, stepId: string, change: Partial<JourneyStep>): Promise<Journey> {
  const t = now();
  return save({
    ...j,
    steps: j.steps.map((s) => (s.id === stepId ? { ...s, ...change, updatedAt: t } : s)),
    updatedAt: t,
  });
}

export const editStep = (j: Journey, stepId: string, text: string) =>
  updateStep(j, stepId, { text: text.trim().slice(0, STEP_MAX) });

export const markTried = (j: Journey, stepId: string) => updateStep(j, stepId, { triedAt: now() });

export const saveReflection = (j: Journey, stepId: string, reflection: string) =>
  updateStep(j, stepId, { reflection: reflection.trim().slice(0, REFLECTION_MAX) });

/** For a mistaken tap: clears the tried date and any reflection. */
export const unmarkTried = (j: Journey, stepId: string) => updateStep(j, stepId, { triedAt: null, reflection: '' });

export function deleteStep(j: Journey, stepId: string): Promise<Journey> {
  return save({ ...j, steps: j.steps.filter((s) => s.id !== stepId), updatedAt: now() });
}

/** Move a step one place up (-1, toward the smallest) or down (+1). */
export function moveStep(j: Journey, stepId: string, direction: -1 | 1): Promise<Journey> {
  const from = j.steps.findIndex((s) => s.id === stepId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= j.steps.length) return Promise.resolve(j);
  const steps = [...j.steps];
  [steps[from], steps[to]] = [steps[to], steps[from]];
  return save({ ...j, steps, updatedAt: now() });
}

/**
 * Check one journey (with its goal, steps and swaps) from a backup file; null if unusable. Fills missing
 * ids/timestamps. A journey from an older backup without a goal field gets its aim as its goal (journeyParts.ts).
 */
export function journeyFromBackup(raw: unknown): Journey | null {
  if (!raw || typeof raw !== 'object') return null;
  const j = raw as Record<string, unknown>;
  if (typeof j.title !== 'string' || !j.title.trim()) return null;
  if (j.steps !== undefined && !Array.isArray(j.steps)) return null;
  const created = isIsoTime(j.createdAt) ? j.createdAt : isIsoTime(j.updatedAt) ? j.updatedAt : now();
  const steps: JourneyStep[] = [];
  for (const rawStep of (j.steps as unknown[] | undefined) ?? []) {
    if (!rawStep || typeof rawStep !== 'object') return null;
    const s = rawStep as Record<string, unknown>;
    if (typeof s.text !== 'string' || !s.text.trim()) return null;
    const stepCreated = isIsoTime(s.createdAt) ? s.createdAt : isIsoTime(s.updatedAt) ? s.updatedAt : created;
    steps.push({
      ...(s as object),
      id: typeof s.id === 'string' && s.id.startsWith('step-') ? s.id : `step-${newId()}`,
      text: s.text,
      triedAt: isIsoTime(s.triedAt) ? s.triedAt : null,
      reflection: typeof s.reflection === 'string' ? s.reflection : '',
      createdAt: stepCreated,
      updatedAt: isIsoTime(s.updatedAt) ? s.updatedAt : stepCreated,
    } as JourneyStep);
  }
  if (j.swaps !== undefined && !Array.isArray(j.swaps)) return null;
  const swaps: Habit[] = [];
  for (const rawSwap of (j.swaps as unknown[] | undefined) ?? []) {
    const swap = habitFromBackup(rawSwap);
    if (!swap) return null;
    swaps.push(swap);
  }
  const base = {
    ...(j as object),
    id: typeof j.id === 'string' && j.id.startsWith('journey-') ? j.id : `journey-${newId()}`,
    title: j.title,
    steps,
    swaps,
    createdAt: created,
    updatedAt: isIsoTime(j.updatedAt) ? j.updatedAt : created,
  } as Journey;
  if (j.goal === undefined) return withJourneyParts({ ...base, goal: undefined as unknown as Goal | null });
  return { ...base, goal: j.goal === null ? null : goalFromBackup(j.goal) };
}
