/*
  Spoken dates for Ask Thrive: "December 15th", "on the 15th", "next Friday", "in two weeks", "on Christmas".
  Worked out on the device from the words the person said (not left to the AI), against today's date.
  Returns a YYYY-MM-DD key, or null when the words aren't a date this understands (the AI's own date is then used).
*/

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SMALL: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  couple: 2, 'a couple of': 2, 'a couple': 2, few: 3, 'a few': 3,
};
const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
  'twenty first': 21, 'twenty second': 22, 'twenty third': 23, 'twenty fourth': 24, 'twenty fifth': 25, 'twenty sixth': 26,
  'twenty seventh': 27, 'twenty eighth': 28, 'twenty ninth': 29, thirtieth: 30, 'thirty first': 31,
};
/** Fixed-date days people name. */
const HOLIDAYS: [RegExp, number, number][] = [
  [/christmas eve/, 12, 24],
  [/christmas|xmas/, 12, 25],
  [/boxing day/, 12, 26],
  [/new year'?s eve/, 12, 31],
  [/new year'?s( day)?/, 1, 1],
  [/valentine'?s( day)?/, 2, 14],
  [/st\.? patrick'?s( day)?|saint patrick'?s( day)?/, 3, 17],
  [/halloween/, 10, 31],
  [/independence day|fourth of july|4th of july|july 4th/, 7, 4],
];

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (k: string) => new Date(`${k}T12:00:00`);
const addDays = (k: string, n: number) => {
  const d = at(k);
  d.setDate(d.getDate() + n);
  return key(d);
};
const daysBetween = (a: string, b: string) => Math.round((at(b).getTime() - at(a).getTime()) / 864e5);
/** A real calendar day (no February 30th), or null. */
function makeDay(year: number, month: number, day: number): string | null {
  const d = new Date(year, month - 1, day, 12);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? key(d) : null;
}
const monthIndex = (word: string) => MONTHS.findIndex((m) => m.startsWith(word.slice(0, 3))) + 1;
const toNumber = (w: string) => (/^\d+$/.test(w) ? Number(w) : SMALL[w] ?? null);

/**
 * A month and day with no year: this year's, unless it has passed — then next year's, except for a date that
 * passed only recently (within about two months), which is kept as said so it shows up as "in the past".
 */
function upcoming(today: string, month: number, day: number): string | null {
  const year = at(today).getFullYear();
  const thisYear = makeDay(year, month, day);
  if (thisYear && thisYear >= today) return thisYear;
  if (thisYear && daysBetween(thisYear, today) <= 62) return thisYear;
  return makeDay(year + 1, month, day) ?? thisYear;
}

/** "The 15th": this month's if it's today or still ahead, otherwise the next month that has that day. */
function nextDayOfMonth(today: string, day: number): string | null {
  const t = at(today);
  for (let i = 0; i < 13; i++) {
    const d = makeDay(new Date(t.getFullYear(), t.getMonth() + i, 1).getFullYear(), new Date(t.getFullYear(), t.getMonth() + i, 1).getMonth() + 1, day);
    if (d && d >= today) return d;
  }
  return null;
}

/**
 * Reads a date out of spoken words. `today` is the real date; `screenDay` is the day on the Daily Sprout screen,
 * which is what "today", "tomorrow" and "yesterday" are about.
 */
export function resolveSpokenDate(words: string, today: string, screenDay = today): string | null {
  const t = ` ${words.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9'/ ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const dayNum = (s: string) => Number(s.replace(/(st|nd|rd|th)$/, ''));

  if (/ day after tomorrow /.test(t)) return addDays(screenDay, 2);
  if (/ (today|tonight|this day) /.test(t)) return screenDay;
  if (/ tomorrow /.test(t)) return addDays(screenDay, 1);
  if (/ yesterday /.test(t)) return addDays(screenDay, -1);

  // "in two weeks", "in 3 days", "in a month", "a week from today"
  const span = t.match(/ in (\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a couple(?: of)?|a few|couple|few) (day|week|month)s? /);
  const from = t.match(/ (\d+|an?|one|two|three|four|five|six) (day|week|month)s? from (today|now) /);
  const rel = span ?? from;
  if (rel) {
    const n = toNumber(rel[1]);
    if (n !== null) {
      if (rel[2] === 'day') return addDays(today, n);
      if (rel[2] === 'week') return addDays(today, 7 * n);
      const d = at(today);
      return makeDay(new Date(d.getFullYear(), d.getMonth() + n, 1).getFullYear(), new Date(d.getFullYear(), d.getMonth() + n, 1).getMonth() + 1, d.getDate()) ?? addDays(today, 30 * n);
    }
  }
  if (/ next week /.test(t)) return addDays(today, 7);

  for (const [re, month, day] of HOLIDAYS) if (re.test(t)) return upcoming(today, month, day);

  // "December 15th", "Dec 15 2026", "the 15th of December", "15 December"
  const ord = '(\\d{1,2}(?:st|nd|rd|th)?)';
  const md = t.match(new RegExp(` ${MONTH_RE} (?:the )?${ord}(?:,? (\\d{4}))? `));
  const dm = t.match(new RegExp(` (?:the )?${ord} (?:of )?${MONTH_RE}(?:,? (\\d{4}))? `));
  const hit = md ? { month: monthIndex(md[1]), day: dayNum(md[2]), year: md[3] } : dm ? { month: monthIndex(dm[2]), day: dayNum(dm[1]), year: dm[3] } : null;
  if (hit && hit.month > 0) return hit.year ? makeDay(Number(hit.year), hit.month, hit.day) : upcoming(today, hit.month, hit.day);
  // "December fifteenth", "the fifteenth of December"
  for (const [w, n] of Object.entries(ORDINAL_WORDS).sort((a, b) => b[0].length - a[0].length)) {
    const a = t.match(new RegExp(` ${MONTH_RE} (?:the )?${w} `));
    const b = t.match(new RegExp(` (?:the )?${w} (?:of )?${MONTH_RE} `));
    const m = a?.[1] ?? b?.[1];
    if (m) return upcoming(today, monthIndex(m), n);
  }
  // "12/15", "12/15/2026"
  const slash = t.match(/ (\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))? /);
  if (slash) {
    const y = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : null;
    return y ? makeDay(y, Number(slash[1]), Number(slash[2])) : upcoming(today, Number(slash[1]), Number(slash[2]));
  }

  // Weekdays: "Friday" / "this Friday" → the next one after today; "next Friday" → the one in next week.
  const wd = t.match(/ (?:(next|this|coming|this coming) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday) /);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[2]);
    const now = at(today).getDay();
    if (wd[1] === 'next') {
      const toMonday = ((8 - now) % 7) || 7; // days until next week's Monday
      const mondayNext = addDays(today, toMonday);
      return addDays(mondayNext, (target + 6) % 7);
    }
    return addDays(today, ((target - now + 7) % 7) || 7);
  }

  // "the 15th", "on the fifteenth"
  const nth = t.match(/ (?:on )?the (\d{1,2})(?:st|nd|rd|th)? /) ?? t.match(/ (\d{1,2})(?:st|nd|rd|th) /);
  if (nth) return nextDayOfMonth(today, Number(nth[1]));
  for (const [w, n] of Object.entries(ORDINAL_WORDS).sort((a, b) => b[0].length - a[0].length)) {
    if (new RegExp(` (?:on )?the ${w} `).test(t)) return nextDayOfMonth(today, n);
  }
  return null;
}

/** "Tuesday, December 15" (with the year when it isn't this year). */
export function fullDate(k: string, today: string): string {
  const d = at(k);
  const sameYear = d.getFullYear() === at(today).getFullYear();
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export const ONE_YEAR_DAYS = 365;
export { addDays as shiftKey, daysBetween };
