import { beforeEach, describe, expect, it } from 'vitest';

import { exercisesQuery } from './repo/exercises';
import { addDay, addExerciseToDay, createRoutine } from './repo/routines';
import { addExerciseToWorkout, finishWorkout, logSet, startWorkout, workoutDetail } from './repo/workouts';
import { seedIfEmpty } from './seed';
import {
  exerciseRecords,
  exerciseSessions,
  historyList,
  setsPerMuscleGroup,
  startOfWeek,
  weekStreak,
  weeklyTotals,
  workoutDaysInMonth,
} from './stats';
import { createTestDb } from './test-db';
import type { Database } from './types';

let db: Database;
let bench: number;
let pullUp: number;
let dayId: number;

// Local-time dates; October 2026 starts on a Thursday. Monday the 12th, Wednesday the 14th, etc.
const on = (day: number, hour = 18) => new Date(2026, 9, day, hour);

beforeEach(async () => {
  db = await createTestDb();
  await seedIfEmpty(db);
  bench = exercisesQuery(db, { query: 'Barbell Bench Press' }).get()!.id;
  pullUp = exercisesQuery(db, { query: 'Pull-Up' }).get()!.id;
  dayId = addDay(db, createRoutine(db, 'Push'), 'Push A');
  addExerciseToDay(db, dayId, bench);
});

function session(day: number, sets: [number, number][]) {
  const id = startWorkout(db, dayId, on(day));
  const item = workoutDetail(db, id)[0];
  logSet(db, item.id, { weight: 20, reps: 10, isWarmup: true });
  for (const [weight, reps] of sets) logSet(db, item.id, { weight, reps });
  finishWorkout(db, id, null, on(day, 19));
  return id;
}

describe('exercise sessions and records', () => {
  it('computes per-session metrics from working sets only', () => {
    session(5, [[60, 8], [60, 8], [60, 6]]);
    session(8, [[62.5, 8], [65, 3]]);
    const sessions = exerciseSessions(db, bench);
    expect(sessions.map((s) => [s.topWeight, s.bestOneRepMax, s.volume])).toEqual([
      [60, 76, 1320],
      [65, 79.2, 695],
    ]);
    expect(sessions[1].bestSet).toEqual({ weight: 62.5, reps: 8 });

    const records = exerciseRecords(sessions);
    expect(records.bestOneRepMax).toMatchObject({ value: 79.2, weight: 62.5, reps: 8 });
    expect(records.heaviest).toMatchObject({ weight: 65, reps: 3 });
    expect(records.bestVolume?.value).toBe(1320);
    expect(records.sessionCount).toBe(2);
  });

  it('handles bodyweight exercises', () => {
    const id = startWorkout(db, null, on(5));
    const item = addExerciseToWorkout(db, id, pullUp);
    logSet(db, item, { weight: 0, reps: 8 });
    logSet(db, item, { weight: 0, reps: 10 });
    finishWorkout(db, id, null, on(5, 19));
    expect(exerciseSessions(db, pullUp)[0].bestSet).toEqual({ weight: 0, reps: 10 });
  });
});

describe('weekly stats', () => {
  it('starts weeks on Monday', () => {
    expect(startOfWeek(on(15))).toEqual(new Date(2026, 9, 12));
    expect(startOfWeek(on(12, 0))).toEqual(new Date(2026, 9, 12));
    expect(startOfWeek(on(18))).toEqual(new Date(2026, 9, 12));
  });

  it('totals workouts and volume per week, including empty weeks', () => {
    session(1, [[60, 5]]); // week of Sep 28
    session(13, [[60, 5]]);
    session(15, [[60, 10]]);
    const weeks = weeklyTotals(db, 4, on(16));
    expect(weeks.map((w) => [w.weekStart.getDate(), w.workouts, w.volume])).toEqual([
      [21, 0, 0],
      [28, 1, 300],
      [5, 0, 0],
      [12, 2, 900],
    ]);
  });

  it('counts the streak without breaking on the current, unfinished week', () => {
    session(1, [[60, 5]]);
    session(6, [[60, 5]]);
    expect(weekStreak(db, on(14))).toBe(2);
    expect(weekStreak(db, on(21))).toBe(0);
  });

  it('counts working sets per muscle group over the last 7 days', () => {
    session(2, [[60, 5]]);
    session(12, [[60, 5], [60, 5]]);
    expect(setsPerMuscleGroup(db, on(14))).toEqual([{ muscleGroup: 'chest', sets: 2 }]);
  });
});

describe('history', () => {
  it('lists finished workouts with totals and maps them to calendar days', () => {
    const first = session(5, [[60, 5]]);
    const second = session(8, [[60, 5], [60, 5]]);
    startWorkout(db, null, on(9)); // unfinished: not listed

    expect(historyList(db).map((w) => [w.id, w.dayName, w.exerciseCount, w.setCount, w.volume])).toEqual([
      [second, 'Push A', 1, 2, 600],
      [first, 'Push A', 1, 1, 300],
    ]);
    const days = workoutDaysInMonth(db, 2026, 9);
    expect([...days.entries()]).toEqual([
      ['2026-10-05', [first]],
      ['2026-10-08', [second]],
    ]);
  });
});
