/*
  The floating voice assistant, on the device side. It sends the short chat plus a small picture of the relevant
  days to /api/assistant, then carries out the actions that come back through the very same functions the Daily
  Sprout buttons use (so every screen shows the change at once), and writes the confirmation from what actually
  happened. Nothing here is saved: the chat lives only in the open panel.
*/
import { isValidDayKey } from './calendar';
import { ONE_YEAR_DAYS, daysBetween, fullDate, resolveSpokenDate } from './spokenDate';
import { beginUndo, endUndo, noteCreated, type UndoSnapshot } from './undo';
import { closest, kShorthand, likeness, negated, numbersIn, ordinal, spelledAlike } from './voiceText';
import { MEDICATIONS_STORE } from './db';
import { LIMITS, MOODS, getQuickEntry, todayKey, type Mood } from './journal';
import { INTENTION_MAX, MED_NAME_MAX, MED_TIMING_MAX, addMedication, getHealthDay, listMedications, type FoodLog, type Medication } from './health';
import { notifyDataChanged } from './dataEvents';
import {
  addFood,
  addTodo,
  addWater,
  dayName,
  allFoodNames,
  foodKey,
  knownFoods,
  deleteFood,
  deleteTodo,
  moveTodo,
  moveTodos,
  renameTodo,
  replaceFood,
  setExercise,
  setIntention,
  setMedTaken,
  updateQuickEntry,
  setStretch,
  setSteps,
  setTodoDone,
  setWater,
  shiftDay,
} from './sprout';

export type AssistantMessage = { role: 'user' | 'assistant'; content: string };

export class AssistantError extends Error {}

/**
 * The days Ask Thrive works with: the day on screen ("today") and the day after it can be changed; the day before
 * can only be read (to answer, or to copy from). Nothing further away is sent or changed.
 */
/** Something the last recording added or changed, so "that" and "it" in the next one can find it. Memory only. */
export type RecentItem = { kind: 'food' | 'todo'; date: string; id: string };

async function buildContext(page: string, day: string, recent: RecentItem[]) {
  const today = todayKey();
  const yesterday = shiftDay(day, -1);
  const tomorrow = shiftDay(day, 1);
  const days: Record<string, unknown> = {};
  for (const key of [yesterday, day, tomorrow]) {
    const d = await getHealthDay(key);
    const quick = await getQuickEntry(key);
    days[key] = {
      name: key === day ? 'today (the day on screen)' : key === tomorrow ? 'tomorrow' : 'yesterday',
      weekday: new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' }),
      canChange: key !== yesterday,
      mood: quick?.mood ?? null,
      intention: d?.intention ?? '',
      todos: (d?.todos ?? []).map((t) => ({ id: t.id, text: t.text, done: t.done })),
      foods: (d?.foods ?? []).map((f) => ({
        id: f.id,
        name: f.name || 'something',
        calories: f.calories,
        protein: f.protein,
        sugar: f.sugar,
        addedSugar: f.addedSugar,
        ...(f.estimate ? { estimate: true } : {}),
      })),
      water: d?.water ?? 0,
      steps: d?.steps ?? null,
      exercise: d?.exercise ?? '',
      stretch: !!d?.stretch,
      medsTaken: (d?.meds ?? []).map((m) => m.id),
    };
  }
  // What the last recording added or changed (newest last), with each one's details, wherever it landed.
  const recentItems: unknown[] = [];
  for (const item of recent) {
    const d = await getHealthDay(item.date);
    if (item.kind === 'food') {
      const f = d?.foods?.find((x) => x.id === item.id);
      if (f) recentItems.push({ kind: 'food', date: item.date, id: f.id, name: f.name, count: f.count ?? 1, calories: f.calories, protein: f.protein, sugar: f.sugar, addedSugar: f.addedSugar, estimate: !!f.estimate, portion: f.portion ?? '' });
    } else {
      const t = d?.todos?.find((x) => x.id === item.id);
      if (t) recentItems.push({ kind: 'todo', date: item.date, id: t.id, text: t.text, done: t.done });
    }
  }
  const meds = await listMedications();
  const known = await knownFoods().catch(() => [] as FoodLog[]);
  const foodNames = await allFoodNames().catch(() => [] as string[]);
  return {
    context: {
      page,
      realToday: today,
      realTodayWeekday: new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' }),
      contextDay: day,
      tomorrowOfContext: tomorrow,
      yesterdayOfContext: yesterday,
      days,
      medications: meds.map((m) => ({ id: m.id, name: m.name, usualTime: m.timing })),
      knownFoods: known.map((f) => ({ name: f.name, calories: f.calories, protein: f.protein, sugar: f.sugar, addedSugar: f.addedSugar })),
      recent: recentItems,
      foodNamesBefore: foodNames,
    },
    medications: meds,
    known,
    foodNames,
  };
}

/** One turn: returns the assistant's question/answer, or what was done. */
/** Quick-entry words waiting for a mood (a quick entry can't be saved without one); kept in memory only. */
export type HeldEntry = { date: string; note: string; intention: string };

/** What one spoken request produced: one line per toast, whether the last line is a question to answer, and any note waiting for a mood. */
export type AssistantResult = {
  lines: string[];
  question: string | null;
  held: HeldEntry | null;
  /** How to put back everything this recording changed (null if it changed nothing). */
  undo: UndoSnapshot | null;
  /** The foods and to-dos this recording added or changed, for "that" in the next one (null: keep the earlier ones). */
  recent: RecentItem[] | null;
  /** The language they spoke ("en", "es"…), so later toasts (like "Undone") can follow it. */
  lang: string;
};

