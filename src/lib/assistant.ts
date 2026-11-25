/*
  The floating voice assistant, on the device side. It sends the short chat plus a small picture of the relevant
  days to /api/assistant, then carries out the actions that come back through the very same functions the Daily
  Sprout buttons use (so every screen shows the change at once), and writes the confirmation from what actually
  happened. Nothing here is saved: the chat lives only in the open panel.
*/
import { isValidDayKey } from './calendar';
import { todayKey } from './journal';
import { getHealthDay, listMedications, type Medication } from './health';
import { addStandalonePositive } from './positives';
import { notifyDataChanged } from './dataEvents';
import {
  addFood,
  addTodo,
  addWater,
  dayName,
  moveTodos,
  setExercise,
  setMedTaken,
  setStretch,
  setSteps,
  setTodoDone,
  setWater,
  shiftDay,
} from './sprout';

export type AssistantMessage = { role: 'user' | 'assistant'; content: string };

export class AssistantError extends Error {}

/** The days the assistant may need to see: the day on screen, the days around it, and real today. */
async function buildContext(page: string, day: string) {
  const today = todayKey();
  const keys = [...new Set([shiftDay(day, -1), day, shiftDay(day, 1), today])];
  const days: Record<string, unknown> = {};
  for (const key of keys) {
    const d = await getHealthDay(key);
    days[key] = {
      name: dayName(key),
      weekday: new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' }),
      todos: (d?.todos ?? []).map((t) => ({ id: t.id, text: t.text, done: t.done })),
      foods: (d?.foods ?? []).map((f) => f.name || 'something'),
      water: d?.water ?? 0,
      steps: d?.steps ?? null,
      exercise: d?.exercise ?? '',
      stretch: !!d?.stretch,
      medsTaken: (d?.meds ?? []).map((m) => m.id),
    };
  }
  const meds = await listMedications();
  const medications = meds.map((m) => ({ id: m.id, name: m.name, usualTime: m.timing }));
  return {
    context: { page, today, contextDay: day, tomorrowOfContext: shiftDay(day, 1), yesterdayOfContext: shiftDay(day, -1), days, medications },
    medications: meds,
  };
}

/** One turn: returns the assistant's question/answer, or what was done. */
export async function askAssistant(page: string, day: string, chat: AssistantMessage[], signal?: AbortSignal): Promise<string> {
  const { context, medications } = await buildContext(page, day);
  let res: Response;
  try {
    res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: chat, context }),
      signal,
    });
  } catch {
    throw new AssistantError('I couldn’t connect just now. Please try again in a moment.');
  }
  const data = (await res.json().catch(() => null)) as { say?: unknown; actions?: unknown; error?: unknown } | null;
  if (!res.ok || !data) {
    throw new AssistantError(
      data?.error === 'daily_limit' ? 'That’s all the help I can give today. Everything still works by hand.' : 'Something went wrong on my side. Please try again.',
    );
  }
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const say = typeof data.say === 'string' ? data.say.trim() : '';
  if (!actions.length) return say || 'Sorry, I didn’t catch that. Could you say it another way?';
  const said = chat.filter((m) => m.role === 'user').map((m) => m.content).join(' ');
  const done = await runActions(actions, said, medications);
  return done.length ? `Done. ${done.join(' ')}` : say || 'I couldn’t do that one. Could you say it another way?';
}

/* -------------------------------------------- carrying out actions -------------------------------------------- */

const str = (v: unknown, max = 140) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** A date the assistant gave, if it's real and within about a year of today. */
function dateOf(v: unknown): string | null {
  if (typeof v !== 'string' || !isValidDayKey(v)) return null;
  const diff = Math.abs(Date.parse(`${v}T12:00:00`) - Date.parse(`${todayKey()}T12:00:00`)) / 864e5;
  return diff <= 400 ? v : null;
}

/** "today", "tomorrow", or "Monday, November 23". */
const onDay = (d: string) => {
  const n = dayName(d);
  return ['Today', 'Tomorrow', 'Yesterday'].includes(n) ? n.toLowerCase() : n;
};
const forDay = (d: string) => `for ${onDay(d)}`;

/** Every number the person actually said (digits, and simple number words), so nothing is ever invented. */
const WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 };
function numbersSaid(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.replace(/(\d),(\d{3})/g, '$1$2').matchAll(/\d+(\.\d+)?/g)) out.add(Number(m[0]));
  for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) if (w in WORDS) out.add(WORDS[w]);
  return out;
}

function findMed(meds: Medication[], id: unknown, name: unknown): Medication | null {
  const byId = meds.find((m) => m.id === id);
  if (byId) return byId;
  const n = str(name || id).toLowerCase();
  const hits = n ? meds.filter((m) => m.name.toLowerCase().includes(n) || n.includes(m.name.toLowerCase())) : [];
  return hits.length === 1 ? hits[0] : null;
}

