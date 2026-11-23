/*
  Shapes for My Life lists, and the one-time move of the old Wishlist and Bucket list into them.
  Pure functions with no storage access, so the database upgrade (db.ts), restore and merge (backup.ts)
  all fold old data in exactly the same way (same ids, so nothing is ever duplicated).
*/

/**
 * What a list is for. Older lists have no kind and are plain checklists ("custom").
 * - todo, groceries, custom: items can be checked off and deleted.
 * - wishlist: items have an optional price and note; "Got it" moves one to "Got it 🎉" with the date.
 * - bucket: items have an optional note; "Did it" moves one to "Done it ✨" with the date.
 */
export type ListKind = 'todo' | 'wishlist' | 'bucket' | 'groceries' | 'custom';
export const LIST_KINDS: ListKind[] = ['todo', 'wishlist', 'bucket', 'groceries', 'custom'];

export type ListItem = {
  id: string;
  text: string;
  /** Checked off (to do / groceries / custom), "Got it" (wishlist) or "Did it" (bucket list). */
  checked: boolean;
  /** Wishlist and bucket list: when it was got / done (ISO), or null. */
  doneAt?: string | null;
  /** Wishlist and bucket list: optional note. */
  note?: string;
  /** Wishlist: optional price, as typed ("$40"). */
  price?: string;
  createdAt: string;
  updatedAt: string;
};

/** A list on My Life, holding its items in the order added. */
export type UserList = {
  id: string;
  title: string;
  kind?: ListKind;
  items: ListItem[];
  createdAt: string;
  updatedAt: string;
};

export const kindOf = (list: Pick<UserList, 'kind'>): ListKind => list.kind ?? 'custom';

/** The four lists everyone starts with. Fixed ids, so the same list lines up across devices and backups. */
export const STARTER_LISTS: { id: string; title: string; kind: ListKind }[] = [
  { id: 'list-todo', title: 'To do', kind: 'todo' },
  { id: 'list-wishlist', title: 'Wishlist', kind: 'wishlist' },
  { id: 'list-bucket', title: 'Bucket list', kind: 'bucket' },
  { id: 'list-groceries', title: 'Groceries', kind: 'groceries' },
];
export const WISHLIST_LIST_ID = 'list-wishlist';
export const BUCKET_LIST_ID = 'list-bucket';

type OldWish = { id: string; name: string; price?: string; note?: string; gotAt?: string | null; createdAt: string; updatedAt: string };
type OldBucket = { id: string; name: string; note?: string; doneAt?: string | null; createdAt: string; updatedAt: string };

const fromWish = (w: OldWish): ListItem => ({
  id: w.id,
  text: w.name,
  checked: !!w.gotAt,
  doneAt: w.gotAt ?? null,
  note: w.note ?? '',
  price: w.price ?? '',
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
});

const fromBucket = (b: OldBucket): ListItem => ({
  id: b.id,
  text: b.name,
  checked: !!b.doneAt,
  doneAt: b.doneAt ?? null,
  note: b.note ?? '',
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});

/**
 * Moves old Wishlist / Bucket list items into the Wishlist / Bucket list lists (creating those lists if needed),
 * skipping any item id the list already has. With `addStarters`, any missing starter list is also created (empty).
 * Lists that don't change are returned as they were. `stamp` is the time used for lists created here.
 */
export function foldIntoLists(
  lists: UserList[],
  wishes: OldWish[],
  buckets: OldBucket[],
  { addStarters, stamp }: { addStarters: boolean; stamp: string },
): UserList[] {
  const byId = new Map(lists.map((l) => [l.id, l]));
  STARTER_LISTS.forEach((s, i) => {
    const needed = addStarters || (s.id === WISHLIST_LIST_ID && wishes.length > 0) || (s.id === BUCKET_LIST_ID && buckets.length > 0);
    if (!needed || byId.has(s.id)) return;
    // Starters are stamped a moment apart so they keep their order (To do first) when sorted by date.
    const t = new Date(Date.parse(stamp) + (STARTER_LISTS.length - i)).toISOString();
    byId.set(s.id, { id: s.id, title: s.title, kind: s.kind, items: [], createdAt: t, updatedAt: t });
  });
  const add = (id: string, items: ListItem[]) => {
    const list = byId.get(id);
    if (!list || items.length === 0) return;
    const have = new Set(list.items.map((i) => i.id));
    const fresh = items.filter((i) => !have.has(i.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (fresh.length) byId.set(id, { ...list, items: [...list.items, ...fresh] });
  };
  add(WISHLIST_LIST_ID, wishes.map(fromWish));
  add(BUCKET_LIST_ID, buckets.map(fromBucket));
  return [...byId.values()];
}
