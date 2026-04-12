import { notifyNoteChanged, notifyNoteDeleted } from '../services/syncRegistry';

export interface StoredNote {
  id: string;
  contextId: string;
  contextType: 'rule' | 'tense';
  selData: {
    startPath: number[];
    startOffset: number;
    endPath: number[];
    endOffset: number;
  };
  text: string;
  message: string;
  createdAt: number;
  updatedAt: number;
}

const KEY = 'eng-notes-v1';
// Must match LS_NOTES_TOMBSTONES in AuthSyncContext
const TOMBSTONES_KEY = 'eng-notes-tombstones-v1';

function readAll(): StoredNote[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as StoredNote[];
    // Backfill updatedAt for notes created before this field was added
    return raw.map((n) => (n.updatedAt ? n : { ...n, updatedAt: n.createdAt }));
  } catch {
    return [];
  }
}

function writeAll(notes: StoredNote[]): void {
  localStorage.setItem(KEY, JSON.stringify(notes));
}

export function saveNote(note: StoredNote): void {
  const all = readAll();
  const idx = all.findIndex((n) => n.id === note.id);
  if (idx >= 0) all[idx] = note;
  else all.push(note);
  writeAll(all);
  notifyNoteChanged(note);
}

function recordNoteTombstone(id: string): void {
  try {
    const raw = JSON.parse(localStorage.getItem(TOMBSTONES_KEY) ?? '{}') as Record<string, number>;
    raw[id] = Date.now();
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(raw));
  } catch {
    // ignore storage errors
  }
}

export function deleteNote(id: string): void {
  recordNoteTombstone(id);
  writeAll(readAll().filter((n) => n.id !== id));
  notifyNoteDeleted(id);
}

export function getNotesForContext(contextId: string, contextType: 'rule' | 'tense'): StoredNote[] {
  return readAll().filter((n) => n.contextId === contextId && n.contextType === contextType);
}
