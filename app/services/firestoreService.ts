import {
  collection,
  type DocumentData,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { CONTENT_VERSION } from '../data/contentVersion';
import { db } from '../firebase';
import type { DoneMap } from '../hooks/useProgress';
import type { StoredNote } from '../utils/notesStorage';

export interface FirestoreUserDoc {
  displayName: string;
  email: string;
  photoURL: string | null;
  provider: 'google' | 'password';
  createdAt: Timestamp;
  lastSyncAt: Timestamp;
  contentVersion: number;
  progress: {
    grammar: Record<string, true>;
    grammarCheckedAt: Record<string, Timestamp>;
    grammarUpdatedAt: Timestamp;
    grammarTombstones: Record<string, Timestamp>;
    murphy: Record<string, true>;
    murphyCheckedAt: Record<string, Timestamp>;
    murphyUpdatedAt: Timestamp;
    murphyTombstones: Record<string, Timestamp>;
    notesTombstones: Record<string, Timestamp>;
  };
  settings: {
    theme: 'dark' | 'light' | null;
    updatedAt: Timestamp;
  };
}

export interface FirestoreNote {
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

function toStoredNote(id: string, data: FirestoreNote): StoredNote {
  return {
    id,
    contextId: data.contextId,
    contextType: data.contextType,
    selData: data.selData,
    text: data.text,
    message: data.message,
    createdAt: data.createdAt.toMillis(),
    updatedAt: data.updatedAt.toMillis(),
  };
}

function toFirestoreNote(note: StoredNote): FirestoreNote {
  return {
    contextId: note.contextId,
    contextType: note.contextType,
    selData: note.selData,
    text: note.text,
    message: note.message,
    createdAt: Timestamp.fromMillis(note.createdAt),
    updatedAt: Timestamp.fromMillis(note.updatedAt),
  };
}

export async function getUserDoc(uid: string): Promise<FirestoreUserDoc | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as FirestoreUserDoc;
}

export async function getNotesCollection(uid: string): Promise<Map<string, StoredNote>> {
  const snap = await getDocs(collection(db, 'users', uid, 'notes'));
  const map = new Map<string, StoredNote>();
  snap.forEach((d) => {
    map.set(d.id, toStoredNote(d.id, d.data() as FirestoreNote));
  });
  return map;
}

export async function pushAllData(
  uid: string,
  grammar: DoneMap,
  grammarCheckedAt: Record<string, number>,
  grammarTombstones: Record<string, number>,
  murphy: DoneMap,
  murphyCheckedAt: Record<string, number>,
  murphyTombstones: Record<string, number>,
  notes: StoredNote[],
  notesTombstones: Record<string, number>,
  theme: 'dark' | 'light' | null,
  provider: 'google' | 'password',
  displayName: string,
  email: string,
  photoURL: string | null,
): Promise<void> {
  const now = Timestamp.now();
  const batch = writeBatch(db);

  const grammarRecord: Record<string, true> = {};
  for (const [k, v] of Object.entries(grammar)) {
    if (v) grammarRecord[k] = true;
  }
  const murphyRecord: Record<string, true> = {};
  for (const [k, v] of Object.entries(murphy)) {
    if (v) murphyRecord[k] = true;
  }

  const toTimestampMap = (m: Record<string, number>): Record<string, Timestamp> => {
    const out: Record<string, Timestamp> = {};
    for (const [k, ms] of Object.entries(m)) out[k] = Timestamp.fromMillis(ms);
    return out;
  };

  batch.set(
    doc(db, 'users', uid),
    {
      displayName,
      email,
      photoURL,
      provider,
      lastSyncAt: now,
      contentVersion: CONTENT_VERSION,
      progress: {
        grammar: grammarRecord,
        grammarCheckedAt: toTimestampMap(grammarCheckedAt),
        grammarUpdatedAt: now,
        grammarTombstones: toTimestampMap(grammarTombstones),
        murphy: murphyRecord,
        murphyCheckedAt: toTimestampMap(murphyCheckedAt),
        murphyUpdatedAt: now,
        murphyTombstones: toTimestampMap(murphyTombstones),
        notesTombstones: toTimestampMap(notesTombstones),
      },
      settings: { theme: theme ?? null, updatedAt: now },
    },
    { merge: true },
  );

  for (const note of notes) {
    batch.set(doc(db, 'users', uid, 'notes', note.id), toFirestoreNote(note));
  }

  await batch.commit();
}

export async function pushNote(uid: string, note: StoredNote): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'notes', note.id), toFirestoreNote(note));
}

export async function deleteNoteFromFirestore(uid: string, noteId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'notes', noteId));
}

export async function deleteAllUserData(uid: string): Promise<void> {
  const notesSnap = await getDocs(collection(db, 'users', uid, 'notes'));
  const batch = writeBatch(db);
  notesSnap.forEach((d) => {
    batch.delete(d.ref);
  });
  batch.delete(doc(db, 'users', uid));
  await batch.commit();
}

export async function updateLastSyncAt(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { lastSyncAt: Timestamp.now() } as DocumentData);
}

export function subscribeToUserDoc(
  uid: string,
  callback: (data: FirestoreUserDoc | null) => void,
): () => void {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    callback(snap.exists() ? (snap.data() as FirestoreUserDoc) : null);
  });
}

export function subscribeToNotes(
  uid: string,
  callback: (notes: Map<string, StoredNote>) => void,
): () => void {
  return onSnapshot(collection(db, 'users', uid, 'notes'), (snap) => {
    const map = new Map<string, StoredNote>();
    snap.forEach((d) => {
      map.set(d.id, toStoredNote(d.id, d.data() as FirestoreNote));
    });
    callback(map);
  });
}
