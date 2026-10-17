import { beforeEach, describe, expect, it } from 'vitest';

import { backupCounts, createBackup, parseBackup, restoreMerge, restoreReplace, serializeBackup } from './backup';
import { createExercise, exercisesQuery } from './repo/exercises';
import { addDay, addExerciseToDay, createRoutine, routinesQuery } from './repo/routines';
import { getSettings, updateSettings } from './repo/settings';
import { finishWorkout, getActiveWorkout, logSet, startWorkout, workoutDetail } from './repo/workouts';
import { listWorkouts } from './queries';
import { seedIfEmpty } from './seed';
import { createTestDb } from './test-db';
import type { Database } from './types';

const at = (day: number, minutes = 0) => new Date(Date.UTC(2026, 9, day, 18, minutes));

async function freshDb() {
  const db = await createTestDb();
  await seedIfEmpty(db);
  return db;
}

/** A database with a custom exercise, a routine and two finished workouts. */
async function populated(): Promise<Database> {
  const db = await freshDb();
  const custom = createExercise(db, { name: 'Pendlay Row', muscleGroup: 'back', defaultIncrement: 2.5 });
  const dayId = addDay(db, createRoutine(db, 'Strength'), 'A');
  addExerciseToDay(db, dayId, custom);
  for (const day of [1, 3]) {
    const id = startWorkout(db, dayId, at(day));
    logSet(db, workoutDetail(db, id)[0].id, { weight: 60, reps: 5, rpe: 8 });
    finishWorkout(db, id, `day ${day}`, at(day, 50));
  }
  updateSettings(db, { unit: 'lb' });
  return db;
}

const roundTrip = (db: Database) => parseBackup(serializeBackup(createBackup(db, at(5))));

let source: Database;
beforeEach(async () => {
  source = await populated();
});

describe('backup file', () => {
  it('round-trips through JSON with dates intact', () => {
    const backup = roundTrip(source);
    expect(backup.tables.workouts[0].startedAt).toEqual(at(1));
    expect(backupCounts(backup)).toMatchObject({ routines: 1, workouts: 2, sets: 2, firstWorkout: at(1), lastWorkout: at(3) });
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow("isn't JSON");
    expect(() => parseBackup('{"format":"other"}')).toThrow("isn't an n-gym backup");
    expect(() => parseBackup(JSON.stringify({ format: 'n-gym-backup', version: 99, tables: {} }))).toThrow('newer version');
    expect(() => parseBackup(JSON.stringify({ format: 'n-gym-backup', version: 1, tables: {} }))).toThrow('missing');
  });
});

describe('restore', () => {
  it('replace makes the target identical to the source', async () => {
    const target = await freshDb();
    createRoutine(target, 'Will be removed');
    restoreReplace(target, roundTrip(source));
    expect(createBackup(target, at(5))).toEqual(createBackup(source, at(5)));
    expect(getSettings(target).unit).toBe('lb');
  });

  it('merge adds new data, matches exercises by name and skips workouts already there', async () => {
    const target = await freshDb();
    createRoutine(target, 'Existing');
    const before = exercisesQuery(target).all().length;

    const first = restoreMerge(target, roundTrip(source));
    expect(first).toEqual({ exercisesAdded: 1, routinesAdded: 1, workoutsAdded: 2, workoutsSkipped: 0 });
    expect(exercisesQuery(target).all()).toHaveLength(before + 1);
    expect(routinesQuery(target).all().map((r) => r.name)).toEqual(['Existing', 'Strength']);
    expect(listWorkouts(target).all().map((w) => w.notes)).toEqual(['day 3', 'day 1']);
    expect(getSettings(target).unit).toBe('kg');

    // Importing the same file again adds no workouts.
    expect(restoreMerge(target, roundTrip(source))).toMatchObject({ workoutsAdded: 0, workoutsSkipped: 2 });
  });

  it('merge keeps only one workout in progress', async () => {
    startWorkout(source, null, at(7));
    const target = await freshDb();
    const active = startWorkout(target, null, at(8));
    expect(restoreMerge(target, roundTrip(source))).toMatchObject({ workoutsAdded: 2, workoutsSkipped: 1 });
    expect(getActiveWorkout(target)?.id).toBe(active);
  });
});
