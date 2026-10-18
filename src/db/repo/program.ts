import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';

import { routines, workouts } from '../schema';
import type { Database } from '../types';
import { daysQuery, getRoutine, type Routine } from './routines';
import { getSetting, setSetting } from './settings';

const ACTIVE_KEY = 'activeRoutine';

/** The routine the user is following now, if it still exists and isn't archived. */
export function getActiveRoutine(db: Database): Routine | undefined {
  const id = Number(getSetting(db, ACTIVE_KEY));
  if (!id) return undefined;
  const routine = getRoutine(db, id);
  return routine && !routine.archived ? routine : undefined;
}

export function setActiveRoutine(db: Database, routineId: number | null): void {
  if (routineId !== null) {
    const routine = getRoutine(db, routineId);
    if (!routine) throw new Error('That routine does not exist.');
    if (routine.archived) db.update(routines).set({ archived: false }).where(eq(routines.id, routineId)).run();
  }
  setSetting(db, ACTIVE_KEY, routineId === null ? null : String(routineId));
}

export interface ProgramDay {
  id: number;
  name: string;
  exerciseCount: number;
  /** When this day was last trained, if ever. */
  lastDone: Date | null;
}

export interface ProgramPlan {
  days: ProgramDay[];
  /** The day after the one trained most recently, wrapping around; the first day if none was trained. */
  nextDayId: number | null;
}

/** The days of a routine with when each was last done, and which one is due next. */
export function programPlan(db: Database, routineId: number): ProgramPlan {
  const days = daysQuery(db, routineId).all();
  if (days.length === 0) return { days: [], nextDayId: null };
  const done = db
    .select({ dayId: workouts.dayId, startedAt: workouts.startedAt })
    .from(workouts)
    .where(and(isNotNull(workouts.finishedAt), inArray(workouts.dayId, days.map((d) => d.id))))
    .orderBy(desc(workouts.startedAt))
    .all();
  const lastDone = new Map<number, Date>();
  for (const w of done) if (w.dayId !== null && !lastDone.has(w.dayId)) lastDone.set(w.dayId, w.startedAt);

  const trainable = days.filter((d) => d.exerciseCount > 0);
  const latest = done[0]?.dayId;
  const index = days.findIndex((d) => d.id === latest);
  // The next day with exercises after the latest one, so empty days are skipped.
  const next =
    index === -1
      ? trainable[0]
      : ([...days.slice(index + 1), ...days.slice(0, index + 1)].find((d) => d.exerciseCount > 0) ?? trainable[0]);
  return {
    days: days.map((d) => ({ id: d.id, name: d.name, exerciseCount: d.exerciseCount, lastDone: lastDone.get(d.id) ?? null })),
    nextDayId: next?.id ?? null,
  };
}
