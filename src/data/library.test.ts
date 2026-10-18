/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createExercise, exercisesQuery } from '@/db/repo/exercises';
import { exercises } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import { createTestDb } from '@/db/test-db';
import type { Database } from '@/db/types';

import { addDay, addExerciseToDay, createRoutine, slotsQuery } from '@/db/repo/routines';
import { addExerciseToWorkout, finishWorkout, logSet, startWorkout, workoutDetail } from '@/db/repo/workouts';

import { LIBRARY, libraryExercise, linkToLibrary, musclesOf, syncLibrary, unlinkedExercises } from './library';
import { GOOD_MATCH, similarLibraryExercises } from './match';

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
  await seedIfEmpty(db);
});

const byName = (name: string) => db.select().from(exercises).where(eq(exercises.name, name)).get();

describe('exercise library', () => {
  it('has valid entries and a picture for nearly all of them', () => {
    expect(LIBRARY.length).toBeGreaterThan(700);
    expect(new Set(LIBRARY.map((e) => e.id)).size).toBe(LIBRARY.length);
    expect(new Set(LIBRARY.map((e) => e.name.toLowerCase())).size).toBe(LIBRARY.length);
    for (const e of LIBRARY) expect(e.primaryMuscles.length).toBeGreaterThan(0);
    const withImage = LIBRARY.filter((e) => e.image);
    expect(withImage.length).toBeGreaterThan(LIBRARY.length - 10);
    const imageMap = readFileSync('src/data/exercise-images.ts', 'utf8');
    for (const e of withImage) {
      expect(existsSync(`assets/exercises/${e.id}.webp`)).toBe(true);
      expect(imageMap).toContain(`'${e.id}': require('../../assets/exercises/${e.id}.webp')`);
    }
  });

  it('links the starter exercises, keeps their names and adds the rest once', () => {
    const before = exercisesQuery(db).all().length;
    syncLibrary(db);
    const bench = byName('Barbell Bench Press')!;
    expect(bench.libraryId).toBe('barbell-bench-press-medium-grip');
    expect(musclesOf(bench).primary).toEqual(libraryExercise(bench.libraryId)!.primaryMuscles);
    expect(byName('Barbell Bench Press - Medium Grip')).toBeUndefined();

    const all = exercisesQuery(db).all();
    expect(all.filter((e) => e.libraryId).length).toBe(LIBRARY.length);
    expect(all.length).toBe(LIBRARY.length + before - all.filter((e) => e.source === 'builtin' && e.libraryId).length);

    syncLibrary(db);
    expect(exercisesQuery(db).all().length).toBe(all.length);
  });

  it('links an exercise created by hand with a library name instead of duplicating it', () => {
    const id = createExercise(db, { name: 'hack squat', muscleGroup: 'legs', defaultIncrement: 2.5 });
    syncLibrary(db);
    expect(db.select().from(exercises).where(eq(exercises.id, id)).get()!.libraryId).toBe('hack-squat');
  });

  it('links an exercise and merges the library copy, keeping the name and all history', () => {
    syncLibrary(db);
    const legPress = byName('Leg Press')!;
    const mine = createExercise(db, { name: 'Machine Leg Press', muscleGroup: 'legs', defaultIncrement: 5 });
    // Some sets were logged against each copy, and a routine uses the library one.
    for (const exerciseId of [mine, legPress.id]) {
      const workoutId = startWorkout(db, null);
      addExerciseToWorkout(db, workoutId, exerciseId);
      logSet(db, workoutDetail(db, workoutId)[0].id, { weight: 100, reps: 10 });
      finishWorkout(db, workoutId, null);
    }
    const day = addDay(db, createRoutine(db, 'Legs'), 'Legs');
    addExerciseToDay(db, day, legPress.id);
    expect(unlinkedExercises(db).map((e) => e.name)).toContain('Machine Leg Press');

    linkToLibrary(db, mine, 'leg-press');
    const linked = db.select().from(exercises).where(eq(exercises.id, mine)).get()!;
    expect(linked).toMatchObject({ name: 'Machine Leg Press', libraryId: 'leg-press', primaryMuscles: ['quadriceps'] });
    expect(byName('Leg Press')).toBeUndefined();
    expect(slotsQuery(db, day).all()[0].exerciseId).toBe(mine);
    expect(unlinkedExercises(db).map((e) => e.name)).not.toContain('Machine Leg Press');
  });
});

describe('name matching', () => {
  it('finds the library exercise for common spellings', () => {
    const best = (name: string) => similarLibraryExercises(name, 1)[0];
    expect(best('Barbell Bent-Over Row')).toMatchObject({ exercise: { id: 'bent-over-barbell-row' } });
    expect(best('Pull-Up').exercise.id).toBe('pullups');
    expect(best('Cable Tricep Pushdown').exercise.id).toBe('triceps-pushdown');
    expect(best('Machine Leg Press').exercise.id).toBe('leg-press');
    expect(best('Machine Leg Press').score).toBeGreaterThanOrEqual(GOOD_MATCH);
    // Different equipment is not a close match.
    expect(best('Barbell Lying Triceps Extension').score).toBeLessThan(GOOD_MATCH);
  });
});
