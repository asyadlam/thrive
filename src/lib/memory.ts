/*
  Companion memory: short notes (one or two sentences) that the "Talk about this" companion may use in later
  talks. Never chats or transcripts. A note only exists because I approved or wrote it, and the whole feature
  is off unless I turn it on in Settings (see AppSettings.companionMemory).
*/
import { MEMORIES_STORE, idbDelete, idbGetAll, idbPut, idbReplaceStores } from './db';
import { isIsoTime, newId } from './journal';

export const MEMORY_MAX = 280;

export type MemoryNote = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

/** Every note, newest first. */
export async function listMemories(): Promise<MemoryNote[]> {
  const all = await idbGetAll<MemoryNote>(MEMORIES_STORE);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addMemory(text: string): Promise<MemoryNote> {
  const now = new Date().toISOString();
  const note: MemoryNote = { id: `memory-${newId()}`, text: text.trim().slice(0, MEMORY_MAX), createdAt: now, updatedAt: now };
  await idbPut(MEMORIES_STORE, note);
  return note;
}

export async function updateMemory(note: MemoryNote, text: string): Promise<MemoryNote> {
  const updated: MemoryNote = { ...note, text: text.trim().slice(0, MEMORY_MAX), updatedAt: new Date().toISOString() };
  await idbPut(MEMORIES_STORE, updated);
  return updated;
}

export const deleteMemory = (id: string) => idbDelete(MEMORIES_STORE, id);

/** "Forget everything": removes every note in one step. */
export const forgetAllMemories = () => idbReplaceStores({ [MEMORIES_STORE]: [] });

/** Check one note from a backup file; null if unusable. Fills a missing id or timestamps. */
export function memoryFromBackup(raw: unknown): MemoryNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.text !== 'string' || !m.text.trim()) return null;
  const createdAt = isIsoTime(m.createdAt) ? m.createdAt : isIsoTime(m.updatedAt) ? m.updatedAt : new Date().toISOString();
  return {
    id: typeof m.id === 'string' && m.id.startsWith('memory-') ? m.id : `memory-${newId()}`,
    text: m.text.slice(0, MEMORY_MAX),
    createdAt,
    updatedAt: isIsoTime(m.updatedAt) ? m.updatedAt : createdAt,
  };
}
