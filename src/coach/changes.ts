import { ACTIONS } from './actions';

/**
 * A change file: write actions a desktop MCP client asked for, carried to the phone as a file.
 * The phone previews each one again against its own data and applies it only when approved.
 */
export interface ChangeFile {
  format: 'n-gym-changes';
  version: 1;
  createdAt: string;
  changes: QueuedChange[];
}

export interface QueuedChange {
  action: string;
  input: unknown;
  /** The summary as the desktop saw it; the phone shows its own preview. */
  summary: string;
  queuedAt: string;
}

export function emptyChangeFile(now = new Date()): ChangeFile {
  return { format: 'n-gym-changes', version: 1, createdAt: now.toISOString(), changes: [] };
}

export function parseChangeFile(text: string): ChangeFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file isn’t valid JSON.');
  }
  const file = data as Partial<ChangeFile>;
  if (file?.format !== 'n-gym-changes') throw new Error('This isn’t an n-gym change file.');
  if (file.version !== 1) throw new Error(`Change file version ${String(file.version)} isn’t supported by this app version.`);
  if (!Array.isArray(file.changes)) throw new Error('The change file has no list of changes.');
  const writes = new Set(ACTIONS.filter((a) => a.kind === 'write').map((a) => a.definition.name));
  file.changes.forEach((change, i) => {
    if (typeof change?.action !== 'string' || !writes.has(change.action)) {
      throw new Error(`Change ${i + 1} has an unknown action "${String(change?.action)}".`);
    }
  });
  return file as ChangeFile;
}
