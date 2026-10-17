import { asc, count, eq, max } from 'drizzle-orm';

import { defaultRule, validateRule, type ProgressionRule } from '@/progression';

import { exercises, routineDays, routineExercises, routines } from '../schema';
import type { Database } from '../types';
import { moveInOrder } from './move';

export type Routine = typeof routines.$inferSelect;
export type RoutineDay = typeof routineDays.$inferSelect;

function requireName(name: string, what: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error(`${what} name is required.`);
  return trimmed;
}

// --- Routines ---------------------------------------------------------------

/** Routines for live screens, active first. */
export function routinesQuery(db: Database) {
  return db.select().from(routines).orderBy(asc(routines.archived), asc(routines.name));
}

export function getRoutine(db: Database, id: number): Routine | undefined {
  return db.select().from(routines).where(eq(routines.id, id)).get();
}

export function createRoutine(db: Database, name: string): number {
  return db
    .insert(routines)
    .values({ name: requireName(name, 'Routine') })
    .returning({ id: routines.id })
    .get().id;
}

export function updateRoutine(db: Database, id: number, changes: { name?: string; notes?: string | null }): void {
  const set: Partial<Routine> = {};
  if (changes.name !== undefined) set.name = requireName(changes.name, 'Routine');
  if (changes.notes !== undefined) set.notes = changes.notes?.trim() || null;
  db.update(routines).set(set).where(eq(routines.id, id)).run();
}

export function setRoutineArchived(db: Database, id: number, archived: boolean): void {
  db.update(routines).set({ archived }).where(eq(routines.id, id)).run();
}

/** Deletes a routine with its days and exercise slots. Logged workouts are kept. */
export function deleteRoutine(db: Database, id: number): void {
  db.delete(routines).where(eq(routines.id, id)).run();
}

// --- Days -------------------------------------------------------------------

/** Days of a routine with how many exercises each has, for live screens. */
export function daysQuery(db: Database, routineId: number) {
  return db
    .select({ id: routineDays.id, name: routineDays.name, position: routineDays.position, exerciseCount: count(routineExercises.id) })
    .from(routineDays)
    .leftJoin(routineExercises, eq(routineExercises.dayId, routineDays.id))
    .where(eq(routineDays.routineId, routineId))
    .groupBy(routineDays.id)
    .orderBy(asc(routineDays.position));
}

export function getDay(db: Database, id: number): RoutineDay | undefined {
  return db.select().from(routineDays).where(eq(routineDays.id, id)).get();
}

export function addDay(db: Database, routineId: number, name: string): number {
  const [{ last }] = db
    .select({ last: max(routineDays.position) })
    .from(routineDays)
    .where(eq(routineDays.routineId, routineId))
    .all();
  return db
    .insert(routineDays)
    .values({ routineId, name: requireName(name, 'Day'), position: (last ?? -1) + 1 })
    .returning({ id: routineDays.id })
    .get().id;
}

export function renameDay(db: Database, id: number, name: string): void {
  db.update(routineDays).set({ name: requireName(name, 'Day') }).where(eq(routineDays.id, id)).run();
}

export function deleteDay(db: Database, id: number): void {
  db.delete(routineDays).where(eq(routineDays.id, id)).run();
}

export function moveDay(db: Database, id: number, direction: 'up' | 'down'): void {
  const day = getDay(db, id);
  if (!day) return;
  const siblings = db
    .select({ id: routineDays.id })
    .from(routineDays)
    .where(eq(routineDays.routineId, day.routineId))
    .orderBy(asc(routineDays.position))
    .all();
  const order = moveInOrder(siblings, id, direction);
  db.transaction((tx) => {
    order.forEach((dayId, position) => tx.update(routineDays).set({ position }).where(eq(routineDays.id, dayId)).run());
  });
}

// --- Exercises in a day -----------------------------------------------------

/** Exercise slots of a day with exercise names, for live screens. */
export function slotsQuery(db: Database, dayId: number) {
  return db
    .select({
      id: routineExercises.id,
      exerciseId: routineExercises.exerciseId,
      name: exercises.name,
      muscleGroup: exercises.muscleGroup,
      rule: routineExercises.rule,
      startWeight: routineExercises.startWeight,
      restSeconds: routineExercises.restSeconds,
      position: routineExercises.position,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
    .where(eq(routineExercises.dayId, dayId))
    .orderBy(asc(routineExercises.position));
}

export type Slot = typeof routineExercises.$inferSelect;

export function getSlot(db: Database, id: number): Slot | undefined {
  return db.select().from(routineExercises).where(eq(routineExercises.id, id)).get();
}

/** Adds an exercise to the end of a day with a default double-progression rule. */
export function addExerciseToDay(db: Database, dayId: number, exerciseId: number): number {
  const exercise = db.select().from(exercises).where(eq(exercises.id, exerciseId)).get();
  if (!exercise) throw new Error('Exercise not found.');
  const [{ last }] = db
    .select({ last: max(routineExercises.position) })
    .from(routineExercises)
    .where(eq(routineExercises.dayId, dayId))
    .all();
  return db
    .insert(routineExercises)
    .values({
      dayId,
      exerciseId,
      position: (last ?? -1) + 1,
      rule: defaultRule('double', exercise.defaultIncrement),
    })
    .returning({ id: routineExercises.id })
    .get().id;
}

export interface SlotChanges {
  rule?: ProgressionRule;
  startWeight?: number;
  restSeconds?: number;
}

export function updateSlot(db: Database, id: number, changes: SlotChanges): void {
  if (changes.rule) {
    const errors = validateRule(changes.rule);
    if (errors.length) throw new Error(errors.join('\n'));
  }
  if (changes.startWeight !== undefined && !(changes.startWeight >= 0)) {
    throw new Error("Starting weight can't be negative.");
  }
  if (changes.restSeconds !== undefined && !(Number.isInteger(changes.restSeconds) && changes.restSeconds >= 0)) {
    throw new Error('Rest must be a whole number of seconds.');
  }
  db.update(routineExercises).set(changes).where(eq(routineExercises.id, id)).run();
}

export function removeSlot(db: Database, id: number): void {
  db.delete(routineExercises).where(eq(routineExercises.id, id)).run();
}

export function moveSlot(db: Database, id: number, direction: 'up' | 'down'): void {
  const slot = getSlot(db, id);
  if (!slot) return;
  const siblings = db
    .select({ id: routineExercises.id })
    .from(routineExercises)
    .where(eq(routineExercises.dayId, slot.dayId))
    .orderBy(asc(routineExercises.position))
    .all();
  const order = moveInOrder(siblings, id, direction);
  db.transaction((tx) => {
    order.forEach((slotId, position) =>
      tx.update(routineExercises).set({ position }).where(eq(routineExercises.id, slotId)).run(),
    );
  });
}
