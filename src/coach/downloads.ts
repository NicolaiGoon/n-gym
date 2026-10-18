import { useSyncExternalStore } from 'react';

import { downloadModel } from './llama';
import type { CoachModel } from './models';

export interface ModelDownload {
  id: string;
  fraction: number;
}

/**
 * The model download in progress. It lives outside any screen, so leaving the Coach tab doesn't
 * lose track of it, and coming back shows its progress instead of starting over.
 */
let current: (ModelDownload & { abort: AbortController }) | null = null;
let snapshot: ModelDownload | null = null;
const listeners = new Set<() => void>();

function update(next: typeof current) {
  current = next;
  snapshot = next ? { id: next.id, fraction: next.fraction } : null;
  for (const listener of listeners) listener();
}

/** Downloads `model`. Resolves true once it is ready, or false when cancelled. */
export async function startModelDownload(model: CoachModel): Promise<boolean> {
  if (current) throw new Error('Another model is already downloading.');
  const abort = new AbortController();
  update({ id: model.id, fraction: 0, abort });
  // Progress events come many times a second; only re-render on a visible change.
  let shown = 0;
  try {
    await downloadModel(
      model,
      (fraction) => {
        if (fraction - shown < 0.005) return;
        shown = fraction;
        update({ id: model.id, fraction, abort });
      },
      abort.signal,
    );
    return true;
  } catch (error) {
    if (abort.signal.aborted) return false;
    throw error;
  } finally {
    update(null);
  }
}

export function cancelModelDownload() {
  current?.abort.abort();
}

export function useModelDownload(): ModelDownload | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}
