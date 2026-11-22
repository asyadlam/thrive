/*
  My Life profile: my measurements, wishlist and bucket list. (The routine is no longer shown in the app, but
  anything saved in it earlier is kept here and in backups.) (Name, birthday and "about me" live in the app
  settings, so the name stays the one used by the Home greeting and Settings.) Everything stays on this device
  and goes into backups like the rest of Thrive.
*/
import { BUCKETLIST_STORE, MEASUREMENTS_STORE, ROUTINE_STORE, WISHLIST_STORE, idbDelete, idbGetAll, idbPut } from './db';
import { isIsoTime, newId, todayKey } from './journal';

const now = () => new Date().toISOString();
const isDayKey = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00`));
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const times = (r: Record<string, unknown>, fallback = now()) => {
  const createdAt = isIsoTime(r.createdAt) ? r.createdAt : isIsoTime(r.updatedAt) ? r.updatedAt : fallback;
  return { createdAt, updatedAt: isIsoTime(r.updatedAt) ? r.updatedAt : createdAt };
};

/* ================================ Measurements ================================ */

export const MEASURE_NAME_MAX = 40;
export const MEASURE_UNIT_MAX = 12;

/** The unit a length or weight was typed in. */
export type DisplayUnit = 'cm' | 'in' | 'kg' | 'lb';
const isDisplayUnit = (v: unknown): v is DisplayUnit => v === 'cm' || v === 'in' || v === 'kg' || v === 'lb';

/** What kind of number a measurement is: a length (stored in cm), a weight (stored in kg), or just a number. */
export type MeasureType = 'length' | 'weight' | 'number';
const isMeasureType = (v: unknown): v is MeasureType => v === 'length' || v === 'weight' || v === 'number';

/**
 * One logged value. For lengths and weights `value` is always stored in cm / kg, so the unit toggle can never
 * change the data; `entered` is the unit I typed it in, so it's shown first. `date` is the day it was measured.
 */
export type MeasurementEntry = {
  id: string;
  value: number;
  entered?: DisplayUnit;
  date: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * A measurement I added ("Waist"), holding every value I've logged for it. `unit` is "cm" for lengths, "kg" for
 * weights, or my own label for just-a-number ("size", "%", or empty). Kinds saved before `type` existed are read
 * from `unit` (cm → length, kg → weight, anything else → just a number), so older data keeps its meaning.
 */
export type MeasurementKind = {
  id: string;
  name: string;
  type?: MeasureType;
  unit: string;
  entries: MeasurementEntry[];
  createdAt: string;
  updatedAt: string;
};

export const measureType = (k: Pick<MeasurementKind, 'type' | 'unit'>): MeasureType =>
  k.type ?? (k.unit === 'cm' ? 'length' : k.unit === 'kg' ? 'weight' : 'number');

/** Oldest → newest by the day measured (then by when it was logged). */
export const byDate = (a: MeasurementEntry, b: MeasurementEntry) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);

const PER_UNIT: Record<DisplayUnit, number> = { cm: 1, in: 2.54, kg: 1, lb: 0.45359237 }; // → cm / kg
/** A value typed in `unit` → the stored value (cm or kg). */
export const toBase = (value: number, unit: DisplayUnit) => value * PER_UNIT[unit];
/** A stored value (cm or kg) → `unit`. */
export const fromBase = (value: number, unit: DisplayUnit) => value / PER_UNIT[unit];
/** The other unit of the pair (cm ↔ in, kg ↔ lb). */
export const otherUnit = (unit: DisplayUnit): DisplayUnit => ({ cm: 'in', in: 'cm', kg: 'lb', lb: 'kg' })[unit] as DisplayUnit;

/** All my measurements, in the order I added them. */
export async function listMeasurementKinds(): Promise<MeasurementKind[]> {
  const all = await idbGetAll<MeasurementKind>(MEASUREMENTS_STORE);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Adds a measurement. `label` is only used for just-a-number ("size", "%"). */
export async function addMeasurementKind(name: string, type: MeasureType, label = ''): Promise<MeasurementKind> {
  const t = now();
  const kind: MeasurementKind = {
    id: `measure-${newId()}`,
    name: name.trim().slice(0, MEASURE_NAME_MAX),
    type,
    unit: type === 'length' ? 'cm' : type === 'weight' ? 'kg' : label.trim().slice(0, MEASURE_UNIT_MAX),
    entries: [],
    createdAt: t,
    updatedAt: t,
  };
  await idbPut(MEASUREMENTS_STORE, kind);
  return kind;
}

/** Logs a value. For lengths/weights `unit` is what I typed it in, and it's stored in cm/kg. */
export async function logMeasurement(kind: MeasurementKind, value: number, unit: DisplayUnit | null, date = todayKey()): Promise<MeasurementKind> {
  const t = now();
  const entry: MeasurementEntry = unit
    ? { id: `reading-${newId()}`, value: toBase(value, unit), entered: unit, date, createdAt: t, updatedAt: t }
    : { id: `reading-${newId()}`, value, date, createdAt: t, updatedAt: t };
  const updated = { ...kind, entries: [...kind.entries, entry], updatedAt: t };
  await idbPut(MEASUREMENTS_STORE, updated);
  return updated;
}

export async function deleteMeasurementEntry(kind: MeasurementKind, entryId: string): Promise<MeasurementKind> {
  const updated = { ...kind, entries: kind.entries.filter((e) => e.id !== entryId), updatedAt: now() };
  await idbPut(MEASUREMENTS_STORE, updated);
  return updated;
}

export const deleteMeasurementKind = (id: string) => idbDelete(MEASUREMENTS_STORE, id);

export function measurementKindFromBackup(raw: unknown): MeasurementKind | null {
  if (!raw || typeof raw !== 'object') return null;
  const k = raw as Record<string, unknown>;
  const name = str(k.name, MEASURE_NAME_MAX);
  if (!name) return null;
  if (k.entries !== undefined && !Array.isArray(k.entries)) return null;
  const kindTimes = times(k);
  const unit = str(k.unit, MEASURE_UNIT_MAX);
  const type = isMeasureType(k.type) ? k.type : measureType({ unit });
  const entries: MeasurementEntry[] = [];
  for (const rawEntry of (k.entries as unknown[] | undefined) ?? []) {
    const e = (rawEntry ?? {}) as Record<string, unknown>;
    if (typeof e.value !== 'number' || !Number.isFinite(e.value) || !isDayKey(e.date)) return null;
    entries.push({
      id: typeof e.id === 'string' && e.id.startsWith('reading-') ? e.id : `reading-${newId()}`,
      value: e.value,
      ...(type !== 'number' && isDisplayUnit(e.entered) ? { entered: e.entered } : {}),
      date: e.date,
      ...times(e, kindTimes.createdAt),
    });
  }
  return {
    id: typeof k.id === 'string' && k.id.startsWith('measure-') ? k.id : `measure-${newId()}`,
    name,
    type,
    unit: type === 'length' ? 'cm' : type === 'weight' ? 'kg' : unit,
    entries,
    ...kindTimes,
  };
}

/* ================================ My routine ================================ */

export const ROUTINE_WHEN_MAX = 60;
export const ROUTINE_WHAT_MAX = 120;

/** A reference entry: "When: After dinner → What: Magnesium". Not a tracker. */
export type RoutineItem = { id: string; when: string; what: string; createdAt: string; updatedAt: string };

/** In the order I added them. */
export async function listRoutine(): Promise<RoutineItem[]> {
  const all = await idbGetAll<RoutineItem>(ROUTINE_STORE);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveRoutineItem(draft: { when: string; what: string }, existing?: RoutineItem): Promise<RoutineItem> {
  const t = now();
  const item: RoutineItem = {
    id: existing?.id ?? `routine-${newId()}`,
    when: draft.when.trim().slice(0, ROUTINE_WHEN_MAX),
    what: draft.what.trim().slice(0, ROUTINE_WHAT_MAX),
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  };
  await idbPut(ROUTINE_STORE, item);
  return item;
}

export const deleteRoutineItem = (id: string) => idbDelete(ROUTINE_STORE, id);

export function routineItemFromBackup(raw: unknown): RoutineItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const when = str(r.when, ROUTINE_WHEN_MAX);
  const what = str(r.what, ROUTINE_WHAT_MAX);
  if (!when || !what) return null;
  return { id: typeof r.id === 'string' && r.id.startsWith('routine-') ? r.id : `routine-${newId()}`, when, what, ...times(r) };
}

/* ================================ Wishlist ================================ */

export const WISH_NAME_MAX = 80;
export const WISH_PRICE_MAX = 20;
export const WISH_NOTE_MAX = 200;

/** Something I want. `gotAt` is when I got it (ISO), or null while it's still a wish. */
export type WishItem = {
  id: string;
  name: string;
  price: string; // optional, as I typed it ("$40", "around 25€"); '' if none
  note: string; // optional; '' if none
  gotAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WishDraft = Pick<WishItem, 'name' | 'price' | 'note'>;

/** Wishes newest first; got-it items most recently got first. */
export async function listWishlist(): Promise<{ wanted: WishItem[]; got: WishItem[] }> {
  const all = await idbGetAll<WishItem>(WISHLIST_STORE);
  return {
    wanted: all.filter((w) => !w.gotAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    got: all.filter((w) => w.gotAt).sort((a, b) => (b.gotAt ?? '').localeCompare(a.gotAt ?? '')),
  };
}

export async function saveWish(draft: WishDraft, existing?: WishItem): Promise<WishItem> {
  const t = now();
  const item: WishItem = {
    id: existing?.id ?? `wish-${newId()}`,
    name: draft.name.trim().slice(0, WISH_NAME_MAX),
    price: draft.price.trim().slice(0, WISH_PRICE_MAX),
    note: draft.note.trim().slice(0, WISH_NOTE_MAX),
    gotAt: existing?.gotAt ?? null,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  };
  await idbPut(WISHLIST_STORE, item);
  return item;
}

/** "Got it" (or, if tapped by mistake, back to the wishlist). */
export async function setWishGot(item: WishItem, got: boolean): Promise<WishItem> {
  const t = now();
  const updated = { ...item, gotAt: got ? t : null, updatedAt: t };
  await idbPut(WISHLIST_STORE, updated);
  return updated;
}

export const deleteWish = (id: string) => idbDelete(WISHLIST_STORE, id);

export function wishFromBackup(raw: unknown): WishItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, unknown>;
  const name = str(w.name, WISH_NAME_MAX);
  if (!name) return null;
  return {
    id: typeof w.id === 'string' && w.id.startsWith('wish-') ? w.id : `wish-${newId()}`,
    name,
    price: str(w.price, WISH_PRICE_MAX),
    note: str(w.note, WISH_NOTE_MAX),
    gotAt: isIsoTime(w.gotAt) ? w.gotAt : null,
    ...times(w),
  };
}

/* ================================ Bucket list ================================ */

export const BUCKET_NAME_MAX = 100;
export const BUCKET_NOTE_MAX = 200;

/** Something I'd love to do someday. `doneAt` is when I did it (ISO), or null while it's still a dream. */
export type BucketItem = {
  id: string;
  name: string;
  note: string; // optional; '' if none
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BucketDraft = Pick<BucketItem, 'name' | 'note'>;

/** Still to do (newest first), and done (most recently done first). */
export async function listBucketList(): Promise<{ todo: BucketItem[]; done: BucketItem[] }> {
  const all = await idbGetAll<BucketItem>(BUCKETLIST_STORE);
  return {
    todo: all.filter((b) => !b.doneAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    done: all.filter((b) => b.doneAt).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')),
  };
}

export async function saveBucketItem(draft: BucketDraft, existing?: BucketItem): Promise<BucketItem> {
  const t = now();
  const item: BucketItem = {
    id: existing?.id ?? `bucket-${newId()}`,
    name: draft.name.trim().slice(0, BUCKET_NAME_MAX),
    note: draft.note.trim().slice(0, BUCKET_NOTE_MAX),
    doneAt: existing?.doneAt ?? null,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  };
  await idbPut(BUCKETLIST_STORE, item);
  return item;
}

/** "Did it" (or, if tapped by mistake, back to the list). */
export async function setBucketDone(item: BucketItem, done: boolean): Promise<BucketItem> {
  const t = now();
  const updated = { ...item, doneAt: done ? t : null, updatedAt: t };
  await idbPut(BUCKETLIST_STORE, updated);
  return updated;
}

export const deleteBucketItem = (id: string) => idbDelete(BUCKETLIST_STORE, id);

export function bucketItemFromBackup(raw: unknown): BucketItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const name = str(b.name, BUCKET_NAME_MAX);
  if (!name) return null;
  return {
    id: typeof b.id === 'string' && b.id.startsWith('bucket-') ? b.id : `bucket-${newId()}`,
    name,
    note: str(b.note, BUCKET_NOTE_MAX),
    doneAt: isIsoTime(b.doneAt) ? b.doneAt : null,
    ...times(b),
  };
}
