/*
  Small helpers for the ways voice input goes wrong: numbers said in words ("eight thousand five hundred") or as
  "5k", near-miss names from mishearings ("magnesian" → Magnesium), and negated phrases ("I skipped lunch",
  "didn't stretch") that must never become positive entries.
*/

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  a: 1, an: 1, half: 0.5, couple: 2, dozen: 12,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, k: 1000, grand: 1000, million: 1_000_000 };

/**
 * Every number in what was said: digits ("8,000", "2.5"), shorthand ("5k" = 5,000, "1.5k" = 1,500) and number
 * words, including longer ones ("two hundred and fifty", "eight thousand five hundred", "8 thousand").
 */
export function numbersIn(text: string): Set<number> {
  const out = new Set<number>();
  const t = text.toLowerCase().replace(/(\d),(\d{3})/g, '$1$2').replace(/-/g, ' ');
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) out.add(Number(m[0]));
  // "8.000" / "8 000" / "1.200,5": the thousands separators many languages use (both readings are kept).
  for (const m of t.matchAll(/\b\d{1,3}(?:[. \u00a0\u202f]\d{3})+(?:,\d+)?\b/g)) out.add(Number(m[0].replace(/[. \u00a0\u202f]/g, '').replace(',', '.')));
  for (const m of t.matchAll(/\b\d+,\d{1,2}\b/g)) out.add(Number(m[0].replace(',', '.'))); // "2,5" = 2.5
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s?k\b(?!m)/g)) out.add(Math.round(Number(m[1]) * 1000));
  const words = t.match(/\d+(?:\.\d+)?|[a-z]+/g) ?? [];
  let total = 0;
  let current = 0;
  let inRun = false;
  const flush = () => {
    if (inRun) out.add(total + current);
    total = 0;
    current = 0;
    inRun = false;
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1] ?? '';
    if (/^\d/.test(w)) {
      flush();
      current = Number(w);
      inRun = true;
    } else if ((w === 'a' || w === 'an') && next in SCALES) {
      flush();
      current = 1; // "a hundred", "a thousand"
      inRun = true;
    } else if (w in UNITS && w !== 'a' && w !== 'an') {
      const n = UNITS[w];
      if (inRun && current >= 20 && current % 100 % 10 === 0 && current % 100 !== 0 && n < 10) current += n; // "twenty five"
      else if (inRun && current % 100 === 0 && (current > 0 || total > 0)) current += n; // "two hundred fifty", "eight thousand five"
      else {
        flush();
        current = n;
        inRun = true;
      }
    } else if (w in SCALES && inRun) {
      const scale = SCALES[w];
      if (scale === 100) current = (current || 1) * 100;
      else {
        total += (current || 1) * scale;
        current = 0;
      }
    } else if (w === 'and' && inRun) {
      continue;
    } else {
      flush();
    }
  }
  flush();
  return out;
}

/** "5k" / "5 k" in the words, as said (for saying back how it was read). */
export const kShorthand = (text: string) => text.match(/\b(\d+(?:\.\d+)?)\s?k\b(?!m)/i)?.[0] ?? null;

/** Lowercase letters and digits only. */
const flat = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = keep;
    }
  }
  return prev[b.length];
}

/**
 * Spelling only (for foods): "barbells bar" ≈ "Barebells bar", but "oatmeal" is not "oatmeal with berries" —
 * a shorter name is a different food, not a mishearing.
 */
export function spelledAlike(a: string, b: string): number {
  const x = flat(a.replace(/^\s*(a|an|one|my|the|some)\s+/i, ''));
  const y = flat(b.replace(/^\s*(a|an|one|my|the|some)\s+/i, ''));
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/** How alike two names are, 0–1 (1 = the same letters). Spaces and punctuation don't count. */
export function likeness(a: string, b: string): number {
  const x = flat(a);
  const y = flat(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if ((x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))) return 0.9;
  // Names that differ only in a short tag are different things: Vitamin D / Vitamin E, B6 / B12, 5 mg / 10 mg.
  const ta = a.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const tb = b.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const onlyA = ta.filter((w) => !tb.includes(w));
  const onlyB = tb.filter((w) => !ta.includes(w));
  if (onlyA.length === 1 && onlyB.length === 1 && (onlyA[0].length <= 3 || onlyB[0].length <= 3)) return 0.4;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/**
 * The existing name the spoken one most likely meant, if it's close enough and clearly closer than any other.
 * Returns null when nothing is close (then it really is something new).
 */
export function closest<T>(spoken: string, items: T[], nameOf: (item: T) => string, min = 0.75, score = likeness): T | null {
  const scored = items.map((item) => ({ item, score: score(spoken, nameOf(item)) })).sort((a, b) => b.score - a.score);
  const [best, next] = scored;
  if (!best || best.score < min) return null;
  if (next && best.score < 1 && best.score - next.score < 0.08) return null; // two about equally close: don't guess
  return best.item;
}

const NEGATION = String.raw`(?:no|not|never|without|skipped|skip|didn't|didnt|did not|haven't|havent|have not|hasn't|wasn't|forgot to|forgot|missed|don't|dont|do not)`;

/** True when the words say this thing did NOT happen: "I skipped lunch", "no breakfast", "didn't take my magnesium". */
export function negated(said: string, thing: string): boolean {
  const word = thing.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').trim().split(/\s+/).filter((w) => w.length > 2).at(-1);
  if (!word) return false;
  const t = said.toLowerCase().replace(/[’`]/g, "'");
  const stem = word.replace(/(ing|ed|es|s)$/, '');
  const re = new RegExp(String.raw`\b${NEGATION}\s+(?:\w+\s+){0,3}?${stem}\w*`, 'i');
  return re.test(t);
}

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th", 11 → "11th". */
export const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
};
