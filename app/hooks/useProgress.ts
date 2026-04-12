import { useEffect, useState } from 'react';
import type { Level } from '../data/grammar';
import { DATA } from '../data/grammar';
import { notifyProgressChanged, SYNC_APPLIED_EVENT } from '../services/syncRegistry';

export type DoneMap = Record<string, boolean>;
export type TombstoneMap = Record<string, number>;

const DEFAULT_SK = 'eng_v4';

function loadDone(sk: string): DoneMap {
  try {
    return JSON.parse(localStorage.getItem(sk) || '{}');
  } catch {
    return {};
  }
}

function saveDone(d: DoneMap, sk: string) {
  localStorage.setItem(sk, JSON.stringify(d));
}

function tombstoneKey(sk: string): string {
  return `${sk}_tombstones`;
}

function checkedAtKey(sk: string): string {
  return `${sk}_checkedAt`;
}

function loadTimestampMap(key: string): TombstoneMap {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

function saveTimestampMap(m: TombstoneMap, key: string): void {
  localStorage.setItem(key, JSON.stringify(m));
}

export function countLevel(lvl: Level, done: DoneMap) {
  let total = 0,
    checked = 0;
  lvl.categories.forEach((cat) => {
    cat.rules.forEach((r) => {
      total++;
      if (done[r.id]) checked++;
    });
  });
  return { total, checked };
}

export function countAll(done: DoneMap, data: Level[] = DATA) {
  let total = 0,
    checked = 0;
  data.forEach((lvl) => {
    const x = countLevel(lvl, done);
    total += x.total;
    checked += x.checked;
  });
  return { total, checked };
}

export function useProgress(storageKey = DEFAULT_SK) {
  const [done, setDone] = useState<DoneMap>(() => loadDone(storageKey));
  const tk = tombstoneKey(storageKey);
  const cak = checkedAtKey(storageKey);

  useEffect(() => {
    saveDone(done, storageKey);
  }, [done, storageKey]);

  // Re-read when Firestore sync applies remote data to localStorage
  useEffect(() => {
    const handler = () => setDone(loadDone(storageKey));
    window.addEventListener(SYNC_APPLIED_EVENT, handler);
    return () => window.removeEventListener(SYNC_APPLIED_EVENT, handler);
  }, [storageKey]);

  function toggleRule(id: string) {
    const now = Date.now();
    setDone((prev) => {
      const isCurrentlyDone = !!prev[id];

      if (isCurrentlyDone) {
        // Unmarking: record tombstone timestamp, remove checkedAt
        const tombstones = loadTimestampMap(tk);
        saveTimestampMap({ ...tombstones, [id]: now }, tk);
        const checkedAt = loadTimestampMap(cak);
        if (id in checkedAt) {
          const { [id]: _removed, ...rest } = checkedAt;
          saveTimestampMap(rest, cak);
        }
      } else {
        // Marking: record checkedAt timestamp, remove tombstone
        const checkedAt = loadTimestampMap(cak);
        saveTimestampMap({ ...checkedAt, [id]: now }, cak);
        const tombstones = loadTimestampMap(tk);
        if (id in tombstones) {
          const { [id]: _removed, ...rest } = tombstones;
          saveTimestampMap(rest, tk);
        }
      }

      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      notifyProgressChanged();
      return next;
    });
  }

  function resetAll() {
    saveTimestampMap({}, tk);
    saveTimestampMap({}, cak);
    setDone({});
    notifyProgressChanged();
  }

  return { done, toggleRule, resetAll };
}
