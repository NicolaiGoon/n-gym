import { readFile, stat, writeFile } from 'node:fs/promises';

import { emptyChangeFile, parseChangeFile, type ChangeFile } from '@/coach/changes';
import { runAction, toolDefinitions, type ToolDefinition } from '@/coach';
import { parseBackup, restoreReplace } from '@/db/backup';
import { createMemoryDb } from '@/db/memory-db';
import type { Database } from '@/db/types';

export interface ToolResult {
  text: string;
  isError?: boolean;
}

const LIST_QUEUED: ToolDefinition = {
  name: 'list_queued_changes',
  description: 'Lists the changes queued in the change file that the user has not imported on their phone yet.',
  inputSchema: { type: 'object', properties: {} },
};

/**
 * The desktop side: answers the coach actions from a backup file, and queues write actions in a
 * change file for the phone to approve. The backup is reloaded whenever the file changes, so a
 * synced copy (e.g. the weekly backup folder on Google Drive) stays current.
 */
export class DesktopSession {
  private db: Database | null = null;
  private loadedAt = 0;

  constructor(
    private readonly backupPath: string,
    private readonly changesPath: string,
    private readonly migrationsFolder: string,
  ) {}

  tools(): ToolDefinition[] {
    return [
      ...toolDefinitions().map((t) => ({
        ...t,
        description: t.description.replace('Needs the user’s approval.', 'Queued for the user to approve on their phone.'),
      })),
      LIST_QUEUED,
    ];
  }

  private async database(): Promise<Database> {
    const { mtimeMs } = await stat(this.backupPath);
    if (!this.db || mtimeMs !== this.loadedAt) {
      const db = await createMemoryDb(this.migrationsFolder);
      restoreReplace(db, parseBackup(await readFile(this.backupPath, 'utf8')));
      this.db = db;
      this.loadedAt = mtimeMs;
    }
    return this.db;
  }

  private async readChanges(): Promise<ChangeFile> {
    try {
      return parseChangeFile(await readFile(this.changesPath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyChangeFile();
      throw error;
    }
  }

  async callTool(name: string, input: unknown, now = new Date()): Promise<ToolResult> {
    try {
      if (name === LIST_QUEUED.name) {
        const { changes } = await this.readChanges();
        return { text: JSON.stringify(changes.map((c) => ({ summary: c.summary, queuedAt: c.queuedAt }))) };
      }
      const outcome = runAction(await this.database(), name, input);
      if (outcome.type === 'error') return { text: outcome.message, isError: true };
      if (outcome.type === 'result') return { text: JSON.stringify(outcome.data, null, 2) };

      const file = await this.readChanges();
      file.changes.push({ action: name, input: outcome.proposal.input, summary: outcome.proposal.summary, queuedAt: now.toISOString() });
      await writeFile(this.changesPath, JSON.stringify(file, null, 2));
      const lines = outcome.proposal.changes.map((c) => `- ${c.label}${c.before ? `: ${c.before}` : ''}${c.after ? ` → ${c.after}` : ''}`);
      return {
        text:
          `Queued, not applied: ${outcome.proposal.summary}\n${lines.join('\n')}\n\n` +
          `${file.changes.length} change(s) are waiting in ${this.changesPath}. The user approves them on the phone ` +
          'with Settings → Import coach changes. Ids of things created by queued changes are not known until then.',
      };
    } catch (error) {
      return { text: error instanceof Error ? error.message : String(error), isError: true };
    }
  }
}
