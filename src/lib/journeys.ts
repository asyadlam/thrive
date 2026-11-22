import { JOURNEYS_STORE, idbDelete, idbGet, idbGetAll, idbPut } from './db';
import { isIsoTime, newId } from './journal';

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

/** A Fear & Confidence journey. Steps are kept in ladder order: smallest first. */
export type Journey = {
  id: string;
  title: string;
  steps: JourneyStep[];
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
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const getJourney = (id: string) => idbGet<Journey>(JOURNEYS_STORE, id);
export const deleteJourney = (id: string) => idbDelete(JOURNEYS_STORE, id);

async function save(j: Journey): Promise<Journey> {
  await idbPut(JOURNEYS_STORE, j);
  return j;
}

export function createJourney(title: string): Promise<Journey> {
  const t = now();
  return save({ id: `journey-${newId()}`, title: title.trim().slice(0, JOURNEY_TITLE_MAX), steps: [], createdAt: t, updatedAt: t });
}

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

/** Check one journey (and its steps) from a backup file; null if unusable. Fills missing ids/timestamps. */
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
  return {
    ...(j as object),
    id: typeof j.id === 'string' && j.id.startsWith('journey-') ? j.id : `journey-${newId()}`,
    title: j.title,
    steps,
    createdAt: created,
    updatedAt: isIsoTime(j.updatedAt) ? j.updatedAt : created,
  } as Journey;
}
