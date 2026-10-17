import { beforeEach, describe, expect, it } from 'vitest';

import { seedIfEmpty } from '../seed';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { exercisesQuery } from './exercises';
import { addDay, addExerciseToDay, createRoutine, updateSlot } from './routines';
import {
  addExerciseToWorkout,
  deleteSet,
  discardWorkout,
  finishWorkout,
  getActiveWorkout,
  logSet,
  moveWorkoutExercise,
  previousSets,
  startWorkout,
  swapWorkoutExercise,
  workoutDetail,
  workoutSummary,
} from './workouts';

let db: Database;
let bench: number;
let squat: number;
let curl: number;
let dayId: number;

const at = (day: number, minutes = 0) => new Date(Date.UTC(2026, 9, day, 18, minutes));
const find = (name: string) => exercisesQuery(db, { query: name }).get()!.id;

beforeEach(async () => {
  db = await createTestDb();
  await seedIfEmpty(db);
  bench = find('Barbell Bench Press');
  squat = find('Barbell Squat');
  curl = find('Barbell Curl');
  dayId = addDay(db, createRoutine(db, 'Full body'), 'A');
  const benchSlot = addExerciseToDay(db, dayId, bench);
  updateSlot(db, benchSlot, {
    rule: { type: 'linear', sets: 3, reps: 5, increment: 2.5, failuresBeforeDeload: 3, deloadPercent: 0.1 },
    startWeight: 60,
    restSeconds: 180,
  });
  addExerciseToDay(db, dayId, squat);
});

/** Logs a full session of the day with the given bench sets and finishes it. */
function doSession(day: number, benchSets: [number, number][]) {
  const id = startWorkout(db, dayId, at(day));
  const [benchItem] = workoutDetail(db, id);
  benchSets.forEach(([weight, reps]) => logSet(db, benchItem.id, { weight, reps }));
  finishWorkout(db, id, null, at(day, 60));
  return id;
}

describe('starting a workout', () => {
  it('copies the day with targets from the progression rules', () => {
    const id = startWorkout(db, dayId, at(1));
    const detail = workoutDetail(db, id);
    expect(detail.map((d) => d.name)).toEqual(['Barbell Bench Press', 'Barbell Squat']);
    expect(detail[0]).toMatchObject({ restSeconds: 180, target: { weight: 60, sets: 3, reps: 5, kind: 'start' } });
    expect(getActiveWorkout(db)?.id).toBe(id);
  });

  it('allows only one workout in progress', () => {
    startWorkout(db, null, at(1));
    expect(() => startWorkout(db, dayId, at(1))).toThrow('already in progress');
  });

  it('suggests more weight after a successful session', () => {
    doSession(1, [[60, 5], [60, 5], [60, 5]]);
    const next = workoutDetail(db, startWorkout(db, dayId, at(3)))[0];
    expect(next.target).toMatchObject({ weight: 62.5, kind: 'increase' });
  });
});

describe('logging', () => {
  it('logs, numbers and deletes sets', () => {
    const id = startWorkout(db, dayId, at(1));
    const [item] = workoutDetail(db, id);
    logSet(db, item.id, { weight: 20, reps: 10, isWarmup: true });
    const second = logSet(db, item.id, { weight: 60, reps: 5, rpe: 8 });
    expect(workoutDetail(db, id)[0].sets.map((s) => [s.position, s.weight, s.isWarmup])).toEqual([
      [0, 20, true],
      [1, 60, false],
    ]);
    deleteSet(db, second);
    expect(workoutDetail(db, id)[0].sets).toHaveLength(1);
    expect(() => logSet(db, item.id, { weight: 60, reps: 5, rpe: 11 })).toThrow('RPE');
  });

  it('adds, swaps and reorders exercises', () => {
    const id = startWorkout(db, dayId, at(1));
    const added = addExerciseToWorkout(db, id, curl);
    moveWorkoutExercise(db, added, 'up');
    expect(workoutDetail(db, id).map((d) => d.name)).toEqual(['Barbell Bench Press', 'Barbell Curl', 'Barbell Squat']);

    swapWorkoutExercise(db, added, find('Dumbbell Hammer Curl'));
    expect(workoutDetail(db, id)[1].name).toBe('Dumbbell Hammer Curl');

    logSet(db, added, { weight: 14, reps: 10 });
    expect(() => swapWorkoutExercise(db, added, curl)).toThrow('already has logged sets');
  });

  it('shows what was done last time', () => {
    doSession(1, [[60, 5], [60, 5], [60, 4]]);
    const id = startWorkout(db, dayId, at(3));
    expect(previousSets(db, bench, id).map((s) => s.reps)).toEqual([5, 5, 4]);
    expect(previousSets(db, curl, id)).toEqual([]);
  });
});

describe('finishing', () => {
  it('drops untouched exercises and summarises the workout', () => {
    doSession(1, [[60, 5], [60, 5], [60, 5]]);
    const id = startWorkout(db, dayId, at(3));
    const [benchItem] = workoutDetail(db, id);
    logSet(db, benchItem.id, { weight: 20, reps: 10, isWarmup: true });
    logSet(db, benchItem.id, { weight: 62.5, reps: 5 });
    logSet(db, benchItem.id, { weight: 62.5, reps: 5 });
    finishWorkout(db, id, '  felt strong ', at(3, 45));

    expect(workoutDetail(db, id).map((d) => d.name)).toEqual(['Barbell Bench Press']);
    expect(getActiveWorkout(db)).toBeUndefined();
    const summary = workoutSummary(db, id);
    expect(summary).toMatchObject({ durationSeconds: 45 * 60, exerciseCount: 1, setCount: 2, volume: 625 });
    expect(summary.records).toEqual([{ exerciseId: bench, name: 'Barbell Bench Press', oneRepMax: 72.9, previous: 70 }]);
  });

  it('needs at least one set, and discarding removes everything', () => {
    const id = startWorkout(db, dayId, at(1));
    expect(() => finishWorkout(db, id, null)).toThrow('at least one set');
    logSet(db, workoutDetail(db, id)[0].id, { weight: 60, reps: 5 });
    discardWorkout(db, id);
    expect(getActiveWorkout(db)).toBeUndefined();
    expect(workoutDetail(db, id)).toEqual([]);
  });
});
