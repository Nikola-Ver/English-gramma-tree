import type { User } from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { CONTENT_VERSION } from '../data/contentVersion';
import type { MigrationData } from '../data/migrations';
import { MIGRATIONS } from '../data/migrations';
import { auth } from '../firebase';
import type { DoneMap } from '../hooks/useProgress';
import {
  deleteAllUserData,
  deleteNoteFromFirestore,
  getNotesCollection,
  getUserDoc,
  pushAllData,
  pushNote,
  subscribeToNotes,
  subscribeToUserDoc,
} from '../services/firestoreService';
import {
  registerSyncCallbacks,
  SYNC_APPLIED_EVENT,
  unregisterSyncCallbacks,
} from '../services/syncRegistry';
import type { StoredNote } from '../utils/notesStorage';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface AuthSyncContextValue {
  user: User | null;
  authLoading: boolean;
  syncStatus: SyncStatus;
  lastSyncAt: Date | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const LS_GRAMMAR = 'eng_v4';
const LS_MURPHY = 'murphy_v1';
const LS_GRAMMAR_CHECKED_AT = 'eng_v4_checkedAt';
const LS_MURPHY_CHECKED_AT = 'murphy_v1_checkedAt';
const LS_GRAMMAR_TOMBSTONES = 'eng_v4_tombstones';
const LS_MURPHY_TOMBSTONES = 'murphy_v1_tombstones';
const LS_NOTES = 'eng-notes-v1';
const LS_NOTES_TOMBSTONES = 'eng-notes-tombstones-v1';
const LS_THEME = 'theme-override';
const SYNC_DEBOUNCE_MS = 800;

function safeParse<T>(raw: string | null, fallback: T): T {
  try {
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readAllLocal() {
  return {
    grammar: safeParse<DoneMap>(localStorage.getItem(LS_GRAMMAR), {}),
    grammarCheckedAt: safeParse<Record<string, number>>(
      localStorage.getItem(LS_GRAMMAR_CHECKED_AT),
      {},
    ),
    grammarTombstones: safeParse<Record<string, number>>(
      localStorage.getItem(LS_GRAMMAR_TOMBSTONES),
      {},
    ),
    murphy: safeParse<DoneMap>(localStorage.getItem(LS_MURPHY), {}),
    murphyCheckedAt: safeParse<Record<string, number>>(
      localStorage.getItem(LS_MURPHY_CHECKED_AT),
      {},
    ),
    murphyTombstones: safeParse<Record<string, number>>(
      localStorage.getItem(LS_MURPHY_TOMBSTONES),
      {},
    ),
    notes: safeParse<StoredNote[]>(localStorage.getItem(LS_NOTES), []),
    notesTombstones: safeParse<Record<string, number>>(
      localStorage.getItem(LS_NOTES_TOMBSTONES),
      {},
    ),
    theme: (() => {
      const v = localStorage.getItem(LS_THEME);
      return v === 'dark' || v === 'light' ? v : null;
    })() as 'dark' | 'light' | null,
  };
}

function hasData(grammar: DoneMap, murphy: DoneMap, notes: StoredNote[]): boolean {
  return (
    Object.values(grammar).some(Boolean) || Object.values(murphy).some(Boolean) || notes.length > 0
  );
}

// Convert a Firestore Timestamp map to a milliseconds map.
function toMillisMap(m: Record<string, { toMillis(): number }> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, ts] of Object.entries(m)) out[k] = ts.toMillis();
  return out;
}

// Last-write-wins merge for rule checkboxes.
//
// Each rule tracks two timestamps:
//   checkedAt  — when it was last marked done
//   tombstone  — when it was last unmarked
//
// The side with the strictly newer timestamp wins. When both sides have no
// timestamp info (old data, both = 0), fall back to a union (OR) so that
// pre-timestamp checked rules are never silently dropped.
//
// IMPORTANT: Firestore's `{ merge: true }` recursively merges nested maps, so
// pushing `grammar: {}` does NOT remove a key from Firestore's grammar map —
// the key stays in the map. The authoritative signal for an uncheck is the
// tombstone timestamp, NOT the absence of a key from the grammar map.
// Therefore we derive each side's effective checked state from timestamps,
// only falling back to the grammar map when neither timestamp exists.
function mergeProgress(
  local: DoneMap,
  localCheckedAt: Record<string, number>,
  localTombstones: Record<string, number>,
  remote: Record<string, boolean>,
  remoteCheckedAt: Record<string, number>,
  remoteTombstones: Record<string, number>,
): { done: DoneMap; checkedAt: Record<string, number>; tombstones: Record<string, number> } {
  const allKeys = new Set([
    ...Object.keys(local),
    ...Object.keys(localCheckedAt),
    ...Object.keys(localTombstones),
    ...Object.keys(remote),
    ...Object.keys(remoteCheckedAt),
    ...Object.keys(remoteTombstones),
  ]);

  const done: DoneMap = {};
  const checkedAt: Record<string, number> = {};
  const tombstones: Record<string, number> = {};

  for (const k of allKeys) {
    const localCheckedTs = localCheckedAt[k] ?? 0;
    const localTombstoneTs = localTombstones[k] ?? 0;
    const localLastTs = Math.max(localCheckedTs, localTombstoneTs);
    // Derive effective state: if tombstone is more recent than checkedAt the
    // rule is unchecked; if equal/both-zero fall back to the grammar map.
    const localEffective =
      localTombstoneTs > localCheckedTs
        ? false
        : localCheckedTs > localTombstoneTs
          ? true
          : !!local[k];

    const remoteCheckedTs = remoteCheckedAt[k] ?? 0;
    const remoteTombstoneTs = remoteTombstones[k] ?? 0;
    const remoteLastTs = Math.max(remoteCheckedTs, remoteTombstoneTs);
    // Same derivation for remote. This correctly handles Firestore's merge
    // behaviour where the grammar map may still contain an unchecked key —
    // the tombstone timestamp is the real authority.
    const remoteEffective =
      remoteTombstoneTs > remoteCheckedTs
        ? false
        : remoteCheckedTs > remoteTombstoneTs
          ? true
          : !!remote[k];

    let isDone: boolean;
    if (remoteLastTs > localLastTs) {
      isDone = remoteEffective;
    } else if (localLastTs > remoteLastTs) {
      isDone = localEffective;
    } else {
      // Tie (equal or both 0): union so old checked rules survive migration.
      isDone = localEffective || remoteEffective;
    }

    if (isDone) {
      done[k] = true;
      const mergedTs = Math.max(localCheckedTs, remoteCheckedTs);
      if (mergedTs > 0) checkedAt[k] = mergedTs;
    } else {
      const mergedTs = Math.max(localTombstoneTs, remoteTombstoneTs);
      if (mergedTs > 0) tombstones[k] = mergedTs;
    }
  }

  return { done, checkedAt, tombstones };
}

// Merge two note-tombstone maps; the higher timestamp wins per note ID.
function mergeNoteTombstones(
  local: Record<string, number>,
  remote: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...local };
  for (const [id, ts] of Object.entries(remote)) {
    if (!(id in merged) || ts > merged[id]) merged[id] = ts;
  }
  return merged;
}

