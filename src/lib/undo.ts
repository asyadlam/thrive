/*
  One-step Undo for Ask Thrive. While one recording's changes are being carried out, every record about to be
  written (a Daily Sprout day, a quick entry, a new medication or positive) is copied first, exactly as it was.
  Undo puts each one back as it was before — a record that didn't exist before is simply taken away again.
  Only the most recent recording can be undone, and nothing here is kept beyond the open page (memory only).
*/
import { idbDelete, idbGet, idbPut } from './db';

type Copy = { store: string; key: string; before: unknown; after?: unknown };
export type UndoSnapshot = { copies: Copy[] };

let recording: Map<string, Copy> | null = null;
const id = (store: string, key: string) => `${store}\u0000${key}`;

/** Starts collecting "before" copies for one recording's batch of changes. */
export function beginUndo(): void {
  recording = new Map();
}

/** Call just before a record is written: keeps how it was before the first change in this batch. */
export async function noteRecord(store: string, key: string): Promise<void> {
  const r = recording;
  if (!r || r.has(id(store, key))) return;
  r.set(id(store, key), { store, key, before: null }); // claimed at once, so a second write in the batch doesn't re-copy
  const before = (await idbGet<unknown>(store, key)) ?? null;
  r.get(id(store, key))!.before = before === undefined ? null : structuredClone(before);
}

/** A record this batch created (it didn't exist before). */
export function noteCreated(store: string, key: string): void {
  if (recording && !recording.has(id(store, key))) recording.set(id(store, key), { store, key, before: null });
}

/** Ends the batch. Returns what Undo needs, or null if nothing was written. */
export async function endUndo(): Promise<UndoSnapshot | null> {
  const r = recording;
  recording = null;
  if (!r || !r.size) return null;
  const copies = [...r.values()];
  for (const c of copies) c.after = structuredClone((await idbGet<unknown>(c.store, c.key)) ?? null);
  return { copies };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Puts every record back as it was before the recording. A record changed by hand since then is left as it is
 * (so nothing typed afterwards is lost); returns how many were left that way.
 */
export async function applyUndo(snapshot: UndoSnapshot): Promise<{ restored: number; skipped: number }> {
  let restored = 0;
  let skipped = 0;
  for (const c of snapshot.copies) {
    const now = (await idbGet<unknown>(c.store, c.key)) ?? null;
    if (!same(now, c.after)) {
      skipped++;
      continue;
    }
    if (c.before === null) await idbDelete(c.store, c.key);
    else await idbPut(c.store, c.before);
    restored++;
  }
  return { restored, skipped };
}
