/** A month as { year, month } where month is 0–11. */
export type YearMonth = { year: number; month: number };

const pad = (n: number) => String(n).padStart(2, '0');

export const dayKey = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

export function fromDayKey(key: string): YearMonth & { day: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

export function isValidDayKey(key: string | null): key is string {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const { year, month, day } = fromDayKey(key);
  const d = new Date(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export const compareMonths = (a: YearMonth, b: YearMonth) => a.year * 12 + a.month - (b.year * 12 + b.month);

export const daysInMonth = ({ year, month }: YearMonth) => new Date(year, month + 1, 0).getDate();

export const monthRange = (ym: YearMonth) => ({
  start: dayKey(ym.year, ym.month, 1),
  end: dayKey(ym.year, ym.month, daysInMonth(ym)),
});

export const monthLabel = ({ year, month }: YearMonth) =>
  new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

/** Calendar cells for a month, Sunday first; null = blank cell before day 1. */
export function monthCells(ym: YearMonth): (number | null)[] {
  const lead = new Date(ym.year, ym.month, 1).getDay();
  const cells: (number | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth(ym); d++) cells.push(d);
  return cells;
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