// Filter notes that have been tombstoned after their last update.
function applyNoteTombstones(
  notes: StoredNote[],
  tombstones: Record<string, number>,
): StoredNote[] {
  return notes.filter((n) => !(n.id in tombstones) || tombstones[n.id] <= n.updatedAt);
}

function mergeNotesList(local: StoredNote[], remote: Map<string, StoredNote>): StoredNote[] {
  const map = new Map<string, StoredNote>();
  for (const n of local) map.set(n.id, n);
  for (const [id, rn] of remote) {
    const ln = map.get(id);
    if (!ln || rn.updatedAt > ln.updatedAt) map.set(id, rn);
  }
  return Array.from(map.values());
}

function applyMigrations(data: MigrationData, fromVersion: number): MigrationData {
  let result = data;
  for (let i = fromVersion; i < CONTENT_VERSION; i++) {
    if (MIGRATIONS[i]) result = MIGRATIONS[i](result);
  }
  return result;
}

function getProvider(user: User): 'google' | 'password' {
  return user.providerData[0]?.providerId === 'google.com' ? 'google' : 'password';
}

// ---------------------------------------------------------------------------

export const AuthSyncContext = createContext<AuthSyncContextValue | null>(null);

export function useAuthSync(): AuthSyncContextValue {
  const ctx = useContext(AuthSyncContext);
  if (!ctx) throw new Error('useAuthSync must be used inside AuthSyncProvider');
  return ctx;
}