async function findTodo(date: string, id: unknown, text: unknown) {
  const todos = (await getHealthDay(date))?.todos ?? [];
  const byId = todos.find((t) => t.id === id);
  if (byId) return byId;
  const n = str(text || id).toLowerCase();
  const hits = n ? todos.filter((t) => t.text.toLowerCase().includes(n)) : [];
  return hits.length === 1 ? hits[0] : null;
}

/** Runs each action (skipping anything invalid) and returns one plain sentence per thing actually done. */
async function runActions(actions: unknown[], said: string, meds: Medication[]): Promise<string[]> {
  const numbers = numbersSaid(said);
  const out: string[] = [];
  const foods: Record<string, string[]> = {};
  for (const raw of actions) {
    const a = (raw ?? {}) as Record<string, unknown>;
    try {
      switch (a.type) {
        case 'add_todo': {
          const date = dateOf(a.date);
          const text = str(a.text);
          if (!date || !text) break;
          await addTodo(date, text);
          out.push(`Added “${text}” to ${onDay(date)}’s to-dos.`);
          break;
        }
        case 'set_todo_done': {
          const date = dateOf(a.date);
          if (!date) break;
          const todo = await findTodo(date, a.id, a.text);
          if (!todo) break;
          const done = bool(a.done, true);
          await setTodoDone(date, todo.id, done);
          out.push(done ? `Checked off “${todo.text}”.` : `Unchecked “${todo.text}”.`);
          break;
        }
        case 'move_todos': {
          const from = dateOf(a.from);
          const to = dateOf(a.to);
          if (!from || !to || from === to) break;
          const n = await moveTodos(from, to, a.which === 'all' ? 'all' : 'open');
          out.push(n ? `I moved ${n} ${n === 1 ? 'to-do' : 'to-dos'} from ${onDay(from)} to ${onDay(to)}.` : `There were no open to-dos on ${onDay(from)} to move.`);
          break;
        }
        case 'add_food': {
          const date = dateOf(a.date);
          const name = str(a.name, 60);
          // Only numbers the person actually said are kept.
          const keep = (v: unknown) => {
            const n = num(v);
            return n !== null && numbers.has(n) ? n : null;
          };
          const food = { name, calories: keep(a.calories), protein: keep(a.protein), sugar: keep(a.sugar), addedSugar: keep(a.addedSugar) };
          if (!date || (!name && food.calories === null)) break;
          await addFood(date, food);
          (foods[date] ??= []).push(food.calories === null ? `${name || 'a food'} (no numbers)` : `${name || 'a food'} (${food.calories.toLocaleString()} kcal)`);
          break;
        }
        case 'add_water':
        case 'set_water': {
          const date = dateOf(a.date);
          const n = num(a.glasses);
          if (!date || n === null || n < -30 || n > 30) break;
          const saved = a.type === 'add_water' ? await addWater(date, n) : await setWater(date, n);
          const total = saved?.water ?? 0;
          out.push(a.type === 'add_water' ? `Added ${n} ${n === 1 ? 'glass' : 'glasses'} of water: ${total} ${forDay(date)}.` : `Water ${forDay(date)} is now ${total} ${total === 1 ? 'glass' : 'glasses'}.`);
          break;
        }
        case 'set_steps': {
          const date = dateOf(a.date);
          const n = num(a.steps);
          if (!date || n === null || n < 0 || n > 1_000_000) break;
          await setSteps(date, Math.round(n));
          out.push(`Logged ${Math.round(n).toLocaleString()} steps ${forDay(date)}.`);
          break;
        }
        case 'set_exercise': {
          const date = dateOf(a.date);
          const text = str(a.exercise, 80);
          if (!date) break;
          const chip = ['Gym', 'Dance', 'Rest'].find((c) => c.toLowerCase() === text.toLowerCase());
          await setExercise(date, chip ?? text);
          out.push(text ? `Marked ${onDay(date)} as ${chip ? `a ${chip.toLowerCase()} day` : `“${text}”`}.` : `Cleared the exercise ${forDay(date)}.`);
          break;
        }
        case 'set_stretch': {
          const date = dateOf(a.date);
          if (!date) break;
          const done = bool(a.done, true);
          await setStretch(date, done);
          out.push(done ? `Ticked “I stretched” ${forDay(date)}.` : `Unticked the stretch ${forDay(date)}.`);
          break;
        }
        case 'set_med_taken': {
          const date = dateOf(a.date);
          const med = findMed(meds, a.id, a.name);
          if (!date || !med) break;
          const taken = bool(a.taken, true);
          await setMedTaken(date, med, taken);
          out.push(taken ? `Checked off ${med.name} ${forDay(date)}.` : `Unchecked ${med.name} ${forDay(date)}.`);
          break;
        }
        case 'add_positive': {
          const text = str(a.text, 300);
          if (!text) break;
          await addStandalonePositive(text);
          notifyDataChanged();
          out.push(`Added a positive: “${text}”.`);
          break;
        }
      }
    } catch {
      /* this one didn't save; the others still count */
    }
  }
  for (const [date, list] of Object.entries(foods)) {
    out.push(`Logged ${list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`} ${forDay(date)}.`);
  }
  return out;
}
