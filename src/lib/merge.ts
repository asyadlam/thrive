/*
  "Add a backup to my data" (merge).

  Uses the same checked backup as Restore. Rule for every collection: if an id is
  already here, skip it completely (never overwrite); if it isn't, add it.
  Lists and journeys apply the same rule to the items/steps inside them: an existing
  list keeps its title and items as they are, and only items with new ids are added.
  Settings (companion, pet name, read lessons) are never merged.
*/
import type { CheckedBackup } from './backup';
import {
  AFFIRMATIONS_STORE,
  DREAMS_STORE,
  JOURNAL_STORE,
  JOURNEYS_STORE,
  LETTERS_STORE,
  MEASUREMENTS_STORE,
  MEMORIES_STORE,
  HEALTH_STORE,
  MEDICATIONS_STORE,
  ROUTINE_STORE,
  WISHLIST_STORE,
  BUCKETLIST_STORE,
  LISTS_STORE,
  POSITIVES_STORE,
  GOALS_STORE,
  HABITS_STORE,
  idbGetAll,
  idbPutMany,
} from './db';
import { talkSummariesOf, withSummaryList, type JournalEntry } from './journal';
import type { UserList } from './lists';
import type { MeasurementKind } from './profile';
import { STARTER_LISTS } from './listParts';
import { listJourneys, type Journey } from './journeys';

export type MergeCounts = {
  entries: number;
  dreams: number;
  letters: number;
  goals: number;
  habits: number;
  lists: number;
  listItems: number;
  positives: number;
  journeys: number;
  journeySteps: number;
  journeySwaps: number;
  affirmations: number;
  talkSummaries: number;
  memories: number;
  health: number;
  medications: number;
  measurementKinds: number;
  measurementValues: number;
  routine: number;
  wishlist: number;
  bucketlist: number;
};

export type MergePlan = {
  /** Records to put, per store (new records, plus existing lists/journeys with new items appended). */
  writes: Record<string, unknown[]>;
  added: MergeCounts;
  /** How many things in the backup were already here and will be left alone. */
  skipped: number;
};

const zero = (): MergeCounts => ({
  entries: 0,
  dreams: 0,
  letters: 0,
  goals: 0,
  habits: 0,
  lists: 0,
  listItems: 0,
  positives: 0,
  journeys: 0,
  journeySteps: 0,
  journeySwaps: 0,
  affirmations: 0,
  talkSummaries: 0,
  memories: 0,
  health: 0,
  medications: 0,
  measurementKinds: 0,
  measurementValues: 0,
  routine: 0,
  wishlist: 0,
  bucketlist: 0,
});

type WithId = { id: string };

