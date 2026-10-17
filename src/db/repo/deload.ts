import { and, gte, isNotNull, eq } from 'drizzle-orm';

import { isStalled } from '@/progression';

import { exerciseHistory } from '../queries';
import { exercises, workouts, workoutSets } from '../schema';
import type { Database } from '../types';
import { getSetting, setSetting } from './settings';

const EVERY_KEY = 'deloadEveryWeeks';
const UNTIL_KEY = 'deloadUntil';
const LAST_KEY = 'lastDeloadAt';
const DAY = 24 * 3600 * 1000;
/** How many stalled lifts trigger a deload suggestion. */
export const STALLED_LIFTS_FOR_DELOAD = 3;

export interface DeloadStatus {
  /** A deload week is running; targets are lightened. */
  active: boolean;
  until: Date | null;
  /** Scheduled interval, 0 when off. */
  everyWeeks: number;
  /** Why a deload is suggested now, empty when it isn't. */
  reasons: string[];
  stalled: { id: number; name: string }[];
}

export function getDeloadEvery(db: Database): number {
  const weeks = Number(getSetting(db, EVERY_KEY));
  return Number.isInteger(weeks) && weeks > 0 ? weeks : 0;
}

export function setDeloadEvery(db: Database, weeks: number): void {
  if (!Number.isInteger(weeks) || weeks < 0) throw new Error('Weeks must be a whole number (0 turns it off).');
  setSetting(db, EVERY_KEY, weeks ? String(weeks) : null);
}

export function isDeloadActive(db: Database, now = new Date()): boolean {
  const until = getSetting(db, UNTIL_KEY);
  return !!until && new Date(until) > now;
}

/** Exercises trained in the last 6 weeks whose estimated 1RM hasn't improved over their last 3 sessions. */
export function stalledExercises(db: Database, now = new Date()): { id: number; name: string }[] {
  const recent = db
    .selectDistinct({ id: exercises.id, name: exercises.name })
    .from(workoutSets)
    .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
    .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
    .where(and(isNotNull(workouts.finishedAt), gte(workouts.startedAt, new Date(now.getTime() - 42 * DAY))))
    .all();
  return recent.filter((e) => isStalled(exerciseHistory(db, e.id)));
}

export function deloadStatus(db: Database, now = new Date()): DeloadStatus {
  const untilText = getSetting(db, UNTIL_KEY);
  const until = untilText ? new Date(untilText) : null;
  const active = !!until && until > now;
  const everyWeeks = getDeloadEvery(db);
  const stalled = stalledExercises(db, now);
  const reasons: string[] = [];

  if (!active) {
    if (everyWeeks) {
      const last = getSetting(db, LAST_KEY);
      const first = db.select({ startedAt: workouts.startedAt }).from(workouts).where(isNotNull(workouts.finishedAt)).orderBy(workouts.startedAt).get();
      const since = last ? new Date(last) : first?.startedAt;
      if (since && now.getTime() - since.getTime() >= everyWeeks * 7 * DAY) {
        reasons.push(`It's been ${everyWeeks} weeks since your last deload.`);
      }
    }
    if (stalled.length >= STALLED_LIFTS_FOR_DELOAD) {
      reasons.push(`${stalled.length} lifts have stalled: ${stalled.map((e) => e.name).join(', ')}.`);
    }
  }
  return { active, until: active ? until : null, everyWeeks, reasons, stalled };
}

/** Starts a 7-day deload: workouts started during it get lighter targets. */
export function startDeloadWeek(db: Database, now = new Date()): void {
  setSetting(db, UNTIL_KEY, new Date(now.getTime() + 7 * DAY).toISOString());
  setSetting(db, LAST_KEY, now.toISOString());
}

export function endDeload(db: Database): void {
  setSetting(db, UNTIL_KEY, null);
}
