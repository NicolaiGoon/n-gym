import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseChangeFile } from '@/coach/changes';
import { approveProposal, runAction } from '@/coach';
import { createBackup, serializeBackup } from '@/db/backup';
import { routinesQuery } from '@/db/repo/routines';
import { updateSettings } from '@/db/repo/settings';
import { seedIfEmpty } from '@/db/seed';
import { createTestDb } from '@/db/test-db';

import { DesktopSession } from './session';

let dir: string;
let session: DesktopSession;
let changesPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'n-gym-mcp-'));
  const phone = await createTestDb();
  await seedIfEmpty(phone);
  updateSettings(phone, { unit: 'lb', defaultIncrement: 5 });
  await writeFile(join(dir, 'backup.json'), serializeBackup(createBackup(phone)));
  changesPath = join(dir, 'changes.json');
  session = new DesktopSession(join(dir, 'backup.json'), changesPath, './drizzle');
});

afterEach(() => rm(dir, { recursive: true, force: true }));

const ROUTINE = { name: 'Desktop plan', days: [{ name: 'A', exercises: [{ exercise: 'Barbell Squat' }] }] };

describe('the desktop MCP session', () => {
  it('answers reads from the backup', async () => {
    const result = await session.callTool('get_training_summary', {});
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.text).unit).toBe('lb');
  });

  it('lists every action plus the queue, with desktop wording', () => {
    const tools = session.tools();
    expect(tools.map((t) => t.name)).toContain('list_queued_changes');
    expect(tools.find((t) => t.name === 'create_routine')!.description).toContain('approve on their phone');
  });

  it('queues writes in the change file instead of applying them', async () => {
    const result = await session.callTool('create_routine', ROUTINE, new Date('2026-10-17T10:00:00Z'));
    expect(result.text).toMatch(/^Queued, not applied: Create routine “Desktop plan” with 1 day/);
    await session.callTool('start_deload_week', {});

    const file = parseChangeFile(await readFile(changesPath, 'utf8'));
    expect(file.changes.map((c) => c.action)).toEqual(['create_routine', 'start_deload_week']);
    expect(JSON.parse((await session.callTool('list_queued_changes', {})).text)).toHaveLength(2);
    expect(JSON.parse((await session.callTool('list_routines', {})).text)).toEqual([]);
  });

  it('produces changes the phone can preview and approve', async () => {
    await session.callTool('create_routine', ROUTINE);
    const file = parseChangeFile(await readFile(changesPath, 'utf8'));

    const phone = await createTestDb();
    await seedIfEmpty(phone);
    const outcome = runAction(phone, file.changes[0].action, file.changes[0].input);
    if (outcome.type !== 'proposal') throw new Error(JSON.stringify(outcome));
    approveProposal(phone, outcome.proposal);
    expect(routinesQuery(phone).all().map((r) => r.name)).toEqual(['Desktop plan']);
  });

  it('reports errors as tool errors', async () => {
    expect(await session.callTool('get_exercise_stats', { exercise: 'Moon press' })).toMatchObject({ isError: true });
    expect(await session.callTool('nope', {})).toMatchObject({ isError: true });
  });

  it('reloads the backup when the file changes', async () => {
    await session.callTool('list_routines', {});
    const phone = await createTestDb();
    await seedIfEmpty(phone);
    approveProposal(phone, (runAction(phone, 'create_routine', ROUTINE) as { proposal: any }).proposal);
    await new Promise((r) => setTimeout(r, 20));
    await writeFile(join(dir, 'backup.json'), serializeBackup(createBackup(phone)));
    expect(JSON.parse((await session.callTool('list_routines', {})).text)).toHaveLength(1);
  });
});

describe('change files', () => {
  it('reject anything that is not a change file', () => {
    expect(() => parseChangeFile('{')).toThrow('valid JSON');
    expect(() => parseChangeFile('{"format":"other"}')).toThrow('isn’t an n-gym change file');
    expect(() => parseChangeFile('{"format":"n-gym-changes","version":1,"changes":[{"action":"list_routines"}]}')).toThrow(
      'unknown action "list_routines"',
    );
  });
});
