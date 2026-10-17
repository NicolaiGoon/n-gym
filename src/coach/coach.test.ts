import { beforeEach, describe, expect, it } from 'vitest';

import { deloadStatus } from '@/db/repo/deload';
import { exercisesQuery } from '@/db/repo/exercises';
import { addDay, addExerciseToDay, createRoutine, getSlot, routinesQuery, slotsQuery } from '@/db/repo/routines';
import { finishWorkout, logSet, startWorkout, workoutDetail } from '@/db/repo/workouts';
import { seedIfEmpty } from '@/db/seed';
import { createTestDb } from '@/db/test-db';
import type { Database } from '@/db/types';

import { approveProposal, runAction, toolDefinitions, type ActionOutcome, type Proposal } from '.';
import { checkSchema } from './schema';

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
  await seedIfEmpty(db);
});

function proposal(outcome: ActionOutcome): Proposal {
  if (outcome.type !== 'proposal') throw new Error(`Expected a proposal, got ${JSON.stringify(outcome)}`);
  return outcome.proposal;
}

function result(outcome: ActionOutcome): any {
  if (outcome.type !== 'result') throw new Error(`Expected a result, got ${JSON.stringify(outcome)}`);
  return outcome.data;
}

const PPL = {
  name: 'Push Pull Legs',
  notes: 'Three days a week',
  days: [
    {
      name: 'Push',
      exercises: [
        { exercise: 'barbell bench press', rule: { type: 'linear', reps: 5 }, startWeight: 60, restSeconds: 180 },
        { exercise: 'Incline Dumbbell Press' },
      ],
    },
    { name: 'Pull', exercises: [{ exercise: 'Barbell Row', rule: { type: 'double', repMin: 6, repMax: 10 } }] },
    { name: 'Legs', exercises: [{ exercise: 'Barbell Squat', rule: { type: 'wave', trainingMax: 120 } }] },
  ],
};

describe('tool definitions', () => {
  it('have unique names and object input schemas', () => {
    const tools = toolDefinitions();
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });
});

describe('input checking', () => {
  it('reports every problem with a path', () => {
    const [tool] = toolDefinitions().filter((t) => t.name === 'create_routine');
    expect(checkSchema(tool.inputSchema, { name: '', days: [{ exercises: 'x' }], extra: 1 })).toEqual([
      "input.name can't be empty.",
      'input.days[0].name is required.',
      'input.days[0].exercises must be a list.',
      'input.extra is not a known field.',
    ]);
  });

  it('turns bad input into an error the model can read', () => {
    expect(runAction(db, 'get_routine', {})).toEqual({ type: 'error', message: 'input.routineId is required.' });
    expect(runAction(db, 'nope', {})).toMatchObject({ type: 'error', message: expect.stringContaining('Unknown action') });
  });
});

