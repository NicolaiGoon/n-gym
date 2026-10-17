import { beforeEach, describe, expect, it } from 'vitest';

import { seedIfEmpty } from '../seed';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createExercise, exercisesQuery, getExercise, updateExercise } from './exercises';
import {
  addDay,
  addExerciseToDay,
  createRoutine,
  daysQuery,
  deleteDay,
  deleteRoutine,
  getSlot,
  moveDay,
  moveSlot,
  removeSlot,
  routinesQuery,
  setRoutineArchived,
  slotsQuery,
  updateSlot,
} from './routines';
import { getSettings, updateSettings } from './settings';

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
  await seedIfEmpty(db);
});

describe('exercises', () => {
  it('filters by name and muscle group', () => {
    expect(exercisesQuery(db, { query: 'curl' }).all().map((e) => e.name)).toEqual([
      'Barbell Curl',
      'Dumbbell Hammer Curl',
      'Leg Curl',
    ]);
    expect(exercisesQuery(db, { query: 'curl', muscleGroup: 'biceps' }).all()).toHaveLength(2);
  });

  it('creates and updates a custom exercise', () => {
    const id = createExercise(db, { name: '  Pendlay Row ', muscleGroup: 'back', defaultIncrement: 2.5 });
    expect(getExercise(db, id)).toMatchObject({ name: 'Pendlay Row', source: 'user', equipment: null });
    updateExercise(db, id, { name: 'Pendlay Row', muscleGroup: 'back', equipment: 'barbell', defaultIncrement: 5 });
    expect(getExercise(db, id)).toMatchObject({ equipment: 'barbell', defaultIncrement: 5 });
  });

  it('rejects blank and duplicate names', () => {
    expect(() => createExercise(db, { name: ' ', muscleGroup: 'back', defaultIncrement: 1 })).toThrow('required');
    expect(() => createExercise(db, { name: 'barbell squat', muscleGroup: 'legs', defaultIncrement: 1 })).toThrow(
      'already exists',
    );
  });

  it('allows saving an exercise under its own name', () => {
    const squat = exercisesQuery(db, { query: 'Barbell Squat' }).get()!;
    expect(() =>
      updateExercise(db, squat.id, { name: 'Barbell Squat', muscleGroup: 'legs', defaultIncrement: 5 }),
    ).not.toThrow();
  });
});

describe('routines', () => {
  function setup() {
    const routineId = createRoutine(db, 'PPL');
    const push = addDay(db, routineId, 'Push');
    const pull = addDay(db, routineId, 'Pull');
    const legs = addDay(db, routineId, 'Legs');
    return { routineId, push, pull, legs };
  }

  it('adds days in order and reorders them', () => {
    const { routineId, legs } = setup();
    moveDay(db, legs, 'up');
    expect(daysQuery(db, routineId).all().map((d) => d.name)).toEqual(['Push', 'Legs', 'Pull']);
    moveDay(db, legs, 'up');
    moveDay(db, legs, 'up'); // already first: no change
    expect(daysQuery(db, routineId).all().map((d) => d.name)).toEqual(['Legs', 'Push', 'Pull']);
  });

  it('adds exercises with a default rule and counts them per day', () => {
    const { routineId, push } = setup();
    const bench = exercisesQuery(db, { query: 'Bench' }).get()!;
    const fly = exercisesQuery(db, { query: 'Fly' }).get()!;
    const slot = addExerciseToDay(db, push, bench.id);
    addExerciseToDay(db, push, fly.id);

    expect(getSlot(db, slot)?.rule).toEqual({ type: 'double', sets: 3, repMin: 8, repMax: 12, increment: 2.5 });
    expect(slotsQuery(db, push).all().map((s) => s.name)).toEqual(['Barbell Bench Press', 'Dumbbell Fly']);
    expect(daysQuery(db, routineId).all().map((d) => d.exerciseCount)).toEqual([2, 0, 0]);

    moveSlot(db, slot, 'down');
    expect(slotsQuery(db, push).all().map((s) => s.name)).toEqual(['Dumbbell Fly', 'Barbell Bench Press']);
    removeSlot(db, slot);
    expect(slotsQuery(db, push).all()).toHaveLength(1);
  });

  it('validates progression changes', () => {
    const { push } = setup();
    const slot = addExerciseToDay(db, push, exercisesQuery(db).get()!.id);
    updateSlot(db, slot, {
      rule: { type: 'linear', sets: 5, reps: 5, increment: 2.5, failuresBeforeDeload: 3, deloadPercent: 0.1 },
      startWeight: 60,
      restSeconds: 180,
    });
    expect(getSlot(db, slot)).toMatchObject({ startWeight: 60, restSeconds: 180, rule: { type: 'linear', sets: 5 } });
    expect(() =>
      updateSlot(db, slot, { rule: { type: 'double', sets: 3, repMin: 12, repMax: 8, increment: 2.5 } }),
    ).toThrow('Maximum reps');
    expect(() => updateSlot(db, slot, { startWeight: -5 })).toThrow('negative');
  });

  it('archives and deletes routines with their days', () => {
    const { routineId, push } = setup();
    addExerciseToDay(db, push, exercisesQuery(db).get()!.id);
    const other = createRoutine(db, 'Upper/Lower');
    setRoutineArchived(db, routineId, true);
    expect(routinesQuery(db).all().map((r) => r.name)).toEqual(['Upper/Lower', 'PPL']);

    deleteRoutine(db, routineId);
    expect(routinesQuery(db).all().map((r) => r.id)).toEqual([other]);
    expect(slotsQuery(db, push).all()).toHaveLength(0);
  });

  it('deletes a day with its exercises', () => {
    const { routineId, pull } = setup();
    addExerciseToDay(db, pull, exercisesQuery(db).get()!.id);
    deleteDay(db, pull);
    expect(daysQuery(db, routineId).all().map((d) => d.name)).toEqual(['Push', 'Legs']);
  });
});

describe('settings', () => {
  it('defaults to kg and 2.5 and saves changes', () => {
    expect(getSettings(db)).toEqual({ unit: 'kg', defaultIncrement: 2.5 });
    updateSettings(db, { unit: 'lb', defaultIncrement: 5 });
    updateSettings(db, { defaultIncrement: 10 });
    expect(getSettings(db)).toEqual({ unit: 'lb', defaultIncrement: 10 });
    expect(() => updateSettings(db, { defaultIncrement: 0 })).toThrow();
  });
});
