/*
  Health Journey: a small, entirely manual daily log (no AI, no automatic tracking). Each day is its own record,
  keyed by its date, and my medication list is kept separately. Everything stays on this device and goes into
  backups like the rest of Thrive.
*/
import { HEALTH_STORE, MEDICATIONS_STORE, idbDelete, idbGet, idbGetAll, idbPut } from './db';
import { isIsoTime, newId } from './journal';

export const WATER_GLASSES = 8;
export const EXERCISE_MAX = 80;
export const MED_NAME_MAX = 60;
export const MED_TIMING_MAX = 60;
export const EXERCISE_CHIPS = ['Gym', 'Dance', 'Rest'];
export const FOOD_NAME_MAX = 60;
export const FOOD_CALORIES_MAX = 20_000;
export const NUTRIENT_MAX = 2_000; // grams

/**
 * One calorie log ("Oatmeal", 320 kcal), with optional grams of sugar, added sugar and protein. When a day has
 * logs, its calorie total is worked out from them.
 */
export type FoodLog = {
  id: string;
  name: string;
  calories: number;
  sugar: number | null;
  addedSugar: number | null;
  protein: number | null;
  createdAt: string;
};

/** Totals for a day's logs; a nutrient total is null when no log has that nutrient. */
export function foodTotals(foods: FoodLog[]) {
  const sum = (key: 'sugar' | 'addedSugar' | 'protein') => {
    const have = foods.filter((f) => f[key] !== null);
    return have.length ? Math.round(have.reduce((t, f) => t + (f[key] as number), 0) * 10) / 10 : null;
  };
  return { calories: foods.reduce((t, f) => t + f.calories, 0), sugar: sum('sugar'), addedSugar: sum('addedSugar'), protein: sum('protein') };
}

export const newFoodLog = (draft: Omit<FoodLog, 'id' | 'createdAt'>): FoodLog => ({
  id: `food-${newId()}`,
  ...draft,
  name: draft.name.trim().slice(0, FOOD_NAME_MAX),
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
  createdAt: string;
  updatedAt: string;
};

export type HealthDraft = Pick<HealthDay, 'calories' | 'exercise' | 'steps' | 'water' | 'meds'> & { foods: FoodLog[] };

const now = () => new Date().toISOString();
export const healthId = (date: string) => `health-${date}`;
const isDayKey = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00`));
const wholeOrNull = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null;

export const emptyDraft = (): HealthDraft => ({ calories: null, foods: [], exercise: '', steps: null, water: 0, meds: [] });

/** True when nothing at all is filled in. */
export const isEmptyDay = (d: HealthDraft) =>
  d.calories === null && d.foods.length === 0 && !d.exercise.trim() && d.steps === null && d.water === 0 && d.meds.length === 0;

/* ---------- Days ---------- */

export const getHealthDay = (date: string) => idbGet<HealthDay>(HEALTH_STORE, healthId(date));

/** Logged days, newest first. */
export async function listHealthDays(): Promise<HealthDay[]> {
  const all = await idbGetAll<HealthDay>(HEALTH_STORE);
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

/** Saves a day. A day with nothing filled in is removed, so the day list only shows days with something logged. */
export async function saveHealthDay(date: string, draft: HealthDraft, existing?: HealthDay): Promise<HealthDay | null> {
  if (isEmptyDay(draft)) {
    if (existing) await idbDelete(HEALTH_STORE, healthId(date));
    return null;
  }
  const t = now();
  const day: HealthDay = {
    id: healthId(date),
    date,
    // With logs, the total is always worked out from them.
    calories: draft.foods.length ? foodTotals(draft.foods).calories : draft.calories,
    ...(draft.foods.length ? { foods: draft.foods } : {}),
    exercise: draft.exercise.trim().slice(0, EXERCISE_MAX),
    steps: draft.steps,
    water: Math.max(0, Math.min(WATER_GLASSES, Math.round(draft.water))),
    meds: draft.meds,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  };
  await idbPut(HEALTH_STORE, day);
  return day;
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
        if (kcal === null) return [];
        return [
          {
            id: typeof f.id === 'string' && f.id.startsWith('food-') ? f.id : `food-${newId()}`,
            name: typeof f.name === 'string' ? f.name.slice(0, FOOD_NAME_MAX) : '',
            calories: kcal,
            sugar: grams(f.sugar),
            addedSugar: grams(f.addedSugar),
            protein: grams(f.protein),
            createdAt: isIsoTime(f.createdAt) ? f.createdAt : created,
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
    water: wholeOrNull(d.water, WATER_GLASSES) ?? 0,
    meds,
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