describe('read actions', () => {
  it('list and filter exercises', () => {
    const chest = result(runAction(db, 'list_exercises', { muscleGroup: 'chest' }));
    expect(chest.length).toBeGreaterThan(0);
    expect(chest.every((e: any) => e.muscleGroup === 'chest')).toBe(true);
  });

  it('show a routine with its day and slot ids', () => {
    const routineId = createRoutine(db, 'Full body');
    const dayId = addDay(db, routineId, 'A');
    const bench = exercisesQuery(db, { query: 'Barbell Bench Press' }).get()!.id;
    const slotId = addExerciseToDay(db, dayId, bench);
    expect(result(runAction(db, 'list_routines', undefined))).toEqual([
      { id: routineId, name: 'Full body', archived: false, days: [{ id: dayId, name: 'A' }] },
    ]);
    const routine = result(runAction(db, 'get_routine', { routineId }));
    expect(routine.days[0]).toMatchObject({ dayId, exercises: [{ slotId, exercise: 'Barbell Bench Press' }] });
  });

  it('give exercise stats with the next suggestion', () => {
    const routineId = createRoutine(db, 'R');
    const dayId = addDay(db, routineId, 'A');
    addExerciseToDay(db, dayId, exercisesQuery(db, { query: 'Barbell Bench Press' }).get()!.id);
    const id = startWorkout(db, dayId, new Date('2026-10-01T18:00:00Z'));
    const [item] = workoutDetail(db, id);
    logSet(db, item.id, { weight: 60, reps: 10 });
    finishWorkout(db, id, null, new Date('2026-10-01T19:00:00Z'));

    const stats = result(runAction(db, 'get_exercise_stats', { exercise: 'Barbell Bench Press' }));
    expect(stats).toMatchObject({ sessionCount: 1, heaviest: { weight: 60, reps: 10 }, stalled: false });
    expect(stats.recentSessions).toEqual([{ date: '2026-10-01', sets: ['60×10'], estimatedOneRepMax: 80 }]);
    expect(stats.nextSession.weight).toBe(60);
    expect(result(runAction(db, 'list_recent_workouts', {}))).toHaveLength(1);
    expect(result(runAction(db, 'get_training_summary', {})).weeks).toHaveLength(8);
  });

  it('suggest close matches for an unknown exercise', () => {
    const outcome = runAction(db, 'get_exercise_stats', { exercise: 'Bench' });
    expect(outcome).toMatchObject({ type: 'error', message: expect.stringContaining('Close matches') });
  });
});

