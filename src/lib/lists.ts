import { LISTS_STORE, idbDelete, idbGet, idbGetAll, idbPut } from './db';
import { isIsoTime, newId } from './journal';

export const LIST_TITLE_MAX = 80;
export const LIST_ITEM_MAX = 140;

export type ListItem = {
  id: string;
  text: string;
  checked: boolean;
  createdAt: string;
  updatedAt: string;
};

/** A personal list ("Things that help me", "People I can call"). Items are kept inside it, in the order added. */
export type UserList = {
  id: string;
  title: string;
  items: ListItem[];
  createdAt: string;
  updatedAt: string;
};

const now = () => new Date().toISOString();

/** All lists, in the order I made them. */
export async function listLists(): Promise<UserList[]> {
  const all = await idbGetAll<UserList>(LISTS_STORE);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const getList = (id: string) => idbGet<UserList>(LISTS_STORE, id);
export const deleteList = (id: string) => idbDelete(LISTS_STORE, id);

export async function createList(title: string): Promise<UserList> {
  const t = now();
  const list: UserList = { id: `list-${newId()}`, title: title.trim().slice(0, LIST_TITLE_MAX), items: [], createdAt: t, updatedAt: t };
  await idbPut(LISTS_STORE, list);
  return list;
}

async function save(list: UserList): Promise<UserList> {
  await idbPut(LISTS_STORE, list);
  return list;
}

export function renameList(list: UserList, title: string): Promise<UserList> {
  return save({ ...list, title: title.trim().slice(0, LIST_TITLE_MAX), updatedAt: now() });
}

export function addItem(list: UserList, text: string): Promise<UserList> {
  const t = now();
  const item: ListItem = { id: `item-${newId()}`, text: text.trim().slice(0, LIST_ITEM_MAX), checked: false, createdAt: t, updatedAt: t };
  return save({ ...list, items: [...list.items, item], updatedAt: t });
}

export function toggleItem(list: UserList, itemId: string): Promise<UserList> {
  const t = now();
  return save({
    ...list,
    items: list.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked, updatedAt: t } : i)),
    updatedAt: t,
  });
}

export function deleteItem(list: UserList, itemId: string): Promise<UserList> {
  return save({ ...list, items: list.items.filter((i) => i.id !== itemId), updatedAt: now() });
}

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
      ...(i as object),
      id: typeof i.id === 'string' && i.id.startsWith('item-') ? i.id : `item-${newId()}`,
      text: i.text,
      checked: i.checked === true,
      createdAt: created,
      updatedAt: isIsoTime(i.updatedAt) ? i.updatedAt : created,
    } as ListItem);
  }
  return {
    ...(l as object),
    id: typeof l.id === 'string' && l.id.startsWith('list-') ? l.id : `list-${newId()}`,
    title: l.title,
    items,
    createdAt: listCreated,
    updatedAt: isIsoTime(l.updatedAt) ? l.updatedAt : listCreated,
  } as UserList;
}
