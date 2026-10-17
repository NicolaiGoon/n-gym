import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/repo/settings';

import { parseChangeFile, type ChangeFile, type QueuedChange } from './changes';

const HANDLED_KEY = 'handledChanges';
const MAX_HANDLED = 500;

export async function pickChangeFile(): Promise<ChangeFile | null> {
  const result = await getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  return parseChangeFile(await new File(result.assets[0].uri).text());
}

const keyOf = (change: QueuedChange) => `${change.queuedAt}|${change.action}`;

function handledKeys(): string[] {
  try {
    return JSON.parse(getSetting(db, HANDLED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** True when this change was approved or rejected before, so importing the same file twice is safe. */
export function wasHandled(change: QueuedChange): boolean {
  return handledKeys().includes(keyOf(change));
}

export function markHandled(change: QueuedChange): void {
  setSetting(db, HANDLED_KEY, JSON.stringify([...handledKeys(), keyOf(change)].slice(-MAX_HANDLED)));
}

let pending: ChangeFile | null = null;

export function setPendingChanges(file: ChangeFile | null) {
  pending = file;
}

export function getPendingChanges(): ChangeFile | null {
  return pending;
}
