/*
  The floating voice assistant, on the device side. It sends the short chat plus a small picture of the relevant
  days to /api/assistant, then carries out the actions that come back through the very same functions the Daily
  Sprout buttons use (so every screen shows the change at once), and writes the confirmation from what actually
  happened. Nothing here is saved: the chat lives only in the open panel.
*/
import { isValidDayKey } from './calendar';
import { MOODS, getQuickEntry, todayKey, type Mood } from './journal';
import { INTENTION_MAX, MED_NAME_MAX, MED_TIMING_MAX, addMedication, getHealthDay, listMedications, type Medication } from './health';
import { addStandalonePositive } from './positives';
import { notifyDataChanged } from './dataEvents';
import {
  addFood,
  addTodo,
  addWater,
  dayName,
  moveTodos,
  setExercise,
  setIntention,
  setMedTaken,
  setQuickMood,
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
    const quick = await getQuickEntry(key);
    days[key] = {
      mood: quick?.mood ?? null,
      intention: d?.intention ?? '',
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
/** What one spoken request produced: one line per toast, and whether the last line is a question to answer. */
export type AssistantResult = { lines: string[]; question: string | null };

/** One turn: carries out what was asked and returns a line for each thing done or not done. */
export async function askAssistant(page: string, day: string, chat: AssistantMessage[], signal?: AbortSignal): Promise<AssistantResult> {
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
  const data = (await res.json().catch(() => null)) as { say?: unknown; actions?: unknown; ask?: unknown; error?: unknown } | null;
  if (!res.ok || !data) {
    throw new AssistantError(
      data?.error === 'daily_limit' ? 'That’s all the help I can give today. Everything still works by hand.' : 'Something went wrong on my side. Please try again.',
    );
  }
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const say = typeof data.say === 'string' ? data.say.trim() : '';
  const asking = !!say && (data.ask === true || /\?\s*$/.test(say));
  const said = chat.filter((m) => m.role === 'user').map((m) => m.content).join(' ');
  const lines = actions.length ? await runActions(actions, said, medications) : [];
  if (say) lines.push(say); // what it couldn't do, or the question it needs answered
  if (!lines.length) lines.push('Sorry, I didn’t catch that. Could you say it another way?');
  return { lines, question: asking ? say : null };
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

/** The day's quick-entry mood from what the assistant sent ("good" → "Good"), or null. */
const moodOf = (v: unknown): Mood | null => MOODS.find((m) => m.toLowerCase() === str(v, 20).toLowerCase()) ?? null;

/**
 * Runs every action and returns one short line for each: what was done, or — when an action can't be done —
 * a plain sentence saying so. Nothing is ever skipped silently.
 */
async function runActions(actions: unknown[], said: string, meds: Medication[]): Promise<string[]> {
  const numbers = numbersSaid(said);
  const out: string[] = [];
  const foods: Record<string, string[]> = {};
  const noDay = 'I couldn’t tell which day you meant for one part, so I left it. Could you say the day?';
  for (const raw of actions) {
    const a = (raw ?? {}) as Record<string, unknown>;
    try {
      switch (a.type) {
        case 'add_todo': {
          const date = dateOf(a.date);
          const text = str(a.text);
          if (!date) { out.push(noDay); break; }
          if (!text) { out.push('I couldn’t catch the to-do’s words. Could you say it again?'); break; }
          await addTodo(date, text);
          out.push(`Added “${text}” to ${onDay(date)}’s to-dos.`);
          break;
        }
        case 'set_todo_done': {
          const date = dateOf(a.date);
          if (!date) { out.push(noDay); break; }
          const todo = await findTodo(date, a.id, a.text);
          if (!todo) { out.push(`I couldn’t find that to-do on ${onDay(date)}.`); break; }
          const done = bool(a.done, true);
          await setTodoDone(date, todo.id, done);
          out.push(done ? `Checked off “${todo.text}”.` : `Unchecked “${todo.text}”.`);
          break;
        }
        case 'move_todos': {
          const from = dateOf(a.from);
          const to = dateOf(a.to);
          if (!from || !to || from === to) { out.push('I couldn’t tell which days to move the to-dos between.'); break; }
          const n = await moveTodos(from, to, a.which === 'all' ? 'all' : 'open');
          out.push(n ? `Moved ${n} ${n === 1 ? 'to-do' : 'to-dos'} from ${onDay(from)} to ${onDay(to)}.` : `There were no open to-dos on ${onDay(from)} to move.`);
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
          if (!date) { out.push(noDay); break; }
          if (!name && food.calories === null) { out.push('I couldn’t tell which food to log.'); break; }
          await addFood(date, food);
          (foods[date] ??= []).push(food.calories === null ? `${name || 'a food'} (no numbers)` : `${name || 'a food'} (${food.calories.toLocaleString()} kcal)`);
          break;
        }
        case 'add_water':
        case 'set_water': {
          const date = dateOf(a.date);
          const n = num(a.glasses);
          if (!date) { out.push(noDay); break; }
          if (n === null || n < -30 || n > 30) { out.push('I couldn’t tell how many glasses of water.'); break; }
          const saved = a.type === 'add_water' ? await addWater(date, n) : await setWater(date, n);
          const total = saved?.water ?? 0;
          out.push(a.type === 'add_water' ? `Added ${n} ${n === 1 ? 'glass' : 'glasses'} of water: ${total} ${forDay(date)}.` : `Set water ${forDay(date)} to ${total} ${total === 1 ? 'glass' : 'glasses'}.`);
          break;
        }
        case 'set_steps': {
          const date = dateOf(a.date);
          const n = num(a.steps);
          if (!date) { out.push(noDay); break; }
          if (n === null || n < 0 || n > 1_000_000) { out.push('I couldn’t tell how many steps.'); break; }
          await setSteps(date, Math.round(n));
          out.push(`Logged ${Math.round(n).toLocaleString()} steps ${forDay(date)}.`);
          break;
        }
        case 'set_exercise': {
          const date = dateOf(a.date);
          const text = str(a.exercise, 80);
          if (!date) { out.push(noDay); break; }
          const chip = ['Gym', 'Dance', 'Rest'].find((c) => c.toLowerCase() === text.toLowerCase());
          await setExercise(date, chip ?? text);
          out.push(text ? `Set exercise to ${chip ?? `“${text}”`} ${forDay(date)}.` : `Cleared the exercise ${forDay(date)}.`);
          break;
        }
        case 'set_stretch': {
          const date = dateOf(a.date);
          if (!date) { out.push(noDay); break; }
          const done = bool(a.done, true);
          await setStretch(date, done);
          out.push(done ? `Ticked “I stretched” ${forDay(date)}.` : `Unticked the stretch ${forDay(date)}.`);
          break;
        }
        case 'add_medication': {
          const name = str(a.name, MED_NAME_MAX);
          if (!name) { out.push('I couldn’t catch the medication’s name. Could you say it again?'); break; }
          const already = meds.find((m) => m.name.toLowerCase() === name.toLowerCase());
          if (already) { out.push(`${already.name} is already on your medications.`); break; }
          const med = await addMedication(name, str(a.timing, MED_TIMING_MAX));
          meds.push(med); // so a "and I took it" in the same message can tick it
          notifyDataChanged();
          out.push(`Added ${med.name} to your medications${med.timing ? ` (${med.timing})` : ''}.`);
          break;
        }
        case 'set_med_taken': {
          const date = dateOf(a.date);
          if (!date) { out.push(noDay); break; }
          const med = findMed(meds, a.id, a.name);
          if (!med) { out.push(`I couldn’t find ${str(a.name) ? `“${str(a.name)}”` : 'that one'} on your medications, so nothing was ticked.`); break; }
          const taken = bool(a.taken, true);
          await setMedTaken(date, med, taken);
          out.push(taken ? `Checked off ${med.name} ${forDay(date)}.` : `Unchecked ${med.name} ${forDay(date)}.`);
          break;
        }
        case 'set_mood': {
          const date = dateOf(a.date);
          const mood = moodOf(a.mood);
          if (!date) { out.push(noDay); break; }
          if (!mood) { out.push('I couldn’t match that feeling to one of the moods. Could you say it another way?'); break; }
          const result = await setQuickMood(date, mood, str(a.note, 500));
          out.push(`Set ${onDay(date)}’s mood to ${mood}.`);
          if (result === 'set+note') out.push(`Saved your note in ${onDay(date)}’s quick entry.`);
          break;
        }
        case 'set_intention': {
          const date = dateOf(a.date);
          const text = str(a.text, INTENTION_MAX).replace(/^(today|tomorrow)?\s*i('|’)ll try\s*/i, '');
          if (!date) { out.push(noDay); break; }
          if (!text) { out.push('I couldn’t catch what you’d like to try.'); break; }
          await setIntention(date, text);
          out.push(`Set ${onDay(date)}’s little sprout: I’ll try ${text.replace(/[.!]+$/, '')}.`);
          break;
        }
        case 'add_positive': {
          const text = str(a.text, 300);
          if (!text) { out.push('I couldn’t catch the positive’s words.'); break; }
          await addStandalonePositive(text);
          notifyDataChanged();
          out.push(`Added a positive: “${text}”.`);
          break;
        }
        default:
          out.push('There was one part I can’t do here, so I left it.');
      }
    } catch {
      out.push('One part didn’t save. Please try that bit again.');
    }
  }
  for (const [date, list] of Object.entries(foods)) {
    out.push(`Logged ${list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`} ${forDay(date)}.`);
  }
  return out;
}
