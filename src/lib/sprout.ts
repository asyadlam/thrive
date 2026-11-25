/*
  Daily Sprout: small, named changes to one day's record (see health.ts — the same record the Health Journey
  shows). Both the Daily Sprout page and the voice assistant use these, so a change made either way is identical.
*/
import { LISTS_STORE, idbDelete, idbGetAll } from './db';
import { LIMITS, getQuickEntry, saveQuickEntry, todayKey, type Mood } from './journal';
import { notifyDataChanged } from './dataEvents';
import {
  FOOD_CALORIES_MAX,
  NUTRIENT_MAX,
  WATER_MAX,
  newFoodLog,
  newTodo,
  updateHealthDay,
  type FoodLog,
  type HealthDraft,
  type Medication,
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

export type FoodDraft = { name: string; calories: number | null; protein: number | null; sugar: number | null; addedSugar: number | null };

const grams = (v: number | null) => (v === null || !Number.isFinite(v) || v < 0 || v > NUTRIENT_MAX ? null : Math.round(v * 10) / 10);

export function cleanFood(f: FoodDraft): Omit<FoodLog, 'id' | 'createdAt'> {
  return {
    name: f.name,
    calories: f.calories === null || !Number.isFinite(f.calories) || f.calories < 0 || f.calories > FOOD_CALORIES_MAX ? null : Math.round(f.calories),
    protein: grams(f.protein),
    sugar: grams(f.sugar),
    addedSugar: grams(f.addedSugar),
  };
}

export const addFood = (date: string, food: FoodDraft) =>
  change(date, (d) => ({ ...d, foods: [...d.foods, newFoodLog(cleanFood(food))] }));

export const deleteFood = (date: string, id: string) => change(date, (d) => ({ ...d, foods: d.foods.filter((f) => f.id !== id) }));

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
  const joined = !add ? (existing?.note ?? '') : current && !current.includes(add) ? `${current}\n${add}` : current || add;
  const intention = parts.intention?.trim();
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
  return { saved: true, mood: !!parts.mood, note: !!add, intention: !!intention, trimmed: joined.length > LIMITS.note };
}
