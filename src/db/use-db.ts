import { addDatabaseChangeListener } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';

import { db } from './client';
import type { Database } from './types';

let version = 0;
const listeners = new Set<() => void>();
let scheduled = false;

// SQLite reports every changed row, so a big write such as an import sends thousands of events.
// Re-rendering on each one froze the app, so screens refresh once after a burst instead.
addDatabaseChangeListener(() => {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    version++;
    listeners.forEach((listener) => listener());
  }, 0);
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Runs a synchronous query and re-renders whenever any table changes.
 * Queries here are small, so re-running them on every render is fine.
 */
export function useDb<T>(query: (db: Database) => T): T {
  useSyncExternalStore(subscribe, () => version);
  return query(db);
}

/** Runs a database write, showing its error message in an alert instead of throwing. Returns true on success. */
export function write(action: (db: Database) => void): boolean {
  try {
    action(db);
    return true;
  } catch (error) {
    Alert.alert("Couldn't save", error instanceof Error ? error.message : String(error));
    return false;
  }
}
