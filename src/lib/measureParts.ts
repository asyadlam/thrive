/*
  Measurement shapes and the rule that turns any stored measurement into the length format. Pure (no storage
  access), so the database upgrade (db.ts) and backup reading (profile.ts) convert in exactly the same way.
*/

/** Units a value can have been typed in. Every measurement is now a length: entered in cm, shown with inches. */
export type DisplayUnit = 'cm' | 'in' | 'kg' | 'lb';
export const isDisplayUnit = (v: unknown): v is DisplayUnit => v === 'cm' || v === 'in' || v === 'kg' || v === 'lb';

/** Kinds measurements could have before every measurement became a length (kept only to note what a kind was). */
export type FormerMeasureType = 'weight' | 'number';

/**
 * One logged value, always stored in cm. `entered` is the unit it was typed in (older values may say "in").
 * `date` is the day it was measured (YYYY-MM-DD).
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
 * A measurement I added ("Waist"), holding every value I've logged for it, in cm. A kind that used to be a weight or
 * a plain number was turned into a length with its numbers kept exactly as they were; `formerType` / `formerUnit`
 * note what it was, so nothing about it is forgotten.
 */
export type MeasurementKind = {
  id: string;
  name: string;
  type?: 'length';
  unit: string; // always "cm"
  formerType?: FormerMeasureType;
  formerUnit?: string;
  entries: MeasurementEntry[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Any stored kind → the length format. Lengths are unchanged. A weight or number kind keeps every number as it is
 * (60 stays 60, now read as cm) and remembers its old type and unit. The same rule is used by the database upgrade
 * and when reading a backup.
 */
export function asLengthKind<K extends { type?: unknown; unit?: unknown; entries: MeasurementEntry[] }>(k: K): K & MeasurementKind {
  const unit = typeof k.unit === 'string' ? k.unit : '';
  const old = k.type === 'weight' || k.type === 'number' ? k.type : k.type === 'length' ? null : unit === 'cm' ? null : unit === 'kg' ? 'weight' : 'number';
  if (!old) return { ...k, type: 'length', unit: 'cm' } as K & MeasurementKind;
  return {
    ...k,
    type: 'length',
    unit: 'cm',
    formerType: old,
    ...(unit ? { formerUnit: unit } : {}),
    entries: k.entries.map((e) => ({ ...e, entered: 'cm' as const })),
  } as K & MeasurementKind;
}

