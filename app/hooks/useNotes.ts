import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { SYNC_APPLIED_EVENT } from '../services/syncRegistry';
import { getNotesForContext, type StoredNote } from '../utils/notesStorage';

/**
 * Manages notes for a single context (rule or tense).
 *
 * Returns `[notes, setNotes]` — the same shape as `useState` so callers can
 * do optimistic updates (add / remove) immediately while also receiving
 * real-time updates pushed from Firestore sync.
 */
export function useNotes(
  contextId: string,
  contextType: 'rule' | 'tense',
): [StoredNote[], Dispatch<SetStateAction<StoredNote[]>>] {
  const [notes, setNotes] = useState<StoredNote[]>(() =>
    getNotesForContext(contextId, contextType),
  );

  // Reload when the context we're watching changes
  useEffect(() => {
    setNotes(getNotesForContext(contextId, contextType));
  }, [contextId, contextType]);

  // Reload whenever Firestore pushes new data into localStorage
  useEffect(() => {
    const handler = () => {
      setNotes((prev) => {
        const fresh = getNotesForContext(contextId, contextType);
        // Bail out if content is identical to avoid unnecessary re-renders
        return JSON.stringify(fresh) === JSON.stringify(prev) ? prev : fresh;
      });
    };
    window.addEventListener(SYNC_APPLIED_EVENT, handler);
    return () => window.removeEventListener(SYNC_APPLIED_EVENT, handler);
  }, [contextId, contextType]);

  return [notes, setNotes];
}
