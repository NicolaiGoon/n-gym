import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, max, ne } from 'drizzle-orm';

import { defaultRule, estimateOneRepMax, suggestNext, type Suggestion } from '@/progression';

import { exerciseHistory } from '../queries';
import { exercises, routineExercises, workoutExercises, workouts, workoutSets } from '../schema';
import type { Database } from '../types';
import { moveInOrder } from './move';

export type Workout = typeof workouts.$inferSelect;
export type WorkoutSet = typeof workoutSets.$inferSelect;

export interface SetInput {
  weight: number;
  reps: number;
  rpe?: number | null;
  isWarmup?: boolean;
}

/** The workout in progress, if any. */
export function getActiveWorkout(db: Database): Workout | undefined {
  return db.select().from(workouts).where(isNull(workouts.finishedAt)).orderBy(desc(workouts.startedAt)).get();
}

export function getWorkout(db: Database, id: number): Workout | undefined {
  return db.select().from(workouts).where(eq(workouts.id, id)).get();
}

/** What the engine suggests for an exercise, using the routine slot's rule when there is one. */
export function suggestFor(db: Database, exerciseId: number, slotId?: number | null): Suggestion {
  const slot = slotId ? db.select().from(routineExercises).where(eq(routineExercises.id, slotId)).get() : undefined;
  const exercise = db.select().from(exercises).where(eq(exercises.id, exerciseId)).get();
  const rule = slot?.rule ?? defaultRule('double', exercise?.defaultIncrement ?? 2.5);
  return suggestNext(rule, exerciseHistory(db, exerciseId), slot?.startWeight ?? 0);
}

function nextPosition(db: Database, workoutId: number): number {
  const [{ last }] = db
    .select({ last: max(workoutExercises.position) })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .all();
  return (last ?? -1) + 1;
}

/**
 * Starts a workout, from a routine day or empty. Only one workout can be in progress.
 */
export function startWorkout(db: Database, dayId: number | null, now = new Date()): number {
  if (getActiveWorkout(db)) throw new Error('A workout is already in progress. Finish or discard it first.');
  const slots = dayId
    ? db.select().from(routineExercises).where(eq(routineExercises.dayId, dayId)).orderBy(asc(routineExercises.position)).all()
    : [];
  return db.transaction((tx) => {
    const workoutId = tx.insert(workouts).values({ dayId, startedAt: now }).returning({ id: workouts.id }).get().id;
    slots.forEach((slot, position) =>
      tx
        .insert(workoutExercises)
        .values({
          workoutId,
          exerciseId: slot.exerciseId,
          slotId: slot.id,
          position,
          target: suggestFor(tx, slot.exerciseId, slot.id),
          restSeconds: slot.restSeconds,
        })
        .run(),
    );
    return workoutId;
  });
}

/** Exercises of a workout with names, targets and logged sets. */
export function workoutDetail(db: Database, workoutId: number) {
  const items = db
    .select({
      id: workoutExercises.id,
      exerciseId: workoutExercises.exerciseId,
      name: exercises.name,
      increment: exercises.defaultIncrement,
      target: workoutExercises.target,
      restSeconds: workoutExercises.restSeconds,
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position))
    .all();
  const sets = db
    .select()
    .from(workoutSets)
    .where(eq(workoutSets.workoutId, workoutId))
    .orderBy(asc(workoutSets.position))
    .all();
  return items.map((item) => ({ ...item, sets: sets.filter((s) => s.workoutExerciseId === item.id) }));
}

export type WorkoutExerciseDetail = ReturnType<typeof workoutDetail>[number];

/** Working sets from the most recent finished workout that included this exercise, other than `excludeWorkoutId`. */
export function previousSets(db: Database, exerciseId: number, excludeWorkoutId?: number): WorkoutSet[] {
  const last = db
    .select({ id: workouts.id })
    .from(workoutSets)
    .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
    .where(
      and(
        eq(workoutSets.exerciseId, exerciseId),
        isNotNull(workouts.finishedAt),
        excludeWorkoutId === undefined ? undefined : ne(workouts.id, excludeWorkoutId),
      ),
    )
    .orderBy(desc(workouts.startedAt))
    .get();
  if (!last) return [];
  return db
    .select()
    .from(workoutSets)
    .where(and(eq(workoutSets.workoutId, last.id), eq(workoutSets.exerciseId, exerciseId), eq(workoutSets.isWarmup, false)))
    .orderBy(asc(workoutSets.position))
    .all();
}

export function addExerciseToWorkout(db: Database, workoutId: number, exerciseId: number): number {
  return db
    .insert(workoutExercises)
    .values({
      workoutId,
      exerciseId,
      position: nextPosition(db, workoutId),
      target: suggestFor(db, exerciseId),
    })
    .returning({ id: workoutExercises.id })
    .get().id;
}

function getWorkoutExercise(db: Database, id: number) {
  const item = db.select().from(workoutExercises).where(eq(workoutExercises.id, id)).get();
  if (!item) throw new Error('Exercise not found in this workout.');
  return item;
}

/** Replaces an exercise that has no logged sets yet with another one. */
export function swapWorkoutExercise(db: Database, id: number, exerciseId: number): void {
  const item = getWorkoutExercise(db, id);
  const logged = db.select({ id: workoutSets.id }).from(workoutSets).where(eq(workoutSets.workoutExerciseId, id)).get();
  if (logged) throw new Error('This exercise already has logged sets. Remove them first, or add the new exercise instead.');
  db.update(workoutExercises)
    .set({ exerciseId, slotId: null, target: suggestFor(db, exerciseId) })
    .where(eq(workoutExercises.id, item.id))
    .run();
}

