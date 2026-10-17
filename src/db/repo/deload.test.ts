import { beforeEach, describe, expect, it } from 'vitest';

import { seedIfEmpty } from '../seed';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { deloadStatus, endDeload, isDeloadActive, setDeloadEvery, stalledExercises, startDeloadWeek } from './deload';
import { exercisesQuery } from './exercises';
import { addDay, addExerciseToDay, createRoutine, updateSlot } from './routines';
import { finishWorkout, logSet, startWorkout, workoutDetail } from './workouts';

let db: Database;
let dayId: number;
let names: string[];

const at = (day: number, minutes = 0) => new Date(Date.UTC(2026, 9, day, 18, minutes));
const find = (name: string) => exercisesQuery(db, { query: name }).get()!.id;

beforeEach(async () => {
  db = await createTestDb();
  await seedIfEmpty(db);
  names = ['Barbell Bench Press', 'Barbell Squat', 'Barbell Curl'];
  dayId = addDay(db, createRoutine(db, 'Full body'), 'A');
  for (const name of names) {
    const slot = addExerciseToDay(db, dayId, find(name));
    updateSlot(db, slot, {
      rule: { type: 'linear', sets: 3, reps: 5, increment: 2.5, failuresBeforeDeload: 9, deloadPercent: 0.1 },
      startWeight: 60,
      restSeconds: 120,
    });
  }
});

/** Logs every exercise of the day at 60 × `reps` and finishes the workout. */
function doSession(day: number, reps: number) {
  const id = startWorkout(db, dayId, at(day));
  for (const item of workoutDetail(db, id)) {
    for (let i = 0; i < 3; i++) logSet(db, item.id, { weight: 60, reps });
  }
  finishWorkout(db, id, null, at(day, 60));
}

describe('stalled lifts', () => {
  it('are lifts whose best set has not improved over the last three sessions', () => {
    doSession(1, 5);
    doSession(3, 4);
    doSession(5, 4);
    expect(stalledExercises(db, at(6))).toEqual([]);
    doSession(7, 5);
    expect(stalledExercises(db, at(8)).map((e) => e.name).sort()).toEqual([...names].sort());
  });

  it('suggest a deload once three lifts stall', () => {
    [1, 3, 5, 7].forEach((day) => doSession(day, 5));
    const status = deloadStatus(db, at(8));
    expect(status.active).toBe(false);
    expect(status.reasons).toHaveLength(1);
    expect(status.reasons[0]).toContain('3 lifts have stalled');
  });
});

describe('scheduled deloads', () => {
  it('come due after the set number of weeks', () => {
    doSession(1, 5);
    setDeloadEvery(db, 4);
    expect(deloadStatus(db, at(20)).reasons).toEqual([]);
    expect(deloadStatus(db, at(29, 61)).reasons).toEqual(["It's been 4 weeks since your last deload."]);
  });

  it('count from the last deload', () => {
    doSession(1, 5);
    setDeloadEvery(db, 4);
    startDeloadWeek(db, at(20));
    expect(deloadStatus(db, at(30)).reasons).toEqual([]);
  });

  it('rejects a negative interval', () => {
    expect(() => setDeloadEvery(db, -1)).toThrow();
  });
});

describe('a deload week', () => {
  it('lightens the targets of workouts started during it, then ends', () => {
    doSession(1, 5);
    startDeloadWeek(db, at(2));
    expect(isDeloadActive(db, at(3))).toBe(true);
    expect(deloadStatus(db, at(3)).until).toEqual(new Date(at(2).getTime() + 7 * 24 * 3600 * 1000));

    const id = startWorkout(db, dayId, at(3));
    const [first] = workoutDetail(db, id);
    expect(first.target).toMatchObject({ kind: 'deload', weight: 57.5, sets: 2 }); // 90% of 62.5, rounded to 2.5

    expect(isDeloadActive(db, at(10))).toBe(false);
    endDeload(db);
    expect(isDeloadActive(db, at(3))).toBe(false);
  });
});
