import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { ProgressionRule, Suggestion } from '@/progression/types';

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
  /** Free-text notes, e.g. setup cues. */
  notes: text('notes'),
  createdAt: createdAt(),
});

/** A training plan such as "Push / Pull / Legs". */
export const routines = sqliteTable('routines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  notes: text('notes'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  /** Id in the app it was imported from (e.g. "jefit:5"), so a second import skips it. */
  externalId: text('external_id'),
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
  /** Id in the app it was imported from (e.g. "jefit:812"), so a second import skips it. */
  externalId: text('external_id'),
});

/** An exercise performed in a workout, in order. Created at start from the routine day, or added ad hoc. */
export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workoutId: integer('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id),
    /** The routine slot it came from, if any, so its rule drives the suggestion. */
    slotId: integer('slot_id').references(() => routineExercises.id, { onDelete: 'set null' }),
    position: integer('position').notNull(),
    /** What the progression engine suggested when the exercise was added. */
    target: text('target', { mode: 'json' }).$type<Suggestion>(),
    restSeconds: integer('rest_seconds').notNull().default(120),
  },
  (t) => [index('workout_exercises_workout_idx').on(t.workoutId)],
);

/** One logged set. */
export const workoutSets = sqliteTable(
  'workout_sets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workoutExerciseId: integer('workout_exercise_id')
      .notNull()
      .references(() => workoutExercises.id, { onDelete: 'cascade' }),
    // workoutId and exerciseId are copied from the workout exercise so history queries need no extra join.
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
    loggedAt: integer('logged_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('workout_sets_exercise_idx').on(t.exerciseId),
    index('workout_sets_workout_idx').on(t.workoutId),
    index('workout_sets_workout_exercise_idx').on(t.workoutExerciseId),
  ],
);

/** Key/value app settings such as the weight unit. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Body weight and measurements on a date. Lengths are in the user's length unit (cm or in). */
export const bodyMeasurements = sqliteTable('body_measurements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  measuredAt: integer('measured_at', { mode: 'timestamp' }).notNull(),
  weight: real('weight'),
  bodyFat: real('body_fat'),
  /** Circumferences by name, e.g. { chest: 113, waist: 80 }. */
  measurements: text('measurements', { mode: 'json' }).$type<Record<string, number>>(),
  source: text('source').notNull().default('app'),
});