export function AuthSyncProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  const userRef = useRef<User | null>(null);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // -------------------------------------------------------------------------
  // Core push
  // -------------------------------------------------------------------------

  const pushToFirestore = useCallback(async (currentUser: User): Promise<void> => {
    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }
    setSyncStatus('syncing');
    try {
      const {
        grammar,
        grammarCheckedAt,
        grammarTombstones,
        murphy,
        murphyCheckedAt,
        murphyTombstones,
        notes,
        notesTombstones,
        theme,
      } = readAllLocal();
      await pushAllData(
        currentUser.uid,
        grammar,
        grammarCheckedAt,
        grammarTombstones,
        murphy,
        murphyCheckedAt,
        murphyTombstones,
        notes,
        notesTombstones,
        theme,
        getProvider(currentUser),
        currentUser.displayName ?? '',
        currentUser.email ?? '',
        currentUser.photoURL,
      );
      setLastSyncAt(new Date());
      setSyncStatus('synced');
    } catch {
      setSyncStatus('error');
    }
  }, []);

  const schedulePush = useCallback(() => {
    if (!userRef.current) return;
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => {
      if (userRef.current) pushToFirestore(userRef.current);
    }, SYNC_DEBOUNCE_MS);
  }, [pushToFirestore]);

  const handleNoteChanged = useCallback(
    async (note: StoredNote): Promise<void> => {
      if (!userRef.current) return;
      if (!navigator.onLine) {
        schedulePush();
        return;
      }
      try {
        await pushNote(userRef.current.uid, note);
      } catch {
        schedulePush();
      }
    },
    [schedulePush],
  );

  const handleNoteDeleted = useCallback(
    async (noteId: string): Promise<void> => {
      if (!userRef.current) return;
      // Always schedule a push so the tombstone reaches the user doc in Firestore,
      // which ensures the deletion propagates even if the direct subcollection
      // delete below fails (e.g. offline).
      schedulePush();
      if (!navigator.onLine) return;
      try {
        await deleteNoteFromFirestore(userRef.current.uid, noteId);
      } catch {
        // Tombstone via schedulePush is sufficient to propagate the deletion.
      }
    },
    [schedulePush],
  );

  // -------------------------------------------------------------------------
  // Pull & merge helpers
  // -------------------------------------------------------------------------

  const applyLocalWrite = useCallback(
    (
      grammar: DoneMap,
      grammarCheckedAt: Record<string, number>,
      grammarTombstones: Record<string, number>,
      murphy: DoneMap,
      murphyCheckedAt: Record<string, number>,
      murphyTombstones: Record<string, number>,
      notes: StoredNote[],
      notesTombstones: Record<string, number>,
      theme: 'dark' | 'light' | null,
    ): void => {
      localStorage.setItem(LS_GRAMMAR, JSON.stringify(grammar));
      localStorage.setItem(LS_GRAMMAR_CHECKED_AT, JSON.stringify(grammarCheckedAt));
      localStorage.setItem(LS_GRAMMAR_TOMBSTONES, JSON.stringify(grammarTombstones));
      localStorage.setItem(LS_MURPHY, JSON.stringify(murphy));
      localStorage.setItem(LS_MURPHY_CHECKED_AT, JSON.stringify(murphyCheckedAt));
      localStorage.setItem(LS_MURPHY_TOMBSTONES, JSON.stringify(murphyTombstones));
      localStorage.setItem(LS_NOTES, JSON.stringify(notes));
      localStorage.setItem(LS_NOTES_TOMBSTONES, JSON.stringify(notesTombstones));
      if (theme) localStorage.setItem(LS_THEME, theme);
      window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT));
    },
    [],
  );

  // -------------------------------------------------------------------------
  // On sign-in: pull cloud data, merge (last-write-wins), setup listeners
  // -------------------------------------------------------------------------

  const handleUserSignedIn = useCallback(
    async (currentUser: User): Promise<void> => {
      if (snapshotUnsubRef.current) {
        snapshotUnsubRef.current();
        snapshotUnsubRef.current = null;
      }

      setSyncStatus('syncing');
      try {
        const [cloudDoc, cloudNotes] = await Promise.all([
          getUserDoc(currentUser.uid),
          getNotesCollection(currentUser.uid),
        ]);

        const local = readAllLocal();
        const cloudHasData =
          cloudDoc !== null &&
          hasData(
            cloudDoc.progress.grammar,
            cloudDoc.progress.murphy,
            Array.from(cloudNotes.values()),
          );

        if (cloudHasData && cloudDoc) {
          // Migrate cloud data if needed, then merge with last-write-wins
          const migratedCloud =
            cloudDoc.contentVersion < CONTENT_VERSION
              ? applyMigrations(
                  {
                    grammar: cloudDoc.progress.grammar,
                    murphy: cloudDoc.progress.murphy,
                    notes: Array.from(cloudNotes.values()),
                  },
                  cloudDoc.contentVersion,
                )
              : {
                  grammar: cloudDoc.progress.grammar,
                  murphy: cloudDoc.progress.murphy,
                  notes: Array.from(cloudNotes.values()),
                };

          const remoteGrammarCheckedAt = toMillisMap(cloudDoc.progress.grammarCheckedAt);
          const remoteGrammarTombstones = toMillisMap(cloudDoc.progress.grammarTombstones);
          const remoteMurphyCheckedAt = toMillisMap(cloudDoc.progress.murphyCheckedAt);
          const remoteMurphyTombstones = toMillisMap(cloudDoc.progress.murphyTombstones);
          const remoteNoteTombstones = toMillisMap(cloudDoc.progress.notesTombstones);

          const mergedGrammar = mergeProgress(
            local.grammar,
            local.grammarCheckedAt,
            local.grammarTombstones,
            migratedCloud.grammar,
            remoteGrammarCheckedAt,
            remoteGrammarTombstones,
          );
          const mergedMurphy = mergeProgress(
            local.murphy,
            local.murphyCheckedAt,
            local.murphyTombstones,
            migratedCloud.murphy,
            remoteMurphyCheckedAt,
            remoteMurphyTombstones,
          );

          const mergedNoteTombstones = mergeNoteTombstones(
            local.notesTombstones,
            remoteNoteTombstones,
          );
          const mergedNotes = applyNoteTombstones(
            mergeNotesList(local.notes, new Map(migratedCloud.notes.map((n) => [n.id, n]))),
            mergedNoteTombstones,
          );

          applyLocalWrite(
            mergedGrammar.done,
            mergedGrammar.checkedAt,
            mergedGrammar.tombstones,
            mergedMurphy.done,
            mergedMurphy.checkedAt,
            mergedMurphy.tombstones,
            mergedNotes,
            mergedNoteTombstones,
            local.theme ?? cloudDoc.settings.theme ?? null,
          );
        }
        // else: only local data or no data → push local to cloud

        await pushToFirestore(currentUser);

        // Real-time listeners -------------------------------------------------
        const userDocUnsub = subscribeToUserDoc(currentUser.uid, (remoteDoc) => {
          if (!remoteDoc) return;
          const loc = readAllLocal();

          const remoteGrammarCheckedAt = toMillisMap(remoteDoc.progress.grammarCheckedAt);
          const remoteGrammarTombstones = toMillisMap(remoteDoc.progress.grammarTombstones);
          const remoteMurphyCheckedAt = toMillisMap(remoteDoc.progress.murphyCheckedAt);
          const remoteMurphyTombstones = toMillisMap(remoteDoc.progress.murphyTombstones);
          const remoteNoteTombstones = toMillisMap(remoteDoc.progress.notesTombstones);

          const mergedGrammar = mergeProgress(
            loc.grammar,
            loc.grammarCheckedAt,
            loc.grammarTombstones,
            remoteDoc.progress.grammar,
            remoteGrammarCheckedAt,
            remoteGrammarTombstones,
          );
          const mergedMurphy = mergeProgress(
            loc.murphy,
            loc.murphyCheckedAt,
            loc.murphyTombstones,
            remoteDoc.progress.murphy,
            remoteMurphyCheckedAt,
            remoteMurphyTombstones,
          );

          // Merge note tombstones and re-filter local notes
          const mergedNoteTombstones = mergeNoteTombstones(
            loc.notesTombstones,
            remoteNoteTombstones,
          );
          const filteredNotes = applyNoteTombstones(loc.notes, mergedNoteTombstones);

          let changed = false;

          const ngStr = JSON.stringify(mergedGrammar.done);
          if (ngStr !== localStorage.getItem(LS_GRAMMAR)) {
            localStorage.setItem(LS_GRAMMAR, ngStr);
            changed = true;
          }
          const nmStr = JSON.stringify(mergedMurphy.done);
          if (nmStr !== localStorage.getItem(LS_MURPHY)) {
            localStorage.setItem(LS_MURPHY, nmStr);
            changed = true;
          }
          localStorage.setItem(LS_GRAMMAR_CHECKED_AT, JSON.stringify(mergedGrammar.checkedAt));
          localStorage.setItem(LS_MURPHY_CHECKED_AT, JSON.stringify(mergedMurphy.checkedAt));
          localStorage.setItem(LS_GRAMMAR_TOMBSTONES, JSON.stringify(mergedGrammar.tombstones));
          localStorage.setItem(LS_MURPHY_TOMBSTONES, JSON.stringify(mergedMurphy.tombstones));
          localStorage.setItem(LS_NOTES_TOMBSTONES, JSON.stringify(mergedNoteTombstones));

          const filteredStr = JSON.stringify(filteredNotes);
          if (filteredStr !== localStorage.getItem(LS_NOTES)) {
            localStorage.setItem(LS_NOTES, filteredStr);
            changed = true;
          }

          const rt = remoteDoc.settings.theme;
          if (rt && rt !== localStorage.getItem(LS_THEME)) {
            localStorage.setItem(LS_THEME, rt);
            changed = true;
          }
          if (changed) window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT));
          if (remoteDoc.lastSyncAt) setLastSyncAt(remoteDoc.lastSyncAt.toDate());
        });

        const notesUnsub = subscribeToNotes(currentUser.uid, (remoteNotes) => {
          const loc = readAllLocal();
          const raw = mergeNotesList(loc.notes, remoteNotes);
          const merged = applyNoteTombstones(raw, loc.notesTombstones);
          const mergedStr = JSON.stringify(merged);
          if (mergedStr !== localStorage.getItem(LS_NOTES)) {
            localStorage.setItem(LS_NOTES, mergedStr);
            window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT));
          }
        });

        snapshotUnsubRef.current = () => {
          userDocUnsub();
          notesUnsub();
        };
      } catch {
        setSyncStatus('error');
      }
    },
    [pushToFirestore, applyLocalWrite],
  );

  // -------------------------------------------------------------------------
  // Auth state listener
  // -------------------------------------------------------------------------

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);

      if (firebaseUser) {
        registerSyncCallbacks({
          onProgressChange: schedulePush,
          onNoteChanged: handleNoteChanged,
          onNoteDeleted: handleNoteDeleted,
        });
        await handleUserSignedIn(firebaseUser);
      } else {
        unregisterSyncCallbacks();
        setSyncStatus('idle');
        setLastSyncAt(null);
        if (snapshotUnsubRef.current) {
          snapshotUnsubRef.current();
          snapshotUnsubRef.current = null;
        }
      }
    });
    return () => unsub();
  }, [handleUserSignedIn, schedulePush, handleNoteChanged, handleNoteDeleted]);

  // -------------------------------------------------------------------------
  // Auth actions
  // -------------------------------------------------------------------------

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<void> => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string): Promise<void> => {
    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    unregisterSyncCallbacks();
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    if (snapshotUnsubRef.current) {
      snapshotUnsubRef.current();
      snapshotUnsubRef.current = null;
    }
    await firebaseSignOut(auth);
    setSyncStatus('idle');
    setLastSyncAt(null);
  }, []);

  const deleteAccount = useCallback(async (): Promise<void> => {
    if (!userRef.current) return;
    const uid = userRef.current.uid;
    unregisterSyncCallbacks();
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    if (snapshotUnsubRef.current) {
      snapshotUnsubRef.current();
      snapshotUnsubRef.current = null;
    }
    await deleteAllUserData(uid);
    localStorage.removeItem(LS_GRAMMAR);
    localStorage.removeItem(LS_GRAMMAR_CHECKED_AT);
    localStorage.removeItem(LS_GRAMMAR_TOMBSTONES);
    localStorage.removeItem(LS_MURPHY);
    localStorage.removeItem(LS_MURPHY_CHECKED_AT);
    localStorage.removeItem(LS_MURPHY_TOMBSTONES);
    localStorage.removeItem(LS_NOTES);
    localStorage.removeItem(LS_NOTES_TOMBSTONES);
    localStorage.removeItem(LS_THEME);
    await deleteUser(userRef.current);
    setSyncStatus('idle');
    setLastSyncAt(null);
  }, []);

  const syncNow = useCallback(async (): Promise<void> => {
    if (userRef.current) await pushToFirestore(userRef.current);
  }, [pushToFirestore]);

  return (
    <AuthSyncContext.Provider
      value={{
        user,
        authLoading,
        syncStatus,
        lastSyncAt,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        deleteAccount,
        syncNow,
      }}
    >
      {children}
    </AuthSyncContext.Provider>
  );
}
