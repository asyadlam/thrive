/*
  The day record behind both Daily Sprout and the Health Journey: one record per date (foods, exercise, steps,
  water, medications checked off, stretch, to-dos), so editing either place edits the same data. My medication list
  is kept separately. Everything stays on this device and goes into backups like the rest of Thrive.
*/
import { HEALTH_STORE, MEDICATIONS_STORE, idbDelete, idbGet, idbGetAll, idbPut } from './db';
import { isIsoTime, newId } from './journal';
import { noteRecord } from './undo';

/** The default water target (glasses). The real target is a setting (see dailyTargets in settings.ts). */
export const WATER_GLASSES = 8;
/** Most glasses a day can hold, whatever the target. */
export const WATER_MAX = 30;
export const TODO_MAX = 140;
export const INTENTION_MAX = 140;
export const EXERCISE_MAX = 80;
export const MED_NAME_MAX = 60;
export const MED_TIMING_MAX = 60;
export const EXERCISE_CHIPS = ['Gym', 'Dance', 'Rest'];
export const FOOD_NAME_MAX = 60;
export const FOOD_CALORIES_MAX = 20_000;
export const NUTRIENT_MAX = 2_000; // grams

/**
 * One food ("Oatmeal", 320 kcal), with optional grams of sugar, added sugar and protein. Calories can be unknown
 * (null) when a food is logged without numbers. When a day has foods, its calorie total is worked out from them.
 */
export type FoodLog = {
  id: string;
  name: string;
  calories: number | null;
  sugar: number | null;
  addedSugar: number | null;
  protein: number | null;
  createdAt: string;
  /** How many of it, when more than one ("2 cookies"); the numbers are for all of them together. */
  count?: number;
  /** True when Ask Thrive estimated some of the numbers (shown with a small "est." tag). Never set for numbers I gave. */
  estimate?: true;
  /** For an estimate: the portion it assumed, e.g. "1 medium cookie". */
  portion?: string;
};

export const PORTION_MAX = 60;

/** Totals for a day's logs; a nutrient total is null when no log has that nutrient. */
export function foodTotals(foods: FoodLog[]) {
  const sum = (key: 'sugar' | 'addedSugar' | 'protein') => {
    const have = foods.filter((f) => f[key] !== null);
    return have.length ? Math.round(have.reduce((t, f) => t + (f[key] as number), 0) * 10) / 10 : null;
  };
  return { calories: foods.reduce((t, f) => t + (f.calories ?? 0), 0), sugar: sum('sugar'), addedSugar: sum('addedSugar'), protein: sum('protein') };
}

export const newFoodLog = (draft: Omit<FoodLog, 'id' | 'createdAt'>): FoodLog => ({
  id: `food-${newId()}`,
  ...draft,
  name: draft.name.trim().slice(0, FOOD_NAME_MAX),
  createdAt: new Date().toISOString(),
});

/** One to-do on a day. */
export type Todo = { id: string; text: string; done: boolean; createdAt: string };

export const newTodo = (text: string, id?: string): Todo => ({
  id: id ?? `todo-${newId()}`,
  text: text.trim().slice(0, TODO_MAX),
  done: false,
  createdAt: new Date().toISOString(),
});

/** One medication on my list ("Vitamin D", "after dinner"). */
export type Medication = { id: string; name: string; timing: string; createdAt: string; updatedAt: string };

/**
 * One logged day. Every field is optional. `meds` are the medications I checked off that day, with their names as
 * they were then (so a past day still reads right after a medication is renamed or removed from the list).
 */
export type HealthDay = {
  id: string; // "health-YYYY-MM-DD"
  date: string; // YYYY-MM-DD
  /** The day's calories: the sum of `foods` when there are logs, otherwise the one number I typed (or null). */
  calories: number | null;
  /** Individual calorie logs, in the order added (missing on days saved before logs existed). */
  foods?: FoodLog[];
  exercise: string;
  steps: number | null;
  water: number; // glasses, 0–WATER_GLASSES
  meds: { id: string; name: string }[];
  /** Daily Sprout: did I stretch? (missing on older days) */
  stretch?: boolean;
  /** Daily Sprout: the day's to-dos, in the order added (missing on older days). */
  todos?: Todo[];
  /** Daily Sprout: "Little sprout for the day" — the rest of "Today I'll try…" ('' or missing if none). */
  intention?: string;
  /**
   * Ids of foods and to-dos taken off this day (deleted, or moved to another day). Automatic sync between devices
   * uses it so a removal travels too, instead of the other device's older copy bringing the item back.
   */
  removedIds?: string[];
  createdAt: string;
  updatedAt: string;
};

/**
 * What a day editor saves. `stretch` and `todos` are optional: an editor that doesn't show them (the Health
 * Journey day page) leaves the saved ones exactly as they are.
 */
