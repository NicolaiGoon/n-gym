import { eq, or, sql } from 'drizzle-orm';

import {
  bodyMeasurements,
  exercises,
  routineDays,
  routineExercises,
  routines,
  settings,
  workoutExercises,
  workouts,
  workoutSets,
} from './schema';
import type { Database } from './types';

/**
 * Whole-database backups as JSON. Pure data code with no file access, so it runs in tests;
 * reading and writing files lives in src/backup.
 */

export const BACKUP_FORMAT = 'n-gym-backup';
export const BACKUP_VERSION = 1;

type Rows<T extends { $inferSelect: unknown }> = T['$inferSelect'][];

export interface BackupTables {
  exercises: Rows<typeof exercises>;
  routines: Rows<typeof routines>;
  routineDays: Rows<typeof routineDays>;
  routineExercises: Rows<typeof routineExercises>;
  workouts: Rows<typeof workouts>;
  workoutExercises: Rows<typeof workoutExercises>;
  workoutSets: Rows<typeof workoutSets>;
  settings: Rows<typeof settings>;
  bodyMeasurements: Rows<typeof bodyMeasurements>;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: BackupTables;
}

const TABLE_KEYS = [
  'exercises',
  'routines',
  'routineDays',
  'routineExercises',
  'workouts',
  'workoutExercises',
  'workoutSets',
  'settings',
] as const;

/** Tables added after the first backups; missing ones are read as empty. */
const OPTIONAL_TABLE_KEYS = ['bodyMeasurements'] as const;

/** Columns stored as timestamps; JSON turns them into ISO strings, so they are turned back into dates on load. */
const DATE_FIELDS = ['createdAt', 'startedAt', 'finishedAt', 'loggedAt', 'measuredAt'];

export function createBackup(db: Database, now = new Date()): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    tables: {
      exercises: db.select().from(exercises).all(),
      routines: db.select().from(routines).all(),
      routineDays: db.select().from(routineDays).all(),
      routineExercises: db.select().from(routineExercises).all(),
      workouts: db.select().from(workouts).all(),
      workoutExercises: db.select().from(workoutExercises).all(),
      workoutSets: db.select().from(workoutSets).all(),
      settings: db.select().from(settings).all(),
      bodyMeasurements: db.select().from(bodyMeasurements).all(),
    },
  };
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup);
}

/** Parses and checks a backup file. Throws a readable error for anything that isn't an n-gym backup. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a valid backup (it isn't JSON).");
  }
  const backup = data as Partial<Backup> | null;
  if (!backup || backup.format !== BACKUP_FORMAT || typeof backup.tables !== 'object' || !backup.tables) {
    throw new Error("This file isn't an n-gym backup.");
  }
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of n-gym. Update the app first.');
  }
  const tables = backup.tables as unknown as Record<string, unknown>;
  for (const key of OPTIONAL_TABLE_KEYS) tables[key] ??= [];
  for (const key of [...TABLE_KEYS, ...OPTIONAL_TABLE_KEYS]) {
    const rows = tables[key];
    if (!Array.isArray(rows)) throw new Error(`The backup is missing its ${key} table.`);
    for (const row of rows as Record<string, unknown>[]) {
      for (const field of DATE_FIELDS) {
        if (typeof row[field] === 'string' || typeof row[field] === 'number') row[field] = new Date(row[field]);
      }
    }
  }
  return backup as Backup;
}

export interface BackupCounts {
  exercises: number;
  routines: number;
  workouts: number;
  sets: number;
  firstWorkout: Date | null;
  lastWorkout: Date | null;
}

export function backupCounts(backup: Backup): BackupCounts {
  const times = backup.tables.workouts.map((w) => w.startedAt.getTime()).sort((a, b) => a - b);
  return {
    exercises: backup.tables.exercises.length,
    routines: backup.tables.routines.length,
    workouts: backup.tables.workouts.length,
    sets: backup.tables.workoutSets.length,
    firstWorkout: times.length ? new Date(times[0]) : null,
    lastWorkout: times.length ? new Date(times[times.length - 1]) : null,
  };
}

/** Replaces everything in the database with the backup, keeping its ids. */
export function restoreReplace(db: Database, backup: Backup): void {
  const t = backup.tables;
  db.transaction((tx) => {
    // Children first, so foreign keys never point at missing rows.
    tx.delete(workoutSets).run();
    tx.delete(workoutExercises).run();
    tx.delete(workouts).run();
    tx.delete(routineExercises).run();
    tx.delete(routineDays).run();
    tx.delete(routines).run();
    tx.delete(exercises).run();
    tx.delete(settings).run();
    tx.delete(bodyMeasurements).run();

    for (const row of t.exercises) tx.insert(exercises).values(row).run();
    for (const row of t.routines) tx.insert(routines).values(row).run();
    for (const row of t.routineDays) tx.insert(routineDays).values(row).run();
    for (const row of t.routineExercises) tx.insert(routineExercises).values(row).run();
    for (const row of t.workouts) tx.insert(workouts).values(row).run();
    for (const row of t.workoutExercises) tx.insert(workoutExercises).values(row).run();
    for (const row of t.workoutSets) tx.insert(workoutSets).values(row).run();
    for (const row of t.settings) tx.insert(settings).values(row).run();
    for (const row of t.bodyMeasurements) tx.insert(bodyMeasurements).values(row).run();
  });
}

