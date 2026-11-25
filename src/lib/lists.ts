import { LISTS_STORE, idbDelete, idbGet, idbGetAll, idbPut } from './db';
import { isIsoTime, newId } from './journal';
import { moveOldTodoList } from './sprout';
import { LIST_KINDS, isBuiltInList, type ListItem, type ListKind, type UserList } from './listParts';

export { isBuiltInList, kindOf, STARTER_LISTS, type ListItem, type ListKind, type UserList } from './listParts';

export const LIST_TITLE_MAX = 80;
export const LIST_ITEM_MAX = 140;
export const LIST_NOTE_MAX = 200;
export const LIST_PRICE_MAX = 20;

const now = () => new Date().toISOString();

/** All lists, the most recently used first. (The old To do list is moved onto Daily Sprout first.) */
export async function listLists(): Promise<UserList[]> {
  await moveOldTodoList();
  const all = await idbGetAll<UserList>(LISTS_STORE);
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
}

export const getList = (id: string) => idbGet<UserList>(LISTS_STORE, id);

/** Deletes a list. The built-in Wishlist and Bucket list can never be deleted. */
export async function deleteList(id: string): Promise<void> {
  const list = await getList(id);
  if (list && isBuiltInList(list)) throw new Error('This list is built in, so it can’t be deleted.');
  await idbDelete(LISTS_STORE, id);
}

/** A new plain list (items can be checked off and deleted). */
export async function createList(title: string): Promise<UserList> {
  const t = now();
  const list: UserList = {
    id: `list-${newId()}`,
    title: title.trim().slice(0, LIST_TITLE_MAX),
    kind: 'custom',
    items: [],
    createdAt: t,
    updatedAt: t,
  };
  await idbPut(LISTS_STORE, list);
  return list;
}

async function save(list: UserList): Promise<UserList> {
  await idbPut(LISTS_STORE, list);
  return list;
}

export function renameList(list: UserList, title: string): Promise<UserList> {
  if (isBuiltInList(list)) return Promise.resolve(list); // the built-in lists keep their names
  return save({ ...list, title: title.trim().slice(0, LIST_TITLE_MAX), updatedAt: now() });
}

export type ItemDraft = { text: string; note?: string; price?: string };

const clean = (d: ItemDraft) => ({
  text: d.text.trim().slice(0, LIST_ITEM_MAX),
  ...(d.note !== undefined ? { note: d.note.trim().slice(0, LIST_NOTE_MAX) } : {}),
  ...(d.price !== undefined ? { price: d.price.trim().slice(0, LIST_PRICE_MAX) } : {}),
});

export function addItem(list: UserList, draft: string | ItemDraft): Promise<UserList> {
  const t = now();
  const d = typeof draft === 'string' ? { text: draft } : draft;
  const item: ListItem = { id: `item-${newId()}`, checked: false, ...clean(d), createdAt: t, updatedAt: t };
  return save({ ...list, items: [...list.items, item], updatedAt: t });
}

/** Edit an item's text / note / price (wishlist and bucket list). */
export function editItem(list: UserList, itemId: string, draft: ItemDraft): Promise<UserList> {
  const t = now();
  return save({
    ...list,
    items: list.items.map((i) => (i.id === itemId ? { ...i, ...clean(draft), updatedAt: t } : i)),
    updatedAt: t,
  });
}

export function toggleItem(list: UserList, itemId: string): Promise<UserList> {
  const t = now();
  return save({
    ...list,
    items: list.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked, updatedAt: t } : i)),
    updatedAt: t,
  });
}

/** "Got it" / "Did it" (with today's date), or back to the list if tapped by mistake. */
export function setItemDone(list: UserList, itemId: string, done: boolean): Promise<UserList> {
  const t = now();
  return save({
    ...list,
    items: list.items.map((i) => (i.id === itemId ? { ...i, checked: done, doneAt: done ? t : null, updatedAt: t } : i)),
    updatedAt: t,
  });
}

