/*
  Daily Sprout: small, named changes to one day's record (see health.ts — the same record the Health Journey
  shows). Both the Daily Sprout page and the voice assistant use these, so a change made either way is identical.
*/
import { JOURNAL_STORE, LISTS_STORE, idbDelete, idbGetAll } from './db';
import { noteRecord } from './undo';
import { LIMITS, getQuickEntry, quickId, saveQuickEntry, todayKey, type Mood } from './journal';
import { notifyDataChanged } from './dataEvents';
import {
  FOOD_CALORIES_MAX,
  NUTRIENT_MAX,
  PORTION_MAX,
  WATER_MAX,
  listHealthDays,
  newFoodLog,
  newTodo,
  updateHealthDay,
  type FoodLog,
  type HealthDraft,
  type Medication,
  type Todo,
} from './health';
import type { UserList } from './listParts';

type Day = Required<HealthDraft>;

async function change(date: string, fn: (d: Day) => Day) {
  const saved = await updateHealthDay(date, fn);
  notifyDataChanged();
  return saved;
}

/* ---------- To-dos ---------- */

export const addTodo = (date: string, text: string) =>
  change(date, (d) => ({ ...d, todos: [...d.todos, newTodo(text)] }));

export const setTodoDone = (date: string, id: string, done: boolean) =>
  change(date, (d) => ({ ...d, todos: d.todos.map((t) => (t.id === id ? { ...t, done } : t)) }));

export const deleteTodo = (date: string, id: string) => change(date, (d) => ({ ...d, todos: d.todos.filter((t) => t.id !== id) }));

/** Moves a day's to-dos to another day (the open ones, or all). Returns how many moved. */
/** Moves one to-do (added to `to`, taken off `from`). Returns it, or null if it wasn't on `from`. */
export async function moveTodo(from: string, to: string, id: string): Promise<Todo | null> {
  if (from === to) return null;
  let picked: Todo | null = null;
  await updateHealthDay(from, (d) => {
    picked = d.todos.find((t) => t.id === id) ?? null;
    return picked ? { ...d, todos: d.todos.filter((t) => t.id !== id) } : d;
  });
  const moved = picked as Todo | null;
  if (moved) {
    await updateHealthDay(to, (d) => (d.todos.some((t) => t.id === moved.id) ? d : { ...d, todos: [...d.todos, moved] }));
    notifyDataChanged();
  }
  return moved;
}

export async function moveTodos(from: string, to: string, which: 'open' | 'all' = 'open'): Promise<number> {
  if (from === to) return 0;
  let picked: Day['todos'] = [];
  await updateHealthDay(from, (d) => {
    picked = d.todos.filter((t) => which === 'all' || !t.done);
    return { ...d, todos: d.todos.filter((t) => !picked.includes(t)) };
  });
  if (picked.length) {
    await updateHealthDay(to, (d) => {
      const have = new Set(d.todos.map((t) => t.id));
      return { ...d, todos: [...d.todos, ...picked.filter((t) => !have.has(t.id))] };
    });
  }
  notifyDataChanged();
  return picked.length;
}

/* ---------- Foods ---------- */

export type FoodDraft = {
  name: string;
  calories: number | null;
  protein: number | null;
  sugar: number | null;
  addedSugar: number | null;
  /** Ask Thrive estimated some of the numbers. */
  estimate?: boolean;
  portion?: string;
  /** Scaled from my own numbers for another amount: how ("135 g of 150 g"). */
  scaled?: string;
};

const grams = (v: number | null) => (v === null || !Number.isFinite(v) || v < 0 || v > NUTRIENT_MAX ? null : Math.round(v * 10) / 10);

