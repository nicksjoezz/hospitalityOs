import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { flushQueue } from './api';

/** Tracks browser online/offline and flushes the write-queue on reconnect. */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void flushQueue();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  return online;
}

/** Live count of writes still waiting to sync (for the "pending sync" badge). */
export function usePendingCount(): number {
  return (
    useLiveQuery(() => db.outbox.where('status').equals('pending').count(), [], 0) ??
    0
  );
}

/**
 * Continuously auto-saves an in-progress form to localStorage so a power cut
 * mid-entry loses nothing (plan.md §10). Returns the restored draft (if any)
 * and a clear() to call on successful submit.
 */
export function useAutoSave<T extends object>(
  key: string,
  value: T,
): { restored: T | null; clear: () => void } {
  const restoredRef = useRef<T | null>(null);
  if (restoredRef.current === null) {
    const raw = localStorage.getItem(`draft:${key}`);
    if (raw) {
      try {
        restoredRef.current = JSON.parse(raw) as T;
      } catch {
        restoredRef.current = null;
      }
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(`draft:${key}`, JSON.stringify(value));
    }, 400);
    return () => clearTimeout(t);
  }, [key, value]);

  return {
    restored: restoredRef.current,
    clear: () => localStorage.removeItem(`draft:${key}`),
  };
}
