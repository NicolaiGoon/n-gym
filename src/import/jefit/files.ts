import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { db } from '@/db/client';

import { jefitExercises, type ExerciseChoice, type JefitExerciseRow } from './import';
import { parseJefitExport, type JefitExport } from './parse';

export interface PendingJefitImport {
  data: JefitExport;
  rows: JefitExerciseRow[];
  choices: Record<string, ExerciseChoice>;
}

let pending: PendingJefitImport | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Asks for a Jefit export, reads it and keeps it for the import screen. Returns false when cancelled. */
export async function pickJefitExport(): Promise<boolean> {
  const result = await getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (result.canceled) return false;
  const data = parseJefitExport(await new File(result.assets[0].uri).text());
  const rows = jefitExercises(db, data);
  pending = { data, rows, choices: Object.fromEntries(rows.map((r) => [r.key, r.choice])) };
  emit();
  return true;
}

export function setJefitChoice(key: string, choice: ExerciseChoice) {
  if (!pending) return;
  pending = { ...pending, choices: { ...pending.choices, [key]: choice } };
  emit();
}

export function clearJefitImport() {
  pending = null;
  emit();
}

export function usePendingJefitImport(): PendingJefitImport | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
  );
}
