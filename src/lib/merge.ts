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
  GOALS_STORE,
  HABITS_STORE,
  JOURNAL_STORE,
  JOURNEYS_STORE,
  LETTERS_STORE,
  LISTS_STORE,
  POSITIVES_STORE,
  idbGetAll,
  idbPutMany,
} from './db';
import type { UserList } from './lists';
import type { Journey } from './journeys';

export type MergeCounts = {
  entries: number;
  letters: number;
  goals: number;
  habits: number;
  lists: number;
  listItems: number;
  positives: number;
  journeys: number;
  journeySteps: number;
  affirmations: number;
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
  letters: 0,
  goals: 0,
  habits: 0,
  lists: 0,
  listItems: 0,
  positives: 0,
  journeys: 0,
  journeySteps: 0,
  affirmations: 0,
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

  await flat(JOURNAL_STORE, backup.entries, 'entries');
  await flat(LETTERS_STORE, backup.letters, 'letters');
  await flat(GOALS_STORE, backup.goals, 'goals');
  await flat(HABITS_STORE, backup.habits, 'habits');
  await flat(POSITIVES_STORE, backup.positives, 'positives');
  await flat(AFFIRMATIONS_STORE, backup.affirmations, 'affirmations');
  await nested<UserList, UserList['items'][number]>(
    LISTS_STORE,
    backup.lists,
    (l) => l.items,
    (l, items) => ({ ...l, items }),
    'lists',
    'listItems',
  );
  await nested<Journey, Journey['steps'][number]>(
    JOURNEYS_STORE,
    backup.journeys,
    (j) => j.steps,
    (j, steps) => ({ ...j, steps }),
    'journeys',
    'journeySteps',
  );

  return { writes, added, skipped };
}

/** Add everything in the plan, all in one step. */
export const applyMerge = (plan: MergePlan) => idbPutMany(plan.writes);

export const totalAdded = (c: MergeCounts) => Object.values(c).reduce((a, b) => a + b, 0);

const LABELS: [keyof MergeCounts, string, string][] = [
  ['entries', 'journal entry', 'journal entries'],
  ['letters', 'Time Capsule letter', 'Time Capsule letters'],
  ['goals', 'goal', 'goals'],
  ['habits', 'habit', 'habits'],
  ['lists', 'list', 'lists'],
  ['listItems', 'list item', 'list items'],
  ['positives', 'saved positive', 'saved positives'],
  ['journeys', 'journey', 'journeys'],
  ['journeySteps', 'journey step', 'journey steps'],
  ['affirmations', 'affirmation of your own', 'affirmations of your own'],
];

/** e.g. "1 journal entry, 2 list items" (only collections with something added). */
export function describeCounts(c: MergeCounts): string {
  return LABELS.filter(([k]) => c[k] > 0)
    .map(([k, one, many]) => `${c[k]} ${c[k] === 1 ? one : many}`)
    .join(', ');
}
