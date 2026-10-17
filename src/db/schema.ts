import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { ProgressionRule } from '@/progression/types';

const createdAt = () =>
  integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`);

/** The exercise library. Built-ins are seeded; the user (or a Jefit import) can add more. */
export const exercises = sqliteTable('exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  /** Primary muscle group, e.g. "chest". */
  muscleGroup: text('muscle_group').notNull(),
  equipment: text('equipment'),
  /** Weight added per progression step, in the user's unit. */
  defaultIncrement: real('default_increment').notNull().default(2.5),
  /** Where the exercise came from: 'builtin', 'user' or 'jefit'. */
  source: text('source').notNull().default('builtin'),
  createdAt: createdAt(),
});

/** A training plan such as "Push / Pull / Legs". */
export const routines = sqliteTable('routines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  notes: text('notes'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
});

/** One day of a routine, e.g. "Push A". */
export const routineDays = sqliteTable('routine_days', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  routineId: integer('routine_id')
    .notNull()
    .references(() => routines.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').notNull(),
});

/** An exercise slot in a routine day, with the progression rule that drives it. */
export const routineExercises = sqliteTable('routine_exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dayId: integer('day_id')
    .notNull()
    .references(() => routineDays.id, { onDelete: 'cascade' }),
  exerciseId: integer('exercise_id')
    .notNull()
    .references(() => exercises.id),
  position: integer('position').notNull(),
  rule: text('rule', { mode: 'json' }).$type<ProgressionRule>().notNull(),
  /** Weight for the first session, before there is any history. */
  startWeight: real('start_weight').notNull().default(0),
  restSeconds: integer('rest_seconds').notNull().default(120),
});

/** A performed workout. finishedAt is null while it is in progress. */
export const workouts = sqliteTable('workouts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dayId: integer('day_id').references(() => routineDays.id, { onDelete: 'set null' }),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  notes: text('notes'),
  source: text('source').notNull().default('app'),
});

/** One logged set. */
export const workoutSets = sqliteTable(
  'workout_sets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workoutId: integer('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id),
    position: integer('position').notNull(),
    weight: real('weight').notNull(),
    reps: integer('reps').notNull(),
    rpe: real('rpe'),
    isWarmup: integer('is_warmup', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('workout_sets_exercise_idx').on(t.exerciseId), index('workout_sets_workout_idx').on(t.workoutId)],
);

/** Key/value app settings such as the weight unit. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
