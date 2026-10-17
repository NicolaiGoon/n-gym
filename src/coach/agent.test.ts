import { beforeEach, describe, expect, it } from 'vitest';

import { routinesQuery } from '@/db/repo/routines';
import { seedIfEmpty } from '@/db/seed';
import { createTestDb } from '@/db/test-db';
import type { Database } from '@/db/types';

import { decisionMessage, MAX_STEPS, runCoachTurn, trimHistory, type ChatMessage, type ChatModel, type CoachEvent, type ModelReply } from './agent';
import { recommendedModel } from './models';
import { buildSystemPrompt } from './prompt';
import { approveProposal } from './run';

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
  await seedIfEmpty(db);
});

/** A model that plays back replies in order and records what it was sent. */
function scripted(replies: ModelReply[]) {
  const seen: ChatMessage[][] = [];
  const model: ChatModel = {
    complete: async (messages) => {
      seen.push([...messages]);
      const next = replies.shift();
      if (!next) throw new Error('Script ran out');
      return next;
    },
  };
  return { model, seen };
}

const call = (name: string, args: unknown, id = name) => ({ id, name, arguments: JSON.stringify(args) });
const say = (content: string): ModelReply => ({ content, toolCalls: [] });

async function turn(model: ChatModel, text: string) {
  const events: CoachEvent[] = [];
  await runCoachTurn({
    db,
    model,
    messages: [{ role: 'system', content: buildSystemPrompt(db) }, { role: 'user', content: text }],
    onEvent: (e) => events.push(e),
  });
  return events;
}

describe('a coach turn', () => {
  it('builds a 4-day upper/lower routine as one proposal the user can approve', async () => {
    const upper = [{ exercise: 'Barbell Bench Press', rule: { type: 'topBackoff' } }, { exercise: 'Barbell Row' }];
    const lower = [{ exercise: 'Barbell Squat', rule: { type: 'linear', reps: 5 } }];
    const { model, seen } = scripted([
      { content: '', toolCalls: [call('list_exercises', { muscleGroup: 'legs' })] },
      {
        content: '',
        toolCalls: [
          call('create_routine', {
            name: 'Upper / Lower',
            days: [
              { name: 'Upper A', exercises: upper },
              { name: 'Lower A', exercises: lower },
              { name: 'Upper B', exercises: upper },
              { name: 'Lower B', exercises: lower },
            ],
          }),
        ],
      },
      say('Here is a 4-day upper/lower split. Approve it below to save it.'),
    ]);

    const events = await turn(model, 'Build me a 4-day upper/lower routine');

    // The read result went back to the model before it proposed.
    const legs = JSON.parse(seen[1].at(-1)!.content);
    expect(legs.every((e: any) => e.muscleGroup === 'legs')).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['message', 'tool', 'message', 'proposal', 'message']);
    expect(routinesQuery(db).all()).toHaveLength(0);

    const proposal = events.find((e) => e.type === 'proposal')!;
    if (proposal.type !== 'proposal') throw new Error();
    expect(proposal.proposal.summary).toBe('Create routine “Upper / Lower” with 4 days');
    approveProposal(db, proposal.proposal);
    expect(routinesQuery(db).all().map((r) => r.name)).toEqual(['Upper / Lower']);
  });

  it('feeds errors back so the model can correct itself', async () => {
    const { model, seen } = scripted([
      { content: '', toolCalls: [call('get_exercise_stats', { exercise: 'Bench' })] },
      { content: '', toolCalls: [{ id: 'x', name: 'get_exercise_stats', arguments: '{oops' }] },
      say('Done.'),
    ]);
    const events = await turn(model, 'How is my bench?');
    expect(seen[1].at(-1)).toMatchObject({ role: 'tool', toolCallId: 'get_exercise_stats', content: expect.stringMatching(/^Error: No exercise called "Bench"/) });
    expect(seen[2].at(-1)!.content).toBe('Error: the arguments were not valid JSON.');
    expect(events.filter((e) => e.type === 'tool').map((e) => e.type === 'tool' && e.ok)).toEqual([false, false]);
  });

  it('stops after too many steps', async () => {
    const { model } = scripted(Array.from({ length: MAX_STEPS }, () => ({ content: '', toolCalls: [call('list_routines', {})] })));
    const events = await turn(model, 'loop');
    const last = events.at(-1)!;
    expect(last.type === 'message' && last.message.content).toMatch(/too many steps/);
  });

  it('can be stopped between steps', async () => {
    const { model, seen } = scripted([{ content: '', toolCalls: [call('list_routines', {})] }, say('never')]);
    await runCoachTurn({ db, model, messages: [{ role: 'user', content: 'hi' }], onEvent: () => {}, shouldStop: () => true });
    expect(seen).toHaveLength(1);
  });
});

describe('the system prompt', () => {
  it('includes the unit and routines', () => {
    const prompt = buildSystemPrompt(db, new Date('2026-10-17T12:00:00Z'));
    expect(prompt).toContain('Weights are in kg');
    expect(prompt).toContain('No routines yet.');
    expect(prompt).toContain('No workouts logged yet.');
  });
});

describe('history', () => {
  it('tells the model about decisions without showing them as bubbles', () => {
    const p = { action: 'start_deload_week', input: {}, summary: 'Start a deload week', changes: [] };
    expect(decisionMessage(p, { status: 'rejected' })).toEqual({
      role: 'user',
      content: '[The user rejected "Start a deload week". Nothing was changed.]',
      hidden: true,
    });
  });

  it('is trimmed from the oldest user message, keeping the system prompt', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'a'.repeat(50) },
      { role: 'assistant', content: 'b'.repeat(50) },
      { role: 'user', content: 'c'.repeat(10) },
      { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'list_routines', arguments: '{}' }] },
      { role: 'tool', content: 'd'.repeat(10), toolCallId: '1' },
    ];
    expect(trimHistory(messages, 1000)).toEqual(messages);
    expect(trimHistory(messages, 100).map((m) => m.content[0] ?? '')).toEqual(['S', 'c', '', 'd']);
    expect(trimHistory(messages, 5).map((m) => m.content[0] ?? '')).toEqual(['S', 'c', '', 'd']);
  });
});

describe('model choice', () => {
  it('recommends the larger model only with enough RAM', () => {
    expect(recommendedModel(12 * 1024 ** 3).id).toBe('qwen3-4b-instruct-2507-q4');
    expect(recommendedModel(4 * 1024 ** 3).id).toBe('qwen3-1.7b-q4');
    expect(recommendedModel(null).id).toBe('qwen3-1.7b-q4');
  });
});