describe('write actions', () => {
  it('only propose, and write nothing until approved', () => {
    const p = proposal(runAction(db, 'create_routine', PPL));
    expect(routinesQuery(db).all()).toHaveLength(0);
    expect(p.summary).toBe('Create routine “Push Pull Legs” with 3 days');
    expect(p.changes.map((c) => c.label)).toEqual([
      'Routine Push Pull Legs',
      'Day Push',
      'Day Push · Barbell Bench Press',
      'Day Push · Incline Dumbbell Press',
      'Day Pull',
      'Day Pull · Barbell Row',
      'Day Legs',
      'Day Legs · Barbell Squat',
    ]);
    expect(p.changes[2].after).toBe('3×5, linear, start 60 kg, rest 180s');

    expect(approveProposal(db, p)).toMatch(/^Created routine Push Pull Legs/);
    const routine = routinesQuery(db).get()!;
    const routineData = result(runAction(db, 'get_routine', { routineId: routine.id }));
    expect(routineData.notes).toBe('Three days a week');
    expect(routineData.days.map((d: any) => d.name)).toEqual(['Push', 'Pull', 'Legs']);
    expect(routineData.days[0].exercises[0]).toMatchObject({
      rule: { type: 'linear', sets: 3, reps: 5, increment: 2.5 },
      startWeight: 60,
      restSeconds: 180,
    });
    expect(routineData.days[2].exercises[0].rule).toMatchObject({ type: 'wave', trainingMax: 120 });
  });

  it('reject a proposal that refers to a missing exercise before anything is written', () => {
    const outcome = runAction(db, 'create_routine', { name: 'X', days: [{ name: 'A', exercises: [{ exercise: 'Moon press' }] }] });
    expect(outcome).toMatchObject({ type: 'error', message: expect.stringContaining('No exercise called "Moon press"') });
  });

  it('reject an invalid rule', () => {
    const outcome = runAction(db, 'create_routine', {
      name: 'X',
      days: [{ name: 'A', exercises: [{ exercise: 'Barbell Squat', rule: { type: 'double', repMin: 12, repMax: 8 } }] }],
    });
    expect(outcome).toMatchObject({ type: 'error', message: expect.stringContaining('Maximum reps must be at least') });
  });

  it('show before and after when changing a routine exercise', () => {
    const dayId = addDay(db, createRoutine(db, 'R'), 'A');
    const slotId = addExerciseToDay(db, dayId, exercisesQuery(db, { query: 'Barbell Squat' }).get()!.id);
    const p = proposal(runAction(db, 'update_routine_exercise', { slotId, rule: { type: 'topBackoff' }, startWeight: 100 }));
    expect(p.changes).toEqual([
      {
        kind: 'update',
        label: 'A · Barbell Squat',
        before: '3×8–12, double progression, rest 120s',
        after: 'Top set 4–6 + 3×8 @ 85%, start 100 kg, rest 120s',
      },
    ]);
    approveProposal(db, p);
    expect(getSlot(db, slotId)).toMatchObject({ startWeight: 100, rule: { type: 'topBackoff' } });
  });

  it('add a day, add and remove exercises', () => {
    const routineId = createRoutine(db, 'R');
    approveProposal(db, proposal(runAction(db, 'add_day', { routineId, name: 'Arms', exercises: [{ exercise: 'Barbell Curl' }] })));
    const dayId = result(runAction(db, 'list_routines', {}))[0].days[0].id;
    approveProposal(db, proposal(runAction(db, 'add_exercise_to_day', { dayId, exercise: 'Barbell Squat', restSeconds: 90 })));
    const slots = slotsQuery(db, dayId).all();
    expect(slots.map((s) => [s.name, s.restSeconds])).toEqual([
      ['Barbell Curl', 120],
      ['Barbell Squat', 90],
    ]);
    const removal = proposal(runAction(db, 'remove_routine_exercise', { slotId: slots[0].id }));
    expect(removal.changes[0]).toMatchObject({ kind: 'remove', label: 'Arms · Barbell Curl' });
    approveProposal(db, removal);
    expect(slotsQuery(db, dayId).all()).toHaveLength(1);
  });

  it('create exercises without duplicates', () => {
    const p = proposal(runAction(db, 'create_exercise', { name: 'Zercher Squat', muscleGroup: 'legs', equipment: 'barbell' }));
    expect(p.changes[0].after).toBe('legs, barbell, +2.5 per step');
    approveProposal(db, p);
    expect(runAction(db, 'create_exercise', { name: 'zercher squat', muscleGroup: 'legs' })).toMatchObject({
      type: 'error',
      message: 'Zercher Squat already exists.',
    });
  });

  it('start a deload week', () => {
    approveProposal(db, proposal(runAction(db, 'start_deload_week', {})));
    expect(deloadStatus(db).active).toBe(true);
    expect(runAction(db, 'start_deload_week', {})).toMatchObject({ type: 'error' });
  });

  it('fail without a partial write when a proposal went stale', () => {
    const dayId = addDay(db, createRoutine(db, 'R'), 'A');
    const slotId = addExerciseToDay(db, dayId, exercisesQuery(db, { query: 'Barbell Squat' }).get()!.id);
    const p = proposal(runAction(db, 'update_routine_exercise', { slotId, startWeight: 80 }));
    approveProposal(db, proposal(runAction(db, 'remove_routine_exercise', { slotId })));
    expect(() => approveProposal(db, p)).toThrow(/No routine exercise/);
  });

  it('refuse to approve a read action', () => {
    expect(() => approveProposal(db, { action: 'list_routines', input: {}, summary: '', changes: [] })).toThrow();
  });
});

describe('console examples', () => {
  it('cover every action and match its schema', async () => {
    const { EXAMPLE_INPUTS } = await import('./examples');
    for (const tool of toolDefinitions()) {
      expect(EXAMPLE_INPUTS[tool.name], tool.name).toBeDefined();
      expect(checkSchema(tool.inputSchema, EXAMPLE_INPUTS[tool.name]), tool.name).toEqual([]);
    }
  });

  it('propose cleanly against seeded data where no ids are needed', async () => {
    const { EXAMPLE_INPUTS } = await import('./examples');
    for (const name of ['create_routine', 'create_exercise', 'start_deload_week']) {
      expect(runAction(db, name, EXAMPLE_INPUTS[name]).type, name).toBe('proposal');
    }
  });
});
