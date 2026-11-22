/* Real data for the Home page. Nothing here is invented: every value comes from the data layer. */
import { todayKey } from './journal';
import { listAllPositives, type PositiveItem } from './positives';
import { builtInItems, listCustomAffirmations, type AffirmationItem } from './affirmations';

/**
 * "Good morning" / "Good afternoon" / "Good evening" from the device's own local clock
 * (getHours() is always in the user's time zone). Late night, midnight to 5am, still counts
 * as evening, so 12:31am says "Good evening", not "Good morning".
 */
export function timeGreeting(d = new Date()): string {
  const h = d.getHours(); // local hour, 0–23
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Whole days since 1 Jan 1970 for a local YYYY-MM-DD day. */
function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Today's item from a list: rotates one per day through a fixed order, stable all day. */
function pickForDay<T>(items: T[], day: string): T | null {
  return items.length ? items[dayNumber(day) % items.length] : null;
}

/** Today's affirmation, from the same list as Growth: the built-in ones plus my own (oldest first). */
export async function affirmationOfTheDay(day = todayKey()): Promise<AffirmationItem> {
  let mine: AffirmationItem[] = [];
  try {
    mine = (await listCustomAffirmations()).map((a) => ({ key: a.id, text: a.text, mine: true }));
  } catch {
    /* storage unavailable: built-in ones still work */
  }
  return pickForDay([...builtInItems(), ...mine], day)!;
}

/** Today's positive (or null if I have none), rotating the same way. */
export async function positiveOfTheDay(day = todayKey()): Promise<PositiveItem | null> {
  const all = await listAllPositives();
  const ordered = [...all].sort((a, b) => a.key.localeCompare(b.key));
  return pickForDay(ordered, day);
}
