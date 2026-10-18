import { beforeEach, describe, expect, it } from 'vitest';

import { seedIfEmpty } from '../seed';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { exercisesQuery } from './exercises';
import { getActiveRoutine, programPlan, setActiveRoutine } from './program';
import { addDay, addExerciseToDay, createRoutine, deleteRoutine, setRoutineArchived } from './routines';
import { finishWorkout, logSet, startWorkout, workoutDetail } from './workouts';

let db: Database;
let routineId: number;
let days: number[];

beforeEach(async () => {
  db = await createTestDb();
  await seedIfEmpty(db);
  const bench = exercisesQuery(db).get()!.id;
  routineId = createRoutine(db, 'Upper / Lower');
  days = ['Upper A', 'Lower A', 'Rest', 'Upper B'].map((name) => addDay(db, routineId, name));
  for (const day of [days[0], days[1], days[3]]) addExerciseToDay(db, day, bench);
});

function train(dayId: number, date: Date) {
  const id = startWorkout(db, dayId, date);
  logSet(db, workoutDetail(db, id)[0].id, { weight: 60, reps: 5 });
  finishWorkout(db, id, null, date);
}

describe('active program', () => {
  it('is set, cleared, and dropped when its routine is archived or deleted', () => {
    expect(getActiveRoutine(db)).toBeUndefined();
    setActiveRoutine(db, routineId);
    expect(getActiveRoutine(db)?.name).toBe('Upper / Lower');
    setRoutineArchived(db, routineId, true);
    expect(getActiveRoutine(db)).toBeUndefined();
    // Making an archived routine active unarchives it.
    setActiveRoutine(db, routineId);
    expect(getActiveRoutine(db)?.archived).toBe(false);
    setActiveRoutine(db, null);
    expect(getActiveRoutine(db)).toBeUndefined();
    setActiveRoutine(db, routineId);
    deleteRoutine(db, routineId);
    expect(getActiveRoutine(db)).toBeUndefined();
  });

  it('suggests the day after the last one trained, skipping empty days and wrapping around', () => {
    expect(programPlan(db, routineId).nextDayId).toBe(days[0]);
    train(days[0], new Date(2026, 9, 1));
    expect(programPlan(db, routineId).nextDayId).toBe(days[1]);
    train(days[1], new Date(2026, 9, 2));
    // "Rest" has no exercises.
    expect(programPlan(db, routineId).nextDayId).toBe(days[3]);
    train(days[3], new Date(2026, 9, 4));
    const plan = programPlan(db, routineId);
    expect(plan.nextDayId).toBe(days[0]);
    expect(plan.days.map((d) => d.lastDone?.getDate() ?? null)).toEqual([1, 2, null, 4]);
  });
});
