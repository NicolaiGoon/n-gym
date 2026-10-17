import { and, asc, eq, like, ne, sql } from 'drizzle-orm';

import { exercises } from '../schema';
import type { Database } from '../types';

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'legs',
  'glutes',
  'calves',
  'cardio',
  'other',
] as const;

export type Exercise = typeof exercises.$inferSelect;

export interface ExerciseInput {
  name: string;
  muscleGroup: string;
  equipment?: string | null;
  defaultIncrement: number;
}

export interface ExerciseFilter {
  query?: string;
  muscleGroup?: string | null;
}

/** Library query, for live screens. */
export function exercisesQuery(db: Database, filter: ExerciseFilter = {}) {
  const conditions = [];
  const query = filter.query?.trim();
  if (query) conditions.push(like(exercises.name, `%${query}%`));
  if (filter.muscleGroup) conditions.push(eq(exercises.muscleGroup, filter.muscleGroup));
  return db
    .select()
    .from(exercises)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(exercises.muscleGroup), asc(exercises.name));
}

export function getExercise(db: Database, id: number): Exercise | undefined {
  return db.select().from(exercises).where(eq(exercises.id, id)).get();
}

function validate(db: Database, input: ExerciseInput, id?: number): ExerciseInput {
  const name = input.name.trim();
  if (!name) throw new Error('Name is required.');
  if (!input.muscleGroup) throw new Error('Pick a muscle group.');
  if (!Number.isFinite(input.defaultIncrement) || input.defaultIncrement < 0) {
    throw new Error("Increment can't be negative.");
  }
  const duplicate = db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        sql`lower(${exercises.name}) = lower(${name})`,
        id === undefined ? undefined : ne(exercises.id, id),
      ),
    )
    .get();
  if (duplicate) throw new Error(`An exercise called "${name}" already exists.`);
  return { ...input, name, equipment: input.equipment?.trim() || null };
}

export function createExercise(db: Database, input: ExerciseInput): number {
  const values = validate(db, input);
  const row = db
    .insert(exercises)
    .values({ ...values, source: 'user' })
    .returning({ id: exercises.id })
    .get();
  return row.id;
}

export function updateExercise(db: Database, id: number, input: ExerciseInput): void {
  const values = validate(db, input, id);
  db.update(exercises).set(values).where(eq(exercises.id, id)).run();
}