/** Letters and digits only, for "is this already in the note?" checks. */
const wordsOnly = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * What follows "note:", "write down…", "jot down…", "make a note…" in what they said — to the end of that sentence.
 * The assistant is told to put these in the note; this makes sure it happens even if it didn't.
 */
export function explicitNotes(said: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[.!?]\s+|,\s*(?:and|also)\s+|\band\s+)(?:please\s+)?(?:note(?:\s+that)?|write\s+(?:this\s+)?down(?:\s+that)?|jot\s+(?:this\s+)?down(?:\s+that)?|make\s+a\s+note(?:\s+that)?|add\s+(?:a\s+note|to\s+my\s+note)(?:\s+that)?|put\s+in\s+my\s+note(?:\s+that)?)\s*[:,\-–—]?\s+([^.!?]+[.!?]?)/gi;
  for (const m of said.matchAll(re)) {
    const text = m[1].trim().replace(/^["“']|["”']$/g, '');
    if (wordsOnly(text).length >= 3) out.push(text.charAt(0).toUpperCase() + text.slice(1));
  }
  return out;
}

/** "Added to today's note." (and a word if the note was full). */
const noteLine = (date: string, trimmed: boolean) => `Added to ${onDay(date)}’s note${trimmed ? ' (the note was full, so the end was cut off)' : ''}.`;
const needMoodLine = (date: string) => `I’ve kept your note ready. How did ${onDay(date)} feel overall? Tell me and I’ll save it.`;

/** Adds to a day's quick entry; returns the lines to show, or the words to hold if the day has no mood yet. */
async function addToEntry(date: string, note: string, intention: string): Promise<{ lines: string[]; held: HeldEntry | null }> {
  const result = await updateQuickEntry(date, { note, intention });
  if (!result.saved) return { lines: [], held: { date, note, intention } };
  const lines: string[] = [];
  if (result.note) lines.push(noteLine(date, result.trimmed));
  if (result.intention) lines.push(`Set ${onDay(date)}’s intention for tomorrow: ${intention.replace(/[.!]+$/, '')}.`);
  return { lines, held: null };
}

const joinHeld = (a: HeldEntry | null, b: HeldEntry | null): HeldEntry | null =>
  !a ? b : !b ? a : a.date !== b.date ? b : { date: a.date, note: [a.note, b.note].filter(Boolean).join(' '), intention: b.intention || a.intention };

/** One turn: carries out what was asked and returns a line for each thing done or not done. */
export async function askAssistant(
  page: string,
  day: string,
  chat: AssistantMessage[],
  signal?: AbortSignal,
  heldBefore: HeldEntry | null = null,
  recent: RecentItem[] = [],
): Promise<AssistantResult> {
  const { context, medications, known, foodNames } = await buildContext(page, day, recent);
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
  const data = (await res.json().catch(() => null)) as { say?: unknown; actions?: unknown; ask?: unknown; unplaced?: unknown; cannot?: unknown; lang?: unknown; error?: unknown } | null;
  if (!res.ok || !data) {
    throw new AssistantError(
      data?.error === 'daily_limit' ? 'That’s all the help I can give today. Everything still works by hand.' : 'Something went wrong on my side. Please try again.',
    );
  }
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const say = typeof data.say === 'string' ? data.say.trim() : '';
  const asking = !!say && (data.ask === true || /\?\s*$/.test(say));
  const said = chat.filter((m) => m.role === 'user').map((m) => m.content).join(' ');
  const latest = chat.at(-1)?.content ?? '';
  // Every record written from here on is copied first, so the whole recording can be undone in one tap.
  beginUndo();
  const run = actions.length ? await runActions(actions, said, medications, day, known, recent, foodNames, latest) : { lines: [], held: null, touched: [] };
  const lines = run.lines;
  let held = run.held;

  // "note: …" / "write down …" always reach the note, even if the assistant missed one.
  const noteNow = (await getQuickEntry(day))?.note ?? '';
  const inNote = (t: string) => wordsOnly(noteNow).includes(wordsOnly(t)) || (!!held && wordsOnly(held.note).includes(wordsOnly(t)));
  const missed = explicitNotes(latest).filter((t) => !inNote(t));
  if (missed.length) {
    const r = await addToEntry(day, missed.join(' '), '');
    if (r.lines.length && !lines.some((l) => l.startsWith(`Added to ${onDay(day)}’s note`))) lines.push(...r.lines);
    held = joinHeld(held, r.held);
  }

  // Words held from an earlier question about the mood: saved as soon as that day has a mood.
  if (heldBefore) {
    if ((await getQuickEntry(heldBefore.date))?.mood) {
      const r = await addToEntry(heldBefore.date, heldBefore.note, heldBefore.intention);
      for (const l of r.lines) if (!lines.includes(l)) lines.push(l);
    } else held = joinHeld(heldBefore, held);
  }

  const undo = await endUndo();

  // Anything heard that fits no field, or asked that can't be done here, is shown — nothing is dropped without a word.
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && !!u.trim()).slice(0, 10) : []);
  for (const u of strings(data.unplaced)) lines.push(`Couldn’t place: “${str(u, 200).replace(/^["“]|["”]$/g, '')}”`);
  for (const c of strings(data.cannot)) lines.push(`Couldn’t do: ${str(c, 200).replace(/[.!]+$/, '')}.`);
  if (say) lines.push(say); // the question it needs answered, or a problem to explain
  if (!lines.length && !held) lines.push(latest.trim() ? `Couldn’t place: “${str(latest, 200)}”` : 'Sorry, I didn’t catch that. Could you say it another way?');

  let question = asking ? say : null;
  if (held && !question) {
    question = needMoodLine(held.date);
    lines.push(question);
  }
  // They spoke another language: the confirmations follow it (names, quotes and numbers stay as they are).
  const lang = typeof data.lang === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(data.lang) ? data.lang.toLowerCase() : 'en';
  let shown = [...new Set(lines)]; // the same line twice (e.g. an action and a "cannot" about one thing) shows once
  if (!lang.startsWith('en')) {
    const english = shown;
    shown = await translateLines(english, lang, signal);
    if (question) question = shown[english.indexOf(question)] ?? question;
  }
  return { lines: shown, question, held, undo, recent: run.touched.length ? run.touched : null, lang };
}

