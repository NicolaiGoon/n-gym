import { asc, eq, isNull } from 'drizzle-orm';

import { getSetting, setSetting } from '@/db/repo/settings';
import { exercises, routineExercises, workoutExercises, workoutSets } from '@/db/schema';
import type { Database } from '@/db/types';
import { remapJefitExercise } from '@/import/jefit/import';

import LIBRARY_JSON from './exercise-library.json';

/** One exercise from the bundled library (free-exercise-db, public domain). */
export interface LibraryExercise {
  id: string;
  name: string;
  muscleGroup: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
  mechanic: string | null;
  level: string;
  instructions: string[];
  image: boolean;
}

export const LIBRARY = LIBRARY_JSON as LibraryExercise[];
const byId = new Map(LIBRARY.map((e) => [e.id, e]));

export function libraryExercise(id: string | null | undefined): LibraryExercise | undefined {
  return id ? byId.get(id) : undefined;
}

/** The muscles weekly stats are counted on, in display order. */
export const MUSCLES = [
  'chest',
  'shoulders',
  'triceps',
  'biceps',
  'forearms',
  'lats',
  'middle back',
  'traps',
  'lower back',
  'abdominals',
  'glutes',
  'quadriceps',
  'hamstrings',
  'adductors',
  'abductors',
  'calves',
  'neck',
] as const;

/** Muscles assumed for exercises without their own, e.g. ones created by hand. */
const GROUP_MUSCLES: Record<string, { primary: string[]; secondary: string[] }> = {
  chest: { primary: ['chest'], secondary: ['triceps', 'shoulders'] },
  back: { primary: ['lats'], secondary: ['middle back', 'biceps'] },
  shoulders: { primary: ['shoulders'], secondary: ['triceps'] },
  biceps: { primary: ['biceps'], secondary: [] },
  triceps: { primary: ['triceps'], secondary: [] },
  forearms: { primary: ['forearms'], secondary: [] },
  abs: { primary: ['abdominals'], secondary: [] },
  legs: { primary: ['quadriceps'], secondary: ['hamstrings', 'glutes'] },
  glutes: { primary: ['glutes'], secondary: ['hamstrings'] },
  calves: { primary: ['calves'], secondary: [] },
};

/** The muscles an exercise works, falling back to its muscle group. */
export function musclesOf(exercise: { muscleGroup: string; primaryMuscles: string[]; secondaryMuscles: string[] }) {
  if (exercise.primaryMuscles.length) return { primary: exercise.primaryMuscles, secondary: exercise.secondaryMuscles };
  return GROUP_MUSCLES[exercise.muscleGroup] ?? { primary: [], secondary: [] };
}

/** A set counts fully for each primary muscle and as half a set for each secondary one. */
export function addSets(totals: Map<string, number>, muscles: { primary: string[]; secondary: string[] }, sets: number) {
  for (const m of muscles.primary) totals.set(m, (totals.get(m) ?? 0) + sets);
  for (const m of muscles.secondary) totals.set(m, (totals.get(m) ?? 0) + sets / 2);
}