export interface MergeResult {
  exercisesAdded: number;
  routinesAdded: number;
  workoutsAdded: number;
  workoutsSkipped: number;
}

/**
 * Adds the backup's data to what is already there. Exercises are matched by name; routines are
 * added as new copies; workouts already present (same start time) are skipped. Settings are kept.
 */
export function restoreMerge(db: Database, backup: Backup): MergeResult {
  const t = backup.tables;
  const result: MergeResult = { exercisesAdded: 0, routinesAdded: 0, workoutsAdded: 0, workoutsSkipped: 0 };

  db.transaction((tx) => {
    const exerciseIds = new Map<number, number>();
    for (const { id, ...row } of t.exercises) {
      const existing = tx
        .select({ id: exercises.id })
        .from(exercises)
        .where(
          row.libraryId
            ? or(eq(exercises.libraryId, row.libraryId), sql`lower(${exercises.name}) = lower(${row.name})`)
            : sql`lower(${exercises.name}) = lower(${row.name})`,
        )
        .get();
      if (existing) {
        exerciseIds.set(id, existing.id);
      } else {
        exerciseIds.set(id, tx.insert(exercises).values(row).returning({ id: exercises.id }).get().id);
        result.exercisesAdded++;
      }
    }
    const exerciseId = (old: number) => {
      const mapped = exerciseIds.get(old);
      if (mapped === undefined) throw new Error('The backup refers to an exercise it does not contain.');
      return mapped;
    };

    const routineIds = new Map<number, number>();
    for (const { id, ...row } of t.routines) {
      routineIds.set(id, tx.insert(routines).values(row).returning({ id: routines.id }).get().id);
      result.routinesAdded++;
    }
    const dayIds = new Map<number, number>();
    for (const { id, routineId, ...row } of t.routineDays) {
      const mappedRoutine = routineIds.get(routineId);
      if (mappedRoutine === undefined) continue;
      dayIds.set(id, tx.insert(routineDays).values({ ...row, routineId: mappedRoutine }).returning({ id: routineDays.id }).get().id);
    }
    const slotIds = new Map<number, number>();
    for (const { id, dayId, exerciseId: oldExercise, ...row } of t.routineExercises) {
      const mappedDay = dayIds.get(dayId);
      if (mappedDay === undefined) continue;
      slotIds.set(
        id,
        tx
          .insert(routineExercises)
          .values({ ...row, dayId: mappedDay, exerciseId: exerciseId(oldExercise) })
          .returning({ id: routineExercises.id })
          .get().id,
      );
    }

    const hasActive = !!tx.select({ id: workouts.id }).from(workouts).where(sql`${workouts.finishedAt} is null`).get();
    const workoutIds = new Map<number, number>();
    for (const { id, dayId, ...row } of t.workouts) {
      const duplicate = tx.select({ id: workouts.id }).from(workouts).where(eq(workouts.startedAt, row.startedAt)).get();
      // Only one workout may be in progress.
      if (duplicate || (row.finishedAt === null && hasActive)) {
        result.workoutsSkipped++;
        continue;
      }
      const mappedDay = dayId === null ? null : (dayIds.get(dayId) ?? null);
      workoutIds.set(id, tx.insert(workouts).values({ ...row, dayId: mappedDay }).returning({ id: workouts.id }).get().id);
      result.workoutsAdded++;
    }
    const workoutExerciseIds = new Map<number, number>();
    for (const { id, workoutId, exerciseId: oldExercise, slotId, ...row } of t.workoutExercises) {
      const mappedWorkout = workoutIds.get(workoutId);
      if (mappedWorkout === undefined) continue;
      workoutExerciseIds.set(
        id,
        tx
          .insert(workoutExercises)
          .values({
            ...row,
            workoutId: mappedWorkout,
            exerciseId: exerciseId(oldExercise),
            slotId: slotId === null ? null : (slotIds.get(slotId) ?? null),
          })
          .returning({ id: workoutExercises.id })
          .get().id,
      );
    }
    for (const { id: _id, workoutExerciseId, workoutId, exerciseId: oldExercise, ...row } of t.workoutSets) {
      const mappedItem = workoutExerciseIds.get(workoutExerciseId);
      const mappedWorkout = workoutIds.get(workoutId);
      if (mappedItem === undefined || mappedWorkout === undefined) continue;
      tx.insert(workoutSets)
        .values({ ...row, workoutExerciseId: mappedItem, workoutId: mappedWorkout, exerciseId: exerciseId(oldExercise) })
        .run();
    }
    for (const { id: _id, ...row } of t.bodyMeasurements) {
      const duplicate = tx.select({ id: bodyMeasurements.id }).from(bodyMeasurements).where(eq(bodyMeasurements.measuredAt, row.measuredAt)).get();
      if (!duplicate) tx.insert(bodyMeasurements).values(row).run();
    }
  });

  return result;
}