/** The confirmation lines in another language; the English lines if that doesn't work (they're never lost). */
export async function translateLines(lines: string[], lang: string, signal?: AbortSignal): Promise<string[]> {
  if (!lines.length || lang.startsWith('en')) return lines;
  try {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ translate: { lang, lines } }),
      signal,
    });
    const data = (await res.json().catch(() => null)) as { lines?: unknown } | null;
    const out = res.ok && Array.isArray(data?.lines) ? data.lines.filter((l): l is string => typeof l === 'string' && !!l.trim()) : [];
    return out.length === lines.length ? out : lines;
  } catch {
    return lines;
  }
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

/**
 * Every number the person actually said — digits, "5k", and number words ("eight thousand five hundred") — so
 * nothing is ever invented.
 */
function numbersSaid(text: string): Set<number> {
  const out = numbersIn(text);
  if (/\b(no|none|zero|without)\b|\bfree\b/i.test(text)) out.add(0); // "no sugar", "sugar-free"
  return out;
}

/**
 * The medication they meant: by id, by its exact name, or — for a misheard name ("magnesian") — the one name on
 * their list that's clearly closest. `heard` is set when the words weren't the exact name, so the toast can say so.
 */
function findMed(meds: Medication[], id: unknown, name: unknown): { med: Medication | null; heard: string | null } {
  const byId = meds.find((m) => m.id === id);
  const spoken = str(name, 60);
  if (byId) return { med: byId, heard: spoken && spoken.toLowerCase() !== byId.name.toLowerCase() && likeness(spoken, byId.name) < 0.9 ? spoken : null };
  if (!spoken) return { med: null, heard: null };
  const exact = meds.find((m) => m.name.toLowerCase() === spoken.toLowerCase());
  if (exact) return { med: exact, heard: null };
  const near = closest(spoken, meds, (m) => m.name, 0.75);
  return { med: near, heard: near && likeness(spoken, near.name) < 0.9 ? spoken : null };
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

/** Numbers said right next to their nutrient ("200 calories", "20 grams of protein"): these are used exactly. */
function statedNutrients(text: string): { calories: number | null; protein: number | null } {
  const t = text.replace(/(\d),(\d{3})/g, '$1$2');
  const cal = t.match(/(\d+(?:\.\d+)?)\s*-?\s*(?:k?cals?|kcals?|calories?|calor[ií]as?|kalorien|calorie|kalori|калори\w*)(?![\p{L}])/iu);
  const pro = t.match(/(\d+(?:\.\d+)?)\s*-?\s*(?:g|grams?|gramos?|grammes?|gramm|grammi|gramas?)\s*(?:of\s+|de\s+|di\s+|d['’]\s*)?(?:protein|prote[ií]nas?|prot[eé]ines?|proteine|proteína)(?![\p{L}])/iu);
  return { calories: cal ? Number(cal[1]) : null, protein: pro ? Number(pro[1]) : null };
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const kcalText = (n: number) => n.toLocaleString();

/**
 * Runs every action and returns one short line for each: what was done, or — when an action can't be done —
 * "Couldn't do: …". Nothing is ever skipped silently. Only the day on screen and the day after it are changed;
 * the day before is only read.
 */
async function runActions(
  actions: unknown[],
  said: string,
  meds: Medication[],
  day: string,
  known: FoodLog[],
  recent: RecentItem[] = [],
  foodNames: string[] = [],
  latest = said,
): Promise<{ lines: string[]; held: HeldEntry | null; touched: RecentItem[] }> {
  const touched: RecentItem[] = [];
  const touch = (kind: RecentItem['kind'], date: string, id: string) => {
    const i = touched.findIndex((t) => t.id === id);
    if (i >= 0) touched.splice(i, 1);
    touched.push({ kind, date, id });
  };
  const numbers = numbersSaid(said);
  const tomorrow = shiftDay(day, 1);
  const yesterday = shiftDay(day, -1);
  const canChange = new Set([day, tomorrow]);
  const canRead = new Set([yesterday, day, tomorrow]);
  let held: HeldEntry | null = null;
  const out: string[] = [];
  const foods: Record<string, string[]> = {};
  const foodActions = actions.filter((x) => (x as { type?: unknown } | null)?.type === 'add_food').length;
  const stated = foodActions === 1 ? statedNutrients(said) : { calories: null, protein: null };

  const realToday = todayKey();
  /** "today, Thursday, November 26" / "tomorrow, Friday, November 27" / "Tuesday, December 15": always the full date. */
  const dateLabel = (d: string) => {
    const full = fullDate(d, realToday);
    return d === realToday ? `today, ${full}` : d === shiftDay(realToday, 1) ? `tomorrow, ${full}` : full;
  };
  /**
   * For to-dos and the Little sprout: any day from today up to a year ahead (and the day on screen). The words they
   * used ("December 15th", "next Friday") are read here on the device; the AI's own date is only a fallback.
   * A day in the past or too far away is said back and nothing is written.
   */
  const anyDay = (dateValue: unknown, whenValue: unknown): string | null => {
    const when = str(whenValue, 80);
    const fromWords = when ? resolveSpokenDate(when, realToday, day) : null;
    const date = fromWords ?? (typeof dateValue === 'string' && isValidDayKey(dateValue) ? dateValue : null);
    if (!date) {
      out.push(when ? `Couldn’t do: I couldn’t work out which day “${when}” is.` : 'Couldn’t do: one part, because I couldn’t tell which day you meant.');
      return null;
    }
    if (date === day) return date;
    if (date < realToday) { out.push(`Couldn’t do: ${fullDate(date, realToday)} is in the past.`); return null; }
    if (daysBetween(realToday, date) > ONE_YEAR_DAYS) { out.push(`Couldn’t do: ${fullDate(date, realToday)} is more than a year away.`); return null; }
    return date;
  };

  /** For corrections: the day on screen, or any day the last recording landed on. */
  const correctable = new Set([day, ...recent.map((x) => x.date)]);
  const correctDay = (v: unknown, what: string): string | null => {
    const date = typeof v === 'string' && isValidDayKey(v) ? v : day;
    if (correctable.has(date)) return date;
    out.push(`Couldn’t do: change ${what} on ${dateLabel(date)}. I can only correct today’s entries and the ones I just added.`);
    return null;
  };
  /** The most recently added food matching an id or a name on a day (and whether others shared that name). */
  const findFood = async (date: string, idValue: unknown, nameValue: unknown) => {
    const list = (await getHealthDay(date))?.foods ?? [];
    const byId = list.find((f) => f.id === idValue);
    const key = foodKey(str(nameValue, 60));
    const named = key ? list.filter((f) => foodKey(f.name) === key || foodKey(f.name).includes(key) || key.includes(foodKey(f.name))) : [];
    const pick = byId ?? [...named].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    const sameName = pick ? list.filter((f) => foodKey(f.name) === foodKey(pick.name)).length : 0;
    return { food: pick, several: sameName > 1 };
  };
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  /** "Cookie", "Cookie × 2", and — when several share the name — which one: "Cookie (160 kcal, logged at 3:05 PM)". */
  const foodTitle = (f: FoodLog, several: boolean) =>
    `${cap(f.name || 'a food')}${f.count && f.count > 1 ? ` × ${f.count}` : ''}${several ? ` (${f.calories === null ? 'no calories' : `${f.estimate ? 'about ' : ''}${kcalText(f.calories)} cal`}, logged at ${timeOf(f.createdAt)})` : ''}`;
  const g1 = (n: number) => Math.round(n * 10) / 10;
  /** ", 2nd today" when the same food is on that day more than once (logged normally — people do eat twice). */
  const rep = (date: string, name: string) => {
    const n = repeats.get(`${date}|${foodKey(name)}`) ?? 0;
    return n > 1 ? `, ${ordinal(n)} ${date === realToday ? 'today' : date === shiftDay(realToday, 1) ? 'for tomorrow' : `on ${dateLabel(date)}`}` : '';
  };
  const repeats = new Map<string, number>();
  const countSame = async (date: string, name: string) => {
    const n = ((await getHealthDay(date))?.foods ?? []).filter((f) => foodKey(f.name) === foodKey(name)).length;
    repeats.set(`${date}|${foodKey(name)}`, n);
    return n;
  };
  const talkedAboutSugar = /sugar/i.test(latest);

  /** A day that may be changed, or null after saying why not. */
  const writable = (v: unknown): string | null => {
    const date = dateOf(v);
    if (!date) out.push('Couldn’t do: one part, because I couldn’t tell which day you meant.');
    else if (!canChange.has(date)) out.push(`Couldn’t do: the part for ${dateLabel(date)}. I can only log that for today or tomorrow.`);
    else return date;
    return null;
  };
  const readable = (v: unknown): string | null => {
    const date = dateOf(v);
    if (!date) out.push('Couldn’t do: one part, because I couldn’t tell which day you meant.');
    else if (!canRead.has(date)) out.push(`Couldn’t do: the part about ${onDay(date)}. I can only look at yesterday, today and tomorrow.`);
    else return date;
    return null;
  };

  for (const raw of actions) {
    const a = (raw ?? {}) as Record<string, unknown>;
    try {
      switch (a.type) {
        case 'add_todo': {
          const text = str(a.text);
          if (!text) { out.push('Couldn’t do: add that to-do, because I didn’t catch its words.'); break; }
          const date = anyDay(a.date, a.when);
          if (!date) break;
          // Already there (or a near miss of one that is)? Use that one instead of adding a near-duplicate.
          const open = ((await getHealthDay(date))?.todos ?? []).filter((x) => !x.done);
          const existing = closest(text, open, (x) => x.text, 0.85);
          if (existing) {
            touch('todo', date, existing.id);
            out.push(`“${existing.text}” is already on the to-dos for ${dateLabel(date)}, so I didn’t add it again.`);
            break;
          }
          const savedDay = await addTodo(date, text);
          const added = savedDay?.todos?.at(-1);
          if (added) touch('todo', date, added.id);
          out.push(`Added “${text}” to ${dateLabel(date)}.`);
          break;
        }
        case 'set_todo_done': {
          const date = anyDay(a.date, a.when);
          if (!date) break;
          const todo = await findTodo(date, a.id, a.text);
          if (!todo) { out.push(`Couldn’t do: find that to-do on ${onDay(date)}’s list.`); break; }
          const done = bool(a.done, true);
          await setTodoDone(date, todo.id, done);
          out.push(done ? `Checked off “${todo.text}”.` : `Unchecked “${todo.text}”.`);
          break;
        }
        case 'move_todos': {
          const from = anyDay(a.from, a.fromWhen);
          const to = from && anyDay(a.to, a.when);
          if (!from || !to) break;
          if (from === to) { out.push('Couldn’t do: move the to-dos, because they’re already on that day.'); break; }
          const all = a.which === 'all';
          const before = (await getHealthDay(from))?.todos ?? [];
          const n = await moveTodos(from, to, all ? 'all' : 'open');
          const stayed = all ? 0 : before.filter((t) => t.done).length;
          const rest = stayed ? ` ${stayed === 1 ? 'The finished one stays' : `The ${stayed} finished ones stay`} on ${onDay(from)}.` : '';
          out.push(
            n
              ? `Moved ${n} ${n === 1 ? 'to-do' : 'to-dos'} from ${dateLabel(from)} to ${dateLabel(to)}.${rest}`
              : `There were no ${all ? '' : 'unfinished '}to-dos on ${onDay(from)} to move.${rest}`,
          );
          break;
        }
        case 'move_todo': {
          const from = anyDay(a.from, a.fromWhen);
          const to = from && anyDay(a.to, a.when);
          if (!from || !to) break;
          const todo = await findTodo(from, a.id, a.text);
          if (!todo) {
            out.push(`Couldn’t do: find ${str(a.text) ? `“${str(a.text)}”` : 'that to-do'} on ${onDay(from)}’s list, so nothing moved.`);
            break;
          }
          if (from === to) { out.push(`“${todo.text}” is already on ${onDay(to)}’s list.`); break; }
          await moveTodo(from, to, todo.id);
          touch('todo', to, todo.id);
          out.push(`Moved “${todo.text}” from ${dateLabel(from)} to ${dateLabel(to)}.`);
          break;
        }
        case 'add_food': {
          const date = writable(a.date);
          if (!date) break;
          const spokenName = str(a.name, 60);
          if (!spokenName) { out.push('Couldn’t do: log that food, because I couldn’t tell what it was.'); break; }
          // "I skipped lunch", "no coffee": a negated food is never logged.
          if (negated(latest, spokenName)) { out.push(`Didn’t log ${spokenName.toLowerCase()}, because you said you didn’t have it.`); break; }
          // A name already used before keeps its exact wording; a near miss ("barbells bar") becomes that name.
          const sameName = foodNames.find((n) => foodKey(n) === foodKey(spokenName));
          const nearName = sameName ? null : closest(spokenName, foodNames, (n) => n, 0.85, spelledAlike);
          const name = sameName ?? nearName ?? spokenName;
          const matchedNote = nearName ? ` (matched to your “${nearName}”)` : '';
          const knownFood = known.find((f) => foodKey(f.name) === foodKey(name)) ?? null;
          const wantsEstimate = a.estimate === true;
          // A food logged before with my own numbers: those numbers, exactly (unless I said new ones now).
          if (knownFood && wantsEstimate && stated.calories === null && stated.protein === null) {
            const { calories, protein, sugar, addedSugar } = knownFood;
            const k = await addFood(date, { name: knownFood.name, calories, protein, sugar, addedSugar });
            if (k?.foods?.length) touch('food', date, k.foods.at(-1)!.id);
            await countSame(date, knownFood.name);
            out.push(`Logged ${knownFood.name} (${calories === null ? 'no calories' : `${kcalText(calories)} cal`}${rep(date, knownFood.name)}) ${forDay(date)}, with your numbers from before.`);
            break;
          }
          const knownValues = new Set([knownFood?.calories, knownFood?.protein, knownFood?.sugar, knownFood?.addedSugar].filter((v): v is number => v !== null && v !== undefined));
          let estimated = false;
          // A number I said (or my own from before) is kept exactly; anything else only as a marked estimate.
          const pick = (v: unknown, max: number, forced: number | null) => {
            if (forced !== null) return forced;
            const n = num(v);
            if (n === null) return null;
            if (numbers.has(n) || knownValues.has(n)) return n;
            if (!wantsEstimate || n < 0 || n > max) return null;
            estimated = true;
            return n;
          };
          const calories = pick(a.calories, 3000, stated.calories);
          const protein = pick(a.protein, 300, stated.protein);
          const sugar = pick(a.sugar, 300, null);
          let addedSugar = pick(a.addedSugar, 300, null);
          if (estimated && sugar !== null && addedSugar !== null && addedSugar > sugar) addedSugar = sugar;
          const portion = estimated ? str(a.portion, 60).replace(/^\(|\)$/g, '') : '';
          const savedFood = await addFood(date, { name, calories, protein, sugar, addedSugar, estimate: estimated, portion });
          if (savedFood?.foods?.length) touch('food', date, savedFood.foods.at(-1)!.id);
          const times = await countSame(date, name);
          const sugarNote = talkedAboutSugar && (sugar !== null || addedSugar !== null) ? `, ${sugar ?? '—'} g sugar (${addedSugar ?? '—'} g added)` : '';
          if (estimated) {
            const when = date === day ? '' : ` ${forDay(date)}`;
            const again = times > 1 ? ` (${rep(date, name).slice(2)})` : '';
            out.push(`${cap(name)}${again}, ${calories === null ? 'logged' : `about ${kcalText(calories)} cal`}${portion ? ` (${portion})` : ''}${sugarNote}${when}${matchedNote}.`);
          } else {
            (foods[date] ??= []).push(
              (calories === null ? `${name} (no numbers${rep(date, name)})` : `${name} (${kcalText(calories)} cal${rep(date, name)})`) + sugarNote + matchedNote,
            );
          }
          break;
        }
        case 'copy_food': {
          const from = readable(a.from);
          const to = from && writable(a.to);
          if (!from || !to) break;
          const list = (await getHealthDay(from))?.foods ?? [];
          const n = str(a.name || a.id).toLowerCase();
          const food = list.find((f) => f.id === a.id) ?? (n ? list.filter((f) => f.name.toLowerCase().includes(n)) : []).at(0) ?? null;
          if (!food) { out.push(`Couldn’t do: find that food on ${onDay(from)}, so nothing was copied.`); break; }
          const { name, calories, protein, sugar, addedSugar, estimate, portion } = food;
          const copied = await addFood(to, { name, calories, protein, sugar, addedSugar, estimate: !!estimate, portion });
          if (copied?.foods?.length) touch('food', to, copied.foods.at(-1)!.id);
          out.push(`Copied ${name || 'a food'}${calories === null ? '' : ` (${estimate ? 'about ' : ''}${kcalText(calories)} cal)`} from ${onDay(from)} to ${onDay(to)}.`);
          break;
        }
        case 'update_food': {
          // "that was two cookies", "actually 300 calories": the same entry, new count or numbers; an estimate stays marked.
          const date = correctDay(a.date, 'a food');
          if (!date) break;
          const { food, several } = await findFood(date, a.id, a.name);
          if (!food) { out.push(`Couldn’t do: find ${str(a.name) ? `“${str(a.name)}”` : 'that food'} in the foods for ${dateLabel(date)}, so nothing was changed.`); break; }
          const saidNum = (v: unknown) => {
            const n = num(v);
            return n !== null && numbers.has(n) ? n : null;
          };
          const count = saidNum(a.count);
          const prev = food.count ?? 1;
          const factor = count && count > 0 && count <= 50 ? count / prev : 1;
          const scale = (v: number | null, whole: boolean) => (v === null ? null : whole ? Math.round(v * factor) : g1(v * factor));
          const calories = stated.calories ?? saidNum(a.calories) ?? scale(food.calories, true);
          const protein = stated.protein ?? saidNum(a.protein) ?? scale(food.protein, false);
          const sugar = saidNum(a.sugar) ?? scale(food.sugar, false);
          let addedSugar = saidNum(a.addedSugar) ?? scale(food.addedSugar, false);
          if (sugar !== null && addedSugar !== null && addedSugar > sugar) addedSugar = sugar;
          const nothing = factor === 1 && calories === food.calories && protein === food.protein && sugar === food.sugar && addedSugar === food.addedSugar;
          if (nothing) { out.push(`Couldn’t do: work out what to change about ${foodTitle(food, several)}.`); break; }
          const newCount = count && count > 0 && count <= 50 ? Math.round(count) : prev;
          const portion = food.estimate ? (str(a.portion, 60).replace(/^\(|\)$/g, '') || food.portion || '') : '';
          await replaceFood(date, food.id, { name: food.name, calories, protein, sugar, addedSugar, estimate: !!food.estimate, portion, count: newCount });
          touch('food', date, food.id);
          const about = food.estimate ? 'about ' : '';
          out.push(
            factor !== 1
              ? `${foodTitle(food, several).replace(/ × \d+/, '')} updated to ${newCount}${calories === null ? '' : `, ${about}${kcalText(calories)} cal`}.`
              : `${foodTitle(food, several)} updated: ${calories === null ? '' : `${about}${kcalText(calories)} cal`}${protein !== food.protein && protein !== null ? `, protein ${protein} g` : ''}${sugar !== food.sugar && sugar !== null ? `, sugar ${sugar} g` : ''}${addedSugar !== food.addedSugar && addedSugar !== null ? `, added sugar ${addedSugar} g` : ''}.`.replace(': ,', ':'),
          );
          break;
        }
        case 'replace_food': {
          // "it was tea, not coffee": the same entry becomes the corrected food (its numbers as for any new food).
          const date = correctDay(a.date, 'a food');
          if (!date) break;
          const { food, several } = await findFood(date, a.id, a.oldName ?? a.name);
          const name = str(a.name, 60);
          if (!food) { out.push(`Couldn’t do: find ${str(a.oldName) ? `“${str(a.oldName)}”` : 'that food'} in the foods for ${dateLabel(date)}, so nothing was swapped.`); break; }
          if (!name) { out.push(`Couldn’t do: swap ${foodTitle(food, several)}, because I didn’t catch what it should be.`); break; }
          const knownFood = known.find((f) => foodKey(f.name) === foodKey(name)) ?? null;
          let estimated = false;
          const pick = (v: unknown, max: number) => {
            const n = num(v);
            if (n === null) return null;
            if (numbers.has(n) || (knownFood && [knownFood.calories, knownFood.protein, knownFood.sugar, knownFood.addedSugar].includes(n))) return n;
            if (a.estimate !== true || n < 0 || n > max) return null;
            estimated = true;
            return n;
          };
          const next = knownFood
            ? { name: knownFood.name, calories: knownFood.calories, protein: knownFood.protein, sugar: knownFood.sugar, addedSugar: knownFood.addedSugar }
            : { name, calories: stated.calories ?? pick(a.calories, 3000), protein: stated.protein ?? pick(a.protein, 300), sugar: pick(a.sugar, 300), addedSugar: pick(a.addedSugar, 300) };
          if (next.sugar !== null && next.addedSugar !== null && next.addedSugar > next.sugar) next.addedSugar = next.sugar;
          const portion = estimated ? str(a.portion, 60).replace(/^\(|\)$/g, '') : '';
          await replaceFood(date, food.id, { ...next, estimate: estimated, portion });
          touch('food', date, food.id);
          out.push(
            `Changed ${foodTitle(food, several)} to ${next.name}${next.calories === null ? '' : `, ${estimated ? 'about ' : ''}${kcalText(next.calories)} cal`}${portion ? ` (${portion})` : ''}.`,
          );
          break;
        }
        case 'remove_food': {
          const date = correctDay(a.date, 'a food');
          if (!date) break;
          const { food, several } = await findFood(date, a.id, a.name);
          if (!food) { out.push(`Couldn’t do: find ${str(a.name) ? `“${str(a.name)}”` : 'that food'} in the foods for ${dateLabel(date)}, so nothing was taken off.`); break; }
          await deleteFood(date, food.id);
          out.push(`Removed: ${foodTitle(food, several)}${date === day ? '' : ` from ${dateLabel(date)}`}.`);
          break;
        }
        case 'remove_todo': {
          const date = correctDay(a.date, 'a to-do');
          if (!date) break;
          const todo = await findTodo(date, a.id, a.text);
          if (!todo) { out.push(`Couldn’t do: find ${str(a.text) ? `“${str(a.text)}”` : 'that to-do'} in the to-dos for ${dateLabel(date)}, so nothing was taken off.`); break; }
          await deleteTodo(date, todo.id);
          out.push(`Removed: “${todo.text}” from ${dateLabel(date)}.`);
          break;
        }
        case 'update_todo': {
          const date = correctDay(a.date, 'a to-do');
          if (!date) break;
          const todo = await findTodo(date, a.id, a.oldText);
          const text = str(a.text);
          if (!todo) { out.push(`Couldn’t do: find ${str(a.oldText) ? `“${str(a.oldText)}”` : 'that to-do'} in the to-dos for ${dateLabel(date)}, so nothing was changed.`); break; }
          if (!text) { out.push(`Couldn’t do: change “${todo.text}”, because I didn’t catch the new words.`); break; }
          await renameTodo(date, todo.id, text);
          touch('todo', date, todo.id);
          out.push(`Changed “${todo.text}” to “${text}” on ${dateLabel(date)}.`);
          break;
        }
        case 'add_water':
        case 'set_water': {
          const date = writable(a.date);
          if (!date) break;
          const n = num(a.glasses);
          if (n === null || n < -30 || n > 30) { out.push('Couldn’t do: log the water, because I didn’t catch how many glasses.'); break; }
          const saidIt = numbers.has(Math.abs(n));
          // Setting a total needs the number they said; adding with no amount said counts 1 — and says so.
          if (a.type === 'set_water' && !saidIt) { out.push('Couldn’t do: set the water, because I didn’t catch how many glasses.'); break; }
          const glasses = a.type === 'add_water' && !saidIt ? 1 : n;
          const saved = a.type === 'add_water' ? await addWater(date, glasses) : await setWater(date, glasses);
          const total = saved?.water ?? 0;
          const g = (k: number) => `${k.toLocaleString()} ${Math.abs(k) === 1 ? 'glass' : 'glasses'}`;
          out.push(
            a.type === 'add_water'
              ? `Water ${glasses >= 0 ? '+' : '−'}${g(Math.abs(glasses))}${saidIt ? '' : ' (no amount said, so I counted 1)'}. ${g(total)} ${forDay(date)}.`
              : `Set water to ${g(total)} ${forDay(date)}.`,
          );
          break;
        }
        case 'set_steps': {
          const date = writable(a.date);
          if (!date) break;
          const n = num(a.steps);
          if (n === null || n < 0 || n > 1_000_000 || !numbers.has(n)) { out.push('Couldn’t do: log the steps, because I didn’t catch the number.'); break; }
          const km = latest.match(/(\d+(?:\.\d+)?)\s*(?:km|kilomet(?:er|re)s?)\b/i);
          if (km && Number(km[1]) === n) { out.push(`Couldn’t do: log ${km[0]} as steps. Say how many steps, or I can log it as exercise.`); break; }
          await setSteps(date, Math.round(n));
          const k = kShorthand(latest);
          const kNote = k && numbersIn(k).has(n) ? ` (“${k}” read as ${n.toLocaleString()} steps, not kilometers)` : '';
          out.push(`Logged ${Math.round(n).toLocaleString()} steps ${forDay(date)}${kNote}.`);
          break;
        }
        case 'set_exercise': {
          const date = writable(a.date);
          if (!date) break;
          let text = str(a.exercise, 80);
          let why = '';
          // "I didn't go to the gym" / "skipped dance": that's a rest day, never the activity itself.
          if (text && text.toLowerCase() !== 'rest' && negated(latest, text)) {
            why = ` (you said you didn’t ${text.toLowerCase() === 'gym' ? 'go to the gym' : `do ${text.toLowerCase()}`})`;
            text = 'Rest';
          }
          const chip = ['Gym', 'Dance', 'Rest'].find((c) => c.toLowerCase() === text.toLowerCase());
          const before = (await getHealthDay(date))?.exercise ?? '';
          await setExercise(date, chip ?? text);
          const was = before && before.toLowerCase() === (chip ?? text).toLowerCase() ? ' (it was already that)' : '';
          out.push(text ? `Set exercise to ${chip ?? `“${text}”`} ${forDay(date)}${why}${was}.` : `Cleared the exercise ${forDay(date)}.`);
          break;
        }
        case 'set_stretch': {
          const date = writable(a.date);
          if (!date) break;
          // "didn't stretch" always leaves it unticked, whatever was sent.
          const done = bool(a.done, true) && !negated(latest, 'stretch');
          const wasDone = !!(await getHealthDay(date))?.stretch;
          await setStretch(date, done);
          out.push(done ? `Ticked “I stretched” ${forDay(date)}.` : wasDone ? `Unticked “I stretched” ${forDay(date)}.` : `“I stretched” stays unticked ${forDay(date)}.`);
          break;
        }
        case 'add_medication': {
          const name = str(a.name, MED_NAME_MAX);
          if (!name) { out.push('Couldn’t do: add the medication, because I didn’t catch its name.'); break; }
          const already = meds.find((m) => m.name.toLowerCase() === name.toLowerCase()) ?? closest(name, meds, (m) => m.name, 0.75);
          if (already) {
            const heard = already.name.toLowerCase() === name.toLowerCase() ? '' : ` (heard “${name}”)`;
            out.push(`${already.name} is already on your medications${heard}, so I didn’t add it again.`);
            break;
          }
          const med = await addMedication(name, str(a.timing, MED_TIMING_MAX));
          noteCreated(MEDICATIONS_STORE, med.id); // Undo takes it off the list again
          meds.push(med); // so a "and I took it" in the same message can tick it
          notifyDataChanged();
          out.push(`Added ${med.name} to your medications${med.timing ? ` (${med.timing})` : ''}.`);
          break;
        }
        case 'set_med_taken': {
          const date = writable(a.date);
          if (!date) break;
          const { med, heard } = findMed(meds, a.id, a.name);
          if (!med) { out.push(`Couldn’t do: tick ${str(a.name) ? `“${str(a.name)}”` : 'that one'}, because it isn’t on your medications.`); break; }
          const notTaken = negated(latest, med.name) || (!!str(a.name) && negated(latest, str(a.name)));
          const taken = bool(a.taken, true) && !notTaken;
          await setMedTaken(date, med, taken);
          const heardNote = heard ? ` (heard “${heard}”)` : '';
          out.push(
            taken
              ? `Checked off ${med.name} ${forDay(date)}${heardNote}.`
              : notTaken
                ? `Left ${med.name} unticked ${forDay(date)}${heardNote}, since you said you didn’t take it.`
                : `Unchecked ${med.name} ${forDay(date)}${heardNote}.`,
          );
          break;
        }
        case 'set_mood': // older name: mood (and note) only
        case 'set_quick_entry': {
          const date = writable(a.date);
          if (!date) break;
          const mood = moodOf(a.mood);
          if (str(a.mood, 20) && !mood) out.push('Couldn’t do: match that feeling to one of the moods.');
          const note = str(a.note, LIMITS.note);
          const intention = str(a.intention, LIMITS.intention).replace(/^(tomorrow\s*)?i('|’)ll try\s*/i, '');
          if (!mood && !note && !intention) break;
          const result = await updateQuickEntry(date, { mood, note, intention });
          if (!result.saved) {
            // A quick entry needs a mood first: the words are held (in memory) and saved once they say how the day felt.
            held = joinHeld(held, { date, note, intention });
            break;
          }
          const moodWords = str(a.moodWords, 60);
          const from = moodWords && mood && moodWords.toLowerCase() !== mood.toLowerCase() ? ` (from “${moodWords}”)` : '';
          if (result.mood && mood) out.push(`Set ${onDay(date)}’s mood to ${mood}${from}.`);
          if (result.note) out.push(noteLine(date, result.trimmed));
          if (result.intention) out.push(`Set ${onDay(date)}’s quick entry intention for tomorrow: ${intention.replace(/[.!]+$/, '')}.`);
          break;
        }
        case 'set_intention': {
          const date = anyDay(a.date, a.when);
          if (!date) break;
          const text = str(a.text, INTENTION_MAX).replace(/^(today|tomorrow)?\s*,?\s*i('|’)ll try\s*/i, '').replace(/^(today|tomorrow)\s*,?\s*/i, '');
          if (!text) { out.push('Couldn’t do: set the little sprout, because I didn’t catch what you’d like to try.'); break; }
          await setIntention(date, text);
          out.push(`Set the little sprout for ${dateLabel(date)}: I’ll try ${text.replace(/[.!]+$/, '')}.`);
          break;
        }
        case 'add_positive':
          // Ask Thrive only fills Daily Sprout: positives are only ever added by hand.
          out.push('Couldn’t do: positives are added by hand in Growth.');
          break;
        default:
          out.push('Couldn’t do: one part, because it isn’t something I can do here.');
      }
    } catch {
      out.push('Couldn’t do: one part didn’t save. Please try that bit again.');
    }
  }
  for (const [date, list] of Object.entries(foods)) {
    out.push(`Logged ${list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`} ${forDay(date)}.`);
  }
  return { lines: out, held, touched };
}