export type HealthDraft = Pick<HealthDay, 'calories' | 'exercise' | 'steps' | 'water' | 'meds'> & {
  foods: FoodLog[];
  stretch?: boolean;
  todos?: Todo[];
  intention?: string;
};

const now = () => new Date().toISOString();
/** How many removed ids a day remembers (the newest ones). */
export const REMOVED_IDS_MAX = 300;
export const healthId = (date: string) => `health-${date}`;
const isDayKey = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00`));
const wholeOrNull = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null;

export const emptyDraft = (): HealthDraft => ({ calories: null, foods: [], exercise: '', steps: null, water: 0, meds: [], stretch: false, todos: [], intention: '' });

/** A saved day as a draft to edit (all fields). */
export const draftOf = (d: HealthDay | undefined): Required<HealthDraft> =>
  d
    ? { calories: d.calories, foods: d.foods ?? [], exercise: d.exercise, steps: d.steps, water: d.water, meds: d.meds, stretch: !!d.stretch, todos: d.todos ?? [], intention: d.intention ?? '' }
    : (emptyDraft() as Required<HealthDraft>);

/** True when nothing at all is filled in. */
export const isEmptyDay = (d: HealthDraft) =>
  d.calories === null &&
  d.foods.length === 0 &&
  !d.exercise.trim() &&
  d.steps === null &&
  d.water === 0 &&
  d.meds.length === 0 &&
  !d.stretch &&
  !(d.todos && d.todos.length) &&
  !d.intention?.trim();

/* ---------- Days ---------- */

export const getHealthDay = (date: string) => idbGet<HealthDay>(HEALTH_STORE, healthId(date));

/** Logged days, newest first. */
export async function listHealthDays(): Promise<HealthDay[]> {
  const all = await idbGetAll<HealthDay>(HEALTH_STORE);
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Saves a day. A day with nothing filled in is removed, so the day list only shows days with something logged.
 * Stretch and to-dos the draft doesn't include are kept from what's saved now (read fresh, so nothing is lost).
 */
export async function saveHealthDay(date: string, draft: HealthDraft, existing?: HealthDay): Promise<HealthDay | null> {
  if (draft.stretch === undefined || draft.todos === undefined || draft.intention === undefined) {
    const current = await getHealthDay(date);
    existing = existing ?? current;
    draft = {
      ...draft,
      stretch: draft.stretch ?? !!current?.stretch,
      todos: draft.todos ?? current?.todos ?? [],
      intention: draft.intention ?? current?.intention ?? '',
    };
  }
  if (isEmptyDay(draft)) {
    if (existing || (await getHealthDay(date))) await idbDelete(HEALTH_STORE, healthId(date));
    return null;
  }
  // Foods and to-dos that were on this day and aren't any more: remembered, so sync doesn't bring them back.
  const before = existing ?? (await getHealthDay(date));
  const keepIds = new Set([...draft.foods, ...(draft.todos ?? [])].map((x) => x.id));
  const gone = [...(before?.foods ?? []), ...(before?.todos ?? [])].map((x) => x.id).filter((id) => !keepIds.has(id));
  const removedIds = [...new Set([...(before?.removedIds ?? []), ...gone])].filter((id) => !keepIds.has(id)).slice(-REMOVED_IDS_MAX);
  const t = now();
  const day: HealthDay = {
    id: healthId(date),
    date,
    // With logs, the total is always worked out from them.
    calories: draft.foods.length ? foodTotals(draft.foods).calories : draft.calories,
    ...(draft.foods.length ? { foods: draft.foods } : {}),
    exercise: draft.exercise.trim().slice(0, EXERCISE_MAX),
    steps: draft.steps,
    water: Math.max(0, Math.min(WATER_MAX, Math.round(draft.water))),
    meds: draft.meds,
    ...(draft.stretch ? { stretch: true } : {}),
    ...(draft.todos && draft.todos.length ? { todos: draft.todos } : {}),
    ...(draft.intention?.trim() ? { intention: draft.intention.trim().slice(0, INTENTION_MAX) } : {}),
    ...(removedIds.length ? { removedIds } : {}),
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  };
  await idbPut(HEALTH_STORE, day);
  return day;
}

/**
 * Changes one day in place: reads it fresh, applies `change`, saves. Daily Sprout and the assistant both write
 * through this, so every place showing the day sees the same data.
 */
export async function updateHealthDay(date: string, change: (d: Required<HealthDraft>) => Required<HealthDraft>): Promise<HealthDay | null> {
  await noteRecord(HEALTH_STORE, healthId(date)); // for Ask Thrive's Undo (does nothing outside a recording)
  const current = await getHealthDay(date);
  return saveHealthDay(date, change(draftOf(current)), current);
}

export function healthDayFromBackup(raw: unknown): HealthDay | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (!isDayKey(d.date)) return null;
  const created = isIsoTime(d.createdAt) ? d.createdAt : isIsoTime(d.updatedAt) ? d.updatedAt : new Date(`${d.date}T12:00:00`).toISOString();
  const meds = Array.isArray(d.meds)
    ? d.meds
        .filter((m): m is { id: string; name: string } => !!m && typeof m.id === 'string' && typeof m.name === 'string')
        .map((m) => ({ id: m.id, name: m.name.slice(0, MED_NAME_MAX) }))
    : [];
  const grams = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= NUTRIENT_MAX ? Math.round(v * 10) / 10 : null);
  const foods: FoodLog[] = Array.isArray(d.foods)
    ? d.foods.flatMap((raw) => {
        const f = (raw ?? {}) as Record<string, unknown>;
        const kcal = wholeOrNull(f.calories, FOOD_CALORIES_MAX);
        const name = typeof f.name === 'string' ? f.name.slice(0, FOOD_NAME_MAX) : '';
        if (kcal === null && !name.trim()) return []; // a food needs a name or a number
        return [
          {
            id: typeof f.id === 'string' && f.id.startsWith('food-') ? f.id : `food-${newId()}`,
            name,
            calories: kcal,
            sugar: grams(f.sugar),
            addedSugar: grams(f.addedSugar),
            protein: grams(f.protein),
            createdAt: isIsoTime(f.createdAt) ? f.createdAt : created,
            ...(typeof f.count === 'number' && Number.isInteger(f.count) && f.count > 1 && f.count <= 50 ? { count: f.count } : {}),
            ...(f.estimate === true
              ? { estimate: true as const, ...(typeof f.portion === 'string' && f.portion.trim() ? { portion: f.portion.trim().slice(0, PORTION_MAX) } : {}) }
              : {}),
          },
        ];
      })
    : [];
  const todos: Todo[] = Array.isArray(d.todos)
    ? d.todos.flatMap((raw) => {
        const t = (raw ?? {}) as Record<string, unknown>;
        if (typeof t.text !== 'string' || !t.text.trim()) return [];
        return [
          {
            id: typeof t.id === 'string' && t.id ? t.id.slice(0, 80) : `todo-${newId()}`,
            text: t.text.trim().slice(0, TODO_MAX),
            done: t.done === true,
            createdAt: isIsoTime(t.createdAt) ? t.createdAt : created,
          },
        ];
      })
    : [];
  return {
    id: healthId(d.date),
    date: d.date,
    ...(foods.length ? { foods } : {}),
    calories: foods.length ? foodTotals(foods).calories : wholeOrNull(d.calories, 100_000),
    exercise: typeof d.exercise === 'string' ? d.exercise.slice(0, EXERCISE_MAX) : '',
    steps: wholeOrNull(d.steps, 1_000_000),
    water: wholeOrNull(d.water, WATER_MAX) ?? 0,
    meds,
    ...(d.stretch === true ? { stretch: true } : {}),
    ...(typeof d.intention === 'string' && d.intention.trim() ? { intention: d.intention.trim().slice(0, INTENTION_MAX) } : {}),
    ...(todos.length ? { todos } : {}),
    ...(Array.isArray(d.removedIds) && d.removedIds.length
      ? { removedIds: d.removedIds.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 80)).slice(-REMOVED_IDS_MAX) }
      : {}),
    createdAt: created,
    updatedAt: isIsoTime(d.updatedAt) ? d.updatedAt : created,
  };
}

/* ---------- Medication list ---------- */

/** My medications, in the order I added them. */
export async function listMedications(): Promise<Medication[]> {
  const all = await idbGetAll<Medication>(MEDICATIONS_STORE);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addMedication(name: string, timing: string): Promise<Medication> {
  const t = now();
  const med: Medication = {
    id: `med-${newId()}`,
    name: name.trim().slice(0, MED_NAME_MAX),
    timing: timing.trim().slice(0, MED_TIMING_MAX),
    createdAt: t,
    updatedAt: t,
  };
  await idbPut(MEDICATIONS_STORE, med);
  return med;
}

/** Removes a medication from my list. Days that already checked it off keep it (with its name). */
export const deleteMedication = (id: string) => idbDelete(MEDICATIONS_STORE, id);

export function medicationFromBackup(raw: unknown): Medication | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.name !== 'string' || !m.name.trim()) return null;
  const created = isIsoTime(m.createdAt) ? m.createdAt : isIsoTime(m.updatedAt) ? m.updatedAt : now();
  return {
    id: typeof m.id === 'string' && m.id.startsWith('med-') ? m.id : `med-${newId()}`,
    name: m.name.trim().slice(0, MED_NAME_MAX),
    timing: typeof m.timing === 'string' ? m.timing.trim().slice(0, MED_TIMING_MAX) : '',
    createdAt: created,
    updatedAt: isIsoTime(m.updatedAt) ? m.updatedAt : created,
  };
}