/** Removes every checked-off item (to do, groceries and custom lists only); unchecked items are never touched. */
export function clearChecked(list: UserList): Promise<UserList> {
  return save({ ...list, items: list.items.filter((i) => !i.checked), updatedAt: now() });
}

/** Whole cents, so repeated adding never drifts (0.1 + 0.2 stays 0.30). */
const cents = (n: number) => Math.round(n * 100) / 100;

/** Money put aside: adds `amount` (or takes it out when negative). Never goes below $0. */
export function addSaved(list: UserList, itemId: string, amount: number): Promise<UserList> {
  const t = now();
  return save({
    ...list,
    items: list.items.map((i) => (i.id === itemId ? { ...i, saved: Math.max(0, cents((i.saved ?? 0) + amount)), updatedAt: t } : i)),
    updatedAt: t,
  });
}

/** Back to $0 saved for this item. */
export function resetSaved(list: UserList, itemId: string): Promise<UserList> {
  const t = now();
  return save({ ...list, items: list.items.map((i) => (i.id === itemId ? { ...i, saved: 0, updatedAt: t } : i)), updatedAt: t });
}

/**
 * The number in a price or cost as typed: "$40" → 40, "$1,299.99" → 1299.99, "around 25" → 25.
 * null when there's no usable number (then no savings bar is shown).
 */
export function priceAmount(price: string | undefined): number | null {
  if (!price) return null;
  const m = price.replace(/,(?=\d{3}(\D|$))/g, '').match(/\d+(?:[.,]\d{1,2})?/);
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "$15", "$15.50", "$1,299.99". */
export function dollars(n: number): string {
  const whole = Number.isInteger(cents(n));
  return `$${cents(n).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function deleteItem(list: UserList, itemId: string): Promise<UserList> {
  return save({ ...list, items: list.items.filter((i) => i.id !== itemId), updatedAt: now() });
}

const okId = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 200;

/** Check one list (and its items) from a backup file; null if unusable. Fills missing ids/timestamps. */
export function listFromBackup(raw: unknown): UserList | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.title !== 'string' || !l.title.trim()) return null;
  if (l.items !== undefined && !Array.isArray(l.items)) return null;
  const listCreated = isIsoTime(l.createdAt) ? l.createdAt : isIsoTime(l.updatedAt) ? l.updatedAt : now();
  const items: ListItem[] = [];
  for (const rawItem of (l.items as unknown[] | undefined) ?? []) {
    if (!rawItem || typeof rawItem !== 'object') return null;
    const i = rawItem as Record<string, unknown>;
    if (typeof i.text !== 'string' || !i.text.trim()) return null;
    const created = isIsoTime(i.createdAt) ? i.createdAt : isIsoTime(i.updatedAt) ? i.updatedAt : listCreated;
    items.push({
      // item- for list items; wish- and bucket- for items that came from the old Wishlist / Bucket list
      id: okId(i.id) ? (i.id as string) : `item-${newId()}`,
      text: i.text,
      checked: i.checked === true,
      ...(i.doneAt !== undefined ? { doneAt: isIsoTime(i.doneAt) ? i.doneAt : null } : {}),
      ...(typeof i.note === 'string' ? { note: i.note.slice(0, LIST_NOTE_MAX) } : {}),
      ...(typeof i.price === 'string' ? { price: i.price.slice(0, LIST_PRICE_MAX) } : {}),
      ...(typeof i.saved === 'number' && Number.isFinite(i.saved) && i.saved > 0 ? { saved: Math.round(i.saved * 100) / 100 } : {}),
      createdAt: created,
      updatedAt: isIsoTime(i.updatedAt) ? i.updatedAt : created,
    });
  }
  return {
    id: typeof l.id === 'string' && l.id.startsWith('list-') ? l.id : `list-${newId()}`,
    title: l.title,
    ...(LIST_KINDS.includes(l.kind as ListKind) ? { kind: l.kind as ListKind } : {}),
    items,
    createdAt: listCreated,
    updatedAt: isIsoTime(l.updatedAt) ? l.updatedAt : listCreated,
  };
}