export function cleanFood(f: FoodDraft): Omit<FoodLog, 'id' | 'createdAt'> {
  return {
    name: f.name,
    calories: f.calories === null || !Number.isFinite(f.calories) || f.calories < 0 || f.calories > FOOD_CALORIES_MAX ? null : Math.round(f.calories),
    protein: grams(f.protein),
    sugar: grams(f.sugar),
    addedSugar: grams(f.addedSugar),
    ...(f.scaled?.trim() ? { scaled: f.scaled.trim().slice(0, PORTION_MAX) } : {}),
    ...(f.estimate ? { estimate: true as const, ...(f.portion?.trim() ? { portion: f.portion.trim().slice(0, PORTION_MAX) } : {}) } : {}),
  };
}

/**
 * Foods I've logged before with my own numbers (never estimates), newest first, one per name — so a food I eat
 * often (a brand bar, "my shortbread") can be logged with my exact numbers instead of an estimate.
 */
export async function knownFoods(limit = 80): Promise<FoodLog[]> {
  const days = await listHealthDays();
  const seen = new Map<string, FoodLog>();
  const all = days.flatMap((d) => d.foods ?? []).filter((f) => !f.estimate && !f.scaled && f.calories !== null && f.name.trim());
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const f of all) {
    const key = foodKey(f.name);
    if (key && !seen.has(key)) seen.set(key, f);
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

/** Every food name I've logged before (newest first, one per name), so a misheard name can match the real one. */
export async function allFoodNames(limit = 150): Promise<string[]> {
  const all = (await listHealthDays()).flatMap((d) => d.foods ?? []).filter((f) => f.name.trim());
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seen = new Map<string, string>();
  for (const f of all) {
    const key = foodKey(f.name);
    if (key && !seen.has(key)) seen.set(key, f.name);
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

/** "A Barebells bar" / "my barebells bar." → "barebells bar", for matching names. */
export const foodKey = (name: string) =>
  name.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/^\s*(a|an|one|my|the|some)\s+/, '').replace(/\s+/g, ' ').trim();

export const addFood = (date: string, food: FoodDraft) =>
  change(date, (d) => ({ ...d, foods: [...d.foods, newFoodLog(cleanFood(food))] }));

export const deleteFood = (date: string, id: string) => change(date, (d) => ({ ...d, foods: d.foods.filter((f) => f.id !== id) }));

/** Changes one food in place (same place in the list, same id): new numbers, a new count, or a different food. */
export const replaceFood = (date: string, id: string, food: FoodDraft & { count?: number }) =>
  change(date, (d) => ({
    ...d,
    foods: d.foods.map((f) => {
      if (f.id !== id) return f;
      const clean = cleanFood(food);
      const count = food.count && food.count > 1 ? Math.min(50, Math.round(food.count)) : undefined;
      return { id: f.id, createdAt: f.createdAt, ...clean, name: clean.name.trim().slice(0, 60), ...(count ? { count } : {}) };
    }),
  }));

/** Changes a to-do's words (same place, same tick). */
export const renameTodo = (date: string, id: string, text: string) =>
  change(date, (d) => ({ ...d, todos: d.todos.map((t) => (t.id === id ? { ...t, text: text.trim().slice(0, 140) } : t)) }));

/* ---------- Movement, water, medications ---------- */

export const setSteps = (date: string, steps: number | null) => change(date, (d) => ({ ...d, steps }));
export const setExercise = (date: string, exercise: string) => change(date, (d) => ({ ...d, exercise }));
export const setStretch = (date: string, stretch: boolean) => change(date, (d) => ({ ...d, stretch }));
export const setIntention = (date: string, intention: string) => change(date, (d) => ({ ...d, intention }));

const clampWater = (n: number) => Math.max(0, Math.min(WATER_MAX, Math.round(n)));
export const setWater = (date: string, glasses: number) => change(date, (d) => ({ ...d, water: clampWater(glasses) }));
export const addWater = (date: string, glasses: number) => change(date, (d) => ({ ...d, water: clampWater(d.water + glasses) }));

export const setMedTaken = (date: string, med: Pick<Medication, 'id' | 'name'>, taken: boolean) =>
  change(date, (d) => ({
    ...d,
    meds: taken ? (d.meds.some((m) => m.id === med.id) ? d.meds : [...d.meds, { id: med.id, name: med.name }]) : d.meds.filter((m) => m.id !== med.id),
  }));

/* ---------- The old My Life "To do" list → today's to-dos ---------- */

let moving: Promise<number> | null = null;

/**
 * To-dos live on Daily Sprout now. If the old built-in To do list exists (an older device, or a restored or merged
 * older backup), its items become today's to-dos (checked ones stay checked) and the list is removed. Item ids are
 * kept, so running this twice can never duplicate anything. Returns how many items moved.
 */
export function moveOldTodoList(): Promise<number> {
  moving ??= (async () => {
    try {
      const lists = (await idbGetAll<UserList>(LISTS_STORE)).filter((l) => l.id === 'list-todo' || l.kind === 'todo');
      if (!lists.length) return 0;
      const items = lists.flatMap((l) => l.items).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (items.length) {
        await updateHealthDay(todayKey(), (d) => {
          const have = new Set(d.todos.map((t) => t.id));
          const fresh = items
            .filter((i) => i.text.trim() && !have.has(`todo-${i.id}`))
            .map((i) => ({ ...newTodo(i.text, `todo-${i.id}`), done: i.checked, createdAt: i.createdAt }));
          return { ...d, todos: [...d.todos, ...fresh] };
        });
      }
      for (const l of lists) await idbDelete(LISTS_STORE, l.id); // only after the items are safely on today
      if (items.length) notifyDataChanged();
      return items.length;
    } finally {
      moving = null;
    }
  })();
  return moving;
}

/* ---------- Days ---------- */

/** "2026-11-25" moved by n days. */
export function shiftDay(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return todayKey(d);
}

/** "Today", "Tomorrow", "Yesterday", or "Monday, November 23". */
export function dayName(key: string): string {
  const today = todayKey();
  if (key === today) return 'Today';
  if (key === shiftDay(today, 1)) return 'Tomorrow';
  if (key === shiftDay(today, -1)) return 'Yesterday';
  return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/* ---------- Quick entry mood (the same entry as Daily Sprout's Quick entry) ---------- */

/**
 * Updates a day's quick entry (the same entry Daily Sprout and the Journal show), changing only what's given:
 * - mood: replaces the mood;
 * - note: a bit about the day — becomes the note, or is added after the note already there (nothing is replaced);
 * - intention: "Tomorrow's intention" in that day's entry — replaces it.
 * A quick entry always has a mood, so if the day has no entry yet and no mood is given, nothing is saved and
 * 'need_mood' comes back (the assistant then asks how the day felt).
 */
export async function updateQuickEntry(
  date: string,
  parts: { mood?: Mood | null; note?: string; intention?: string },
): Promise<{ saved: false; reason: 'need_mood' } | { saved: true; mood: boolean; note: boolean; intention: boolean; trimmed: boolean }> {
  const existing = await getQuickEntry(date);
  const mood = parts.mood ?? existing?.mood ?? null;
  if (!mood) return { saved: false, reason: 'need_mood' };
  const add = parts.note?.trim() ?? '';
  const current = existing?.note?.trim() ?? '';
  // Added to the end with a space; whatever is already there is kept (and the same words aren't added twice).
  const fresh = !!add && !current.includes(add);
  const joined = !add ? (existing?.note ?? '') : current && fresh ? `${current} ${add}` : current || add;
  const intention = parts.intention?.trim();
  await noteRecord(JOURNAL_STORE, quickId(date)); // for Ask Thrive's Undo
  await saveQuickEntry(
    date,
    {
      mood,
      positives: existing?.positives ?? [],
      note: joined.slice(0, LIMITS.note),
      intention: (intention || existing?.intention || '').slice(0, LIMITS.intention),
    },
    existing,
  );
  notifyDataChanged();
  return { saved: true, mood: !!parts.mood, note: fresh, intention: !!intention, trimmed: joined.length > LIMITS.note };
}