export function removeWorkoutExercise(db: Database, id: number): void {
  db.delete(workoutExercises).where(eq(workoutExercises.id, id)).run();
}

export function moveWorkoutExercise(db: Database, id: number, direction: 'up' | 'down'): void {
  const item = getWorkoutExercise(db, id);
  const siblings = db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, item.workoutId))
    .orderBy(asc(workoutExercises.position))
    .all();
  const order = moveInOrder(siblings, id, direction);
  db.transaction((tx) => {
    order.forEach((itemId, position) =>
      tx.update(workoutExercises).set({ position }).where(eq(workoutExercises.id, itemId)).run(),
    );
  });
}

function validateSet(input: SetInput) {
  if (!Number.isFinite(input.weight) || input.weight < 0) throw new Error("Weight can't be negative.");
  if (!Number.isInteger(input.reps) || input.reps < 0) throw new Error('Reps must be a whole number.');
  if (input.rpe != null && !(input.rpe >= 1 && input.rpe <= 10)) throw new Error('RPE must be between 1 and 10.');
}

export function logSet(db: Database, workoutExerciseId: number, input: SetInput, now = new Date()): number {
  validateSet(input);
  const item = getWorkoutExercise(db, workoutExerciseId);
  const [{ last }] = db
    .select({ last: max(workoutSets.position) })
    .from(workoutSets)
    .where(eq(workoutSets.workoutExerciseId, workoutExerciseId))
    .all();
  return db
    .insert(workoutSets)
    .values({
      workoutExerciseId,
      workoutId: item.workoutId,
      exerciseId: item.exerciseId,
      position: (last ?? -1) + 1,
      weight: input.weight,
      reps: input.reps,
      rpe: input.rpe ?? null,
      isWarmup: input.isWarmup ?? false,
      loggedAt: now,
    })
    .returning({ id: workoutSets.id })
    .get().id;
}

export function updateSet(db: Database, id: number, input: SetInput): void {
  validateSet(input);
  db.update(workoutSets)
    .set({ weight: input.weight, reps: input.reps, rpe: input.rpe ?? null, isWarmup: input.isWarmup ?? false })
    .where(eq(workoutSets.id, id))
    .run();
}

export function deleteSet(db: Database, id: number): void {
  db.delete(workoutSets).where(eq(workoutSets.id, id)).run();
}

export interface PersonalRecord {
  exerciseId: number;
  name: string;
  oneRepMax: number;
  previous: number;
}

export interface WorkoutSummary {
  durationSeconds: number;
  exerciseCount: number;
  setCount: number;
  volume: number;
  records: PersonalRecord[];
}

/** Totals for a workout and the exercises where it beat the previous best estimated 1RM. */
export function workoutSummary(db: Database, workoutId: number, now = new Date()): WorkoutSummary {
  const workout = getWorkout(db, workoutId);
  if (!workout) throw new Error('Workout not found.');
  const detail = workoutDetail(db, workoutId);
  const working = detail.flatMap((item) => item.sets.filter((s) => !s.isWarmup).map((s) => ({ ...s, name: item.name })));

  const records: PersonalRecord[] = [];
  const exerciseIds = [...new Set(working.map((s) => s.exerciseId))];
  const earlier = exerciseIds.length
    ? db
        .select({ exerciseId: workoutSets.exerciseId, weight: workoutSets.weight, reps: workoutSets.reps })
        .from(workoutSets)
        .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
        .where(
          and(
            inArray(workoutSets.exerciseId, exerciseIds),
            eq(workoutSets.isWarmup, false),
            lt(workouts.startedAt, workout.startedAt),
          ),
        )
        .all()
    : [];
  for (const exerciseId of exerciseIds) {
    const sets = working.filter((s) => s.exerciseId === exerciseId);
    const best = Math.max(...sets.map((s) => estimateOneRepMax(s.weight, s.reps)));
    const before = earlier.filter((s) => s.exerciseId === exerciseId);
    const previous = Math.max(0, ...before.map((s) => estimateOneRepMax(s.weight, s.reps)));
    // A first-ever session isn't counted as a record.
    if (before.length > 0 && best > previous) {
      records.push({ exerciseId, name: sets[0].name, oneRepMax: best, previous });
    }
  }

  const end = workout.finishedAt ?? now;
  return {
    durationSeconds: Math.max(0, Math.round((end.getTime() - workout.startedAt.getTime()) / 1000)),
    exerciseCount: detail.filter((item) => item.sets.length > 0).length,
    setCount: working.length,
    volume: working.reduce((sum, s) => sum + s.weight * s.reps, 0),
    records,
  };
}

/** Finishes the workout. Exercises with no logged sets are dropped. */
export function finishWorkout(db: Database, id: number, notes: string | null, now = new Date()): void {
  const detail = workoutDetail(db, id);
  if (!detail.some((item) => item.sets.length > 0)) throw new Error('Log at least one set before finishing.');
  db.transaction((tx) => {
    for (const item of detail) {
      if (item.sets.length === 0) tx.delete(workoutExercises).where(eq(workoutExercises.id, item.id)).run();
    }
    tx.update(workouts)
      .set({ finishedAt: now, notes: notes?.trim() || null })
      .where(eq(workouts.id, id))
      .run();
  });
}

/** Deletes a workout and everything logged in it. */
export function discardWorkout(db: Database, id: number): void {
  db.delete(workouts).where(eq(workouts.id, id)).run();
}
