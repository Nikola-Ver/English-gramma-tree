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
}

const KEY = 'eng-notes-v1';

function readAll(): StoredNote[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
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
}

export function deleteNote(id: string): void {
  writeAll(readAll().filter((n) => n.id !== id));
}

export function getNotesForContext(contextId: string, contextType: 'rule' | 'tense'): StoredNote[] {
  return readAll().filter((n) => n.contextId === contextId && n.contextType === contextType);
}