export function sortedMuscleTotals(totals: Map<string, number>): { muscle: string; sets: number }[] {
  return [...totals.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .filter((t) => t.sets > 0)
    .sort((a, b) => b.sets - a.sets || MUSCLES.indexOf(a.muscle as never) - MUSCLES.indexOf(b.muscle as never));
}

/** The built-in starter exercises, which predate the library, and their library entries. */
const BUILTIN_ALIASES: Record<string, string> = {
  'barbell bench press': 'barbell-bench-press-medium-grip',
  'incline dumbbell press': 'incline-dumbbell-press',
  'dumbbell fly': 'dumbbell-flyes',
  'barbell squat': 'barbell-squat',
  'romanian deadlift': 'romanian-deadlift',
  'leg press': 'leg-press',
  'leg curl': 'lying-leg-curls',
  'standing calf raise': 'standing-calf-raises',
  'barbell deadlift': 'barbell-deadlift',
  'barbell row': 'bent-over-barbell-row',
  'pull-up': 'pullups',
  'lat pulldown': 'wide-grip-lat-pulldown',
  'seated cable row': 'seated-cable-rows',
  'overhead press': 'standing-military-press',
  'dumbbell lateral raise': 'side-lateral-raise',
  'face pull': 'face-pull',
  'barbell curl': 'barbell-curl',
  'dumbbell hammer curl': 'hammer-curls',
  'triceps pushdown': 'triceps-pushdown',
  'skull crusher': 'ez-bar-skullcrusher',
  plank: 'plank',
};

function increment(equipment: string | null): number {
  if (equipment === 'bodyweight') return 0;
  if (equipment === 'dumbbell') return 2;
  if (equipment === 'kettlebell') return 4;
  return 2.5;
}

const VERSION_KEY = 'libraryVersion';
/** Raise when the bundled library changes, so existing installs pick up new entries. */
const LIBRARY_VERSION = 1;

/**
 * Adds the bundled library to the exercise table and links exercises that already exist by name,
 * filling in their muscles. Runs once per library version; existing names, muscle groups and
 * history are never changed.
 */
export function syncLibrary(db: Database): void {
  if (Number(getSetting(db, VERSION_KEY)) >= LIBRARY_VERSION) return;
  db.transaction((tx) => {
    const existing = tx
      .select({ id: exercises.id, name: exercises.name, libraryId: exercises.libraryId })
      .from(exercises)
      .all();
    const linked = new Set(existing.map((e) => e.libraryId).filter(Boolean));
    const byName = new Map(existing.map((e) => [e.name.toLowerCase(), e]));
    for (const [alias, libraryId] of Object.entries(BUILTIN_ALIASES)) {
      const exercise = byName.get(alias);
      if (exercise && !byName.has(libraryExercise(libraryId)?.name.toLowerCase() ?? '')) {
        byName.set(libraryExercise(libraryId)!.name.toLowerCase(), exercise);
      }
    }

    const added: (typeof exercises.$inferInsert)[] = [];
    for (const item of LIBRARY) {
      if (linked.has(item.id)) continue;
      const match = byName.get(item.name.toLowerCase());
      if (match) {
        if (!match.libraryId) {
          tx.update(exercises)
            .set({ libraryId: item.id, primaryMuscles: item.primaryMuscles, secondaryMuscles: item.secondaryMuscles })
            .where(eq(exercises.id, match.id))
            .run();
          match.libraryId = item.id;
        }
        continue;
      }
      added.push({
        name: item.name,
        muscleGroup: item.muscleGroup,
        equipment: item.equipment,
        defaultIncrement: increment(item.equipment),
        source: 'library',
        libraryId: item.id,
        primaryMuscles: item.primaryMuscles,
        secondaryMuscles: item.secondaryMuscles,
      });
    }
    for (let i = 0; i < added.length; i += 100) tx.insert(exercises).values(added.slice(i, i + 100)).run();
  });
  setSetting(db, VERSION_KEY, String(LIBRARY_VERSION));
}

/** Exercises with no library link, e.g. ones created by hand or imported from Jefit. */
export function unlinkedExercises(db: Database) {
  return db.select().from(exercises).where(isNull(exercises.libraryId)).orderBy(asc(exercises.name)).all();
}

/**
 * Links an exercise to a library entry, so it gets that entry's picture, muscles and instructions.
 * The exercise keeps its name and history. If the library entry was already in the exercise list
 * as its own exercise, that one is merged into this one: its logged sets and routine slots move
 * over and it is removed.
 */
export function linkToLibrary(db: Database, exerciseId: number, libraryId: string): void {
  const item = libraryExercise(libraryId);
  if (!item) throw new Error('That library exercise does not exist.');
  db.transaction((tx) => {
    const target = tx.select().from(exercises).where(eq(exercises.id, exerciseId)).get();
    if (!target) throw new Error('That exercise does not exist.');
    const other = tx.select().from(exercises).where(eq(exercises.libraryId, libraryId)).get();
    if (other && other.id !== exerciseId) {
      tx.update(workoutSets).set({ exerciseId }).where(eq(workoutSets.exerciseId, other.id)).run();
      tx.update(workoutExercises).set({ exerciseId }).where(eq(workoutExercises.exerciseId, other.id)).run();
      tx.update(routineExercises).set({ exerciseId }).where(eq(routineExercises.exerciseId, other.id)).run();
      tx.delete(exercises).where(eq(exercises.id, other.id)).run();
      remapJefitExercise(tx, other.id, exerciseId);
    }
    tx.update(exercises)
      .set({
        libraryId,
        primaryMuscles: item.primaryMuscles,
        secondaryMuscles: item.secondaryMuscles,
        equipment: target.equipment ?? item.equipment,
      })
      .where(eq(exercises.id, exerciseId))
      .run();
  });
}
