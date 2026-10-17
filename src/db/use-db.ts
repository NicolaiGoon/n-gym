import { addDatabaseChangeListener } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';

import { db } from './client';
import type { Database } from './types';

let version = 0;
const listeners = new Set<() => void>();

addDatabaseChangeListener(() => {
  version++;
  listeners.forEach((listener) => listener());
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