/** Work out what a merge would add, without changing anything. */
export async function planMerge(backup: CheckedBackup): Promise<MergePlan> {
  const added = zero();
  const writes: Record<string, unknown[]> = {};
  let skipped = 0;

  async function flat<T extends WithId>(store: string, incoming: T[] | null, key: keyof MergeCounts) {
    if (!incoming || incoming.length === 0) return;
    const have = new Set((await idbGetAll<WithId>(store)).map((r) => r.id));
    const fresh = incoming.filter((r) => !have.has(r.id));
    skipped += incoming.length - fresh.length;
    added[key] += fresh.length;
    if (fresh.length) writes[store] = fresh;
  }

  async function nested<T extends WithId & { updatedAt: string }, C extends WithId>(
    store: string,
    incoming: T[] | null,
    childrenOf: (p: T) => C[],
    withChildren: (p: T, children: C[]) => T,
    parentKey: keyof MergeCounts,
    childKey: keyof MergeCounts,
  ) {
    if (!incoming || incoming.length === 0) return;
    const current = new Map((await idbGetAll<T>(store)).map((p) => [p.id, p]));
    const out: T[] = [];
    for (const parent of incoming) {
      const mine = current.get(parent.id);
      if (!mine) {
        out.push(parent);
        added[parentKey] += 1;
        added[childKey] += childrenOf(parent).length;
        continue;
      }
      skipped += 1; // the list/journey itself is already here: title etc. untouched
      const haveChildren = new Set(childrenOf(mine).map((c) => c.id));
      const freshChildren = childrenOf(parent).filter((c) => !haveChildren.has(c.id));
      skipped += childrenOf(parent).length - freshChildren.length;
      if (freshChildren.length) {
        added[childKey] += freshChildren.length;
        out.push({ ...withChildren(mine, [...childrenOf(mine), ...freshChildren]), updatedAt: new Date().toISOString() });
      }
    }
    if (out.length) writes[store] = out;
  }

  // Journal (and dream) entries: new ids are added. A page that's already here keeps everything as it is,
  // and only gains talk summaries whose ids it doesn't have yet (never duplicated, never removed).
  async function entries(store: string, incoming: JournalEntry[] | null, key: 'entries' | 'dreams') {
    if (!incoming || !incoming.length) return;
    const current = new Map((await idbGetAll<JournalEntry>(store)).map((e) => [e.id, e]));
    const out: JournalEntry[] = [];
    for (const entry of incoming) {
      const mine = current.get(entry.id);
      if (!mine) {
        out.push(entry);
        added[key] += 1;
        continue;
      }
      skipped += 1;
      if (mine.type !== 'talk' || entry.type !== 'talk') continue;
      const have = talkSummariesOf(mine);
      const haveIds = new Set(have.map((s) => s.id));
      const fromBackup = talkSummariesOf(entry);
      const fresh = fromBackup.filter((s) => !haveIds.has(s.id));
      skipped += fromBackup.length - fresh.length;
      if (fresh.length) {
        added.talkSummaries += fresh.length;
        out.push({
          ...withSummaryList(mine),
          talkSummaries: [...have, ...fresh].sort((x, y) => x.createdAt.localeCompare(y.createdAt)),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    if (out.length) writes[store] = out;
  }
  await entries(JOURNAL_STORE, backup.entries, 'entries');
  await entries(DREAMS_STORE, backup.dreams, 'dreams');
  await flat(LETTERS_STORE, backup.letters, 'letters');
  await flat(POSITIVES_STORE, backup.positives, 'positives');
  await flat(AFFIRMATIONS_STORE, backup.affirmations, 'affirmations');
  await flat(MEMORIES_STORE, backup.memories, 'memories'); // only notes whose id isn't here yet
  await flat(HEALTH_STORE, backup.health, 'health'); // a day already logged here is kept as it is
  await flat(MEDICATIONS_STORE, backup.medications, 'medications');
  await flat(ROUTINE_STORE, backup.routine, 'routine');
  await flat(WISHLIST_STORE, backup.wishlist, 'wishlist');
  await flat(BUCKETLIST_STORE, backup.bucketlist, 'bucketlist');
  // A measurement that's already here keeps its name/type/unit and only gains values with new ids.
  await nested<MeasurementKind, MeasurementKind['entries'][number]>(
    MEASUREMENTS_STORE,
    backup.measurements,
    (k) => k.entries,
    (k, entries) => ({ ...k, entries }),
    'measurementKinds',
    'measurementValues',
  );
  await nested<UserList, UserList['items'][number]>(
    LISTS_STORE,
    backup.lists,
    (l) => l.items,
    (l, items) => ({ ...l, items }),
    'lists',
    'listItems',
  );
  // Journeys: new ids are added whole. A journey that's already here keeps its name and everything in it,
  // and only gains steps and habit swaps with new ids, plus the backup's goal if it has none yet.
  if (backup.journeys && backup.journeys.length) {
    const current = new Map((await listJourneys()).map((j) => [j.id, j]));
    const out: Journey[] = [];
    for (const incoming of backup.journeys) {
      const mine = current.get(incoming.id);
      if (!mine) {
        out.push(incoming);
        added.journeys += 1;
        added.journeySteps += incoming.steps.length;
        added.journeySwaps += incoming.swaps.length;
        continue;
      }
      skipped += 1;
      const haveSteps = new Set(mine.steps.map((s) => s.id));
      const haveSwaps = new Set(mine.swaps.map((s) => s.id));
      const steps = incoming.steps.filter((s) => !haveSteps.has(s.id));
      const swaps = incoming.swaps.filter((s) => !haveSwaps.has(s.id));
      const goal = !mine.goal && incoming.goal ? incoming.goal : null;
      skipped += incoming.steps.length - steps.length + incoming.swaps.length - swaps.length;
      if (steps.length || swaps.length || goal) {
        added.journeySteps += steps.length;
        added.journeySwaps += swaps.length;
        if (goal) added.goals += 1;
        out.push({
          ...mine,
          goal: mine.goal ?? goal,
          steps: [...mine.steps, ...steps],
          swaps: [...mine.swaps, ...swaps],
          updatedAt: new Date().toISOString(),
        });
      }
    }
    if (out.length) writes[JOURNEYS_STORE] = out;
  }

  return { writes, added, skipped };
}

/** Add everything in the plan, all in one step. */
export const applyMerge = (plan: MergePlan) => idbPutMany(plan.writes);

/**
 * Does this device hold any Thrive data of its own (for the new-device prompt)? Every fresh device starts with the
 * four empty starter lists, so those only count once they have items; any other record in any store counts.
 */
export async function deviceHasOwnData(): Promise<boolean> {
  const stores = [
    JOURNAL_STORE, DREAMS_STORE, GOALS_STORE, POSITIVES_STORE, LETTERS_STORE, AFFIRMATIONS_STORE, HABITS_STORE,
    JOURNEYS_STORE, MEMORIES_STORE, MEASUREMENTS_STORE, ROUTINE_STORE, WISHLIST_STORE, BUCKETLIST_STORE,
    HEALTH_STORE, MEDICATIONS_STORE,
  ];
  for (const store of stores) if ((await idbGetAll(store)).length > 0) return true;
  const starters = new Set(STARTER_LISTS.map((s) => s.id));
  return (await idbGetAll<UserList>(LISTS_STORE)).some((l) => !starters.has(l.id) || (l.items?.length ?? 0) > 0);
}

export const totalAdded = (c: MergeCounts) => Object.values(c).reduce((a, b) => a + b, 0);

const LABELS: [keyof MergeCounts, string, string][] = [
  ['entries', 'journal entry', 'journal entries'],
  ['dreams', 'dream entry', 'dream entries'],
  ['letters', 'Time Capsule letter', 'Time Capsule letters'],
  ['goals', 'journey goal', 'journey goals'],
  ['habits', 'habit swap', 'habit swaps'],
  ['lists', 'list', 'lists'],
  ['listItems', 'list item', 'list items'],
  ['positives', 'saved positive', 'saved positives'],
  ['journeys', 'journey', 'journeys'],
  ['journeySteps', 'small step', 'small steps'],
  ['journeySwaps', 'habit swap', 'habit swaps'],
  ['affirmations', 'affirmation of your own', 'affirmations of your own'],
  ['talkSummaries', 'talk summary', 'talk summaries'],
  ['memories', 'companion memory note', 'companion memory notes'],
  ['health', 'Health Journey day', 'Health Journey days'],
  ['medications', 'medication/vitamin', 'medications/vitamins'],
  ['measurementKinds', 'measurement', 'measurements'],
  ['measurementValues', 'measurement value', 'measurement values'],
  ['routine', 'routine entry', 'routine entries'],
  ['wishlist', 'wishlist item', 'wishlist items'],
  ['bucketlist', 'bucket list item', 'bucket list items'],
];

/** e.g. "1 journal entry, 2 list items" (only collections with something added). */
export function describeCounts(c: MergeCounts): string {
  return LABELS.filter(([k]) => c[k] > 0)
    .map(([k, one, many]) => `${c[k]} ${c[k] === 1 ? one : many}`)
    .join(', ');
}
