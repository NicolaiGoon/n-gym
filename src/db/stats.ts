import { and, asc, desc, eq, gte, isNotNull, lt } from 'drizzle-orm';

import { estimateOneRepMax } from '@/progression';

import { bodyMeasurements, exercises, routineDays, workouts, workoutSets } from './schema';
import type { Database } from './types';

/**
 * Read-only statistics. Kept free of React Native so it is tested in Node and can back the
 * coach's stats tools later.
 */

export interface SessionPoint {
  workoutId: number;
  date: Date;
  bestOneRepMax: number;
  topWeight: number;
  /** The set behind bestOneRepMax. */
  bestSet: { weight: number; reps: number };
  volume: number;
  workingSets: number;
  sets: { weight: number; reps: number; rpe: number | null; isWarmup: boolean }[];
}

/** Every finished session of an exercise, oldest first, with its working-set metrics. */
export function exerciseSessions(db: Database, exerciseId: number): SessionPoint[] {
  const rows = db
    .select({
      workoutId: workouts.id,
      date: workouts.startedAt,
      weight: workoutSets.weight,
      reps: workoutSets.reps,
      rpe: workoutSets.rpe,
      isWarmup: workoutSets.isWarmup,
    })
    .from(workoutSets)
    .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
    .where(and(eq(workoutSets.exerciseId, exerciseId), isNotNull(workouts.finishedAt)))
    .orderBy(asc(workouts.startedAt), asc(workoutSets.position))
    .all();

  const sessions = new Map<number, SessionPoint>();
  for (const row of rows) {
    let session = sessions.get(row.workoutId);
    if (!session) {
      session = {
        workoutId: row.workoutId,
        date: row.date,
        bestOneRepMax: 0,
        topWeight: 0,
        bestSet: { weight: 0, reps: 0 },
        volume: 0,
        workingSets: 0,
        sets: [],
      };
      sessions.set(row.workoutId, session);
    }
    session.sets.push({ weight: row.weight, reps: row.reps, rpe: row.rpe, isWarmup: row.isWarmup });
    if (row.isWarmup) continue;
    session.workingSets++;
    const oneRepMax = estimateOneRepMax(row.weight, row.reps);
    // Ties (e.g. bodyweight sets, where the estimate is 0) go to the set with more reps.
    if (oneRepMax > session.bestOneRepMax || (oneRepMax === session.bestOneRepMax && row.reps > session.bestSet.reps)) {
      session.bestOneRepMax = oneRepMax;
      session.bestSet = { weight: row.weight, reps: row.reps };
    }
    session.topWeight = Math.max(session.topWeight, row.weight);
    session.volume += row.weight * row.reps;
  }
  // Sessions with only warm-up sets carry no working data.
  return [...sessions.values()].filter((s) => s.workingSets > 0);
}

export interface ExerciseRecords {
  bestOneRepMax: { value: number; weight: number; reps: number; date: Date } | null;
  heaviest: { weight: number; reps: number; date: Date } | null;
  bestVolume: { value: number; date: Date } | null;
  sessionCount: number;
}

export function exerciseRecords(sessions: SessionPoint[]): ExerciseRecords {
  const records: ExerciseRecords = { bestOneRepMax: null, heaviest: null, bestVolume: null, sessionCount: sessions.length };
  for (const s of sessions) {
    if (!records.bestOneRepMax || s.bestOneRepMax > records.bestOneRepMax.value) {
      records.bestOneRepMax = { value: s.bestOneRepMax, ...s.bestSet, date: s.date };
    }
    const heaviestSet = s.sets
      .filter((set) => !set.isWarmup && set.weight === s.topWeight)
      .reduce((best, set) => (set.reps > best.reps ? set : best), { weight: s.topWeight, reps: 0 });
    if (!records.heaviest || s.topWeight > records.heaviest.weight) {
      records.heaviest = { weight: s.topWeight, reps: heaviestSet.reps, date: s.date };
    }
    if (!records.bestVolume || s.volume > records.bestVolume.value) {
      records.bestVolume = { value: s.volume, date: s.date };
    }
  }
  return records;
}

/** Monday 00:00 local time of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d;
}

export interface WeekPoint {
  weekStart: Date;
  workouts: number;
  volume: number;
}

/** Workouts and volume per week for the last `weeks` weeks, oldest first, including empty weeks. */
export function weeklyTotals(db: Database, weeks: number, now = new Date()): WeekPoint[] {
  const thisWeek = startOfWeek(now);
  const first = new Date(thisWeek);
  first.setDate(first.getDate() - 7 * (weeks - 1));

  const points: WeekPoint[] = [];
  for (let i = 0; i < weeks; i++) {
    const weekStart = new Date(first);
    weekStart.setDate(first.getDate() + 7 * i);
    points.push({ weekStart, workouts: 0, volume: 0 });
  }
  const indexOf = (date: Date) => Math.round((startOfWeek(date).getTime() - first.getTime()) / (7 * 24 * 3600 * 1000));

  const done = db
    .select({ id: workouts.id, startedAt: workouts.startedAt })
    .from(workouts)
    .where(and(isNotNull(workouts.finishedAt), gte(workouts.startedAt, first)))
    .all();
  for (const w of done) {
    const point = points[indexOf(w.startedAt)];
    if (point) point.workouts++;
  }

  const sets = db
    .select({ startedAt: workouts.startedAt, weight: workoutSets.weight, reps: workoutSets.reps })
    .from(workoutSets)
    .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
    .where(and(isNotNull(workouts.finishedAt), gte(workouts.startedAt, first), eq(workoutSets.isWarmup, false)))
    .all();
  for (const s of sets) {
    const point = points[indexOf(s.startedAt)];
    if (point) point.volume += s.weight * s.reps;
  }
  return points;
}

/** Consecutive weeks, ending this week or last week, with at least one workout. */
export function weekStreak(db: Database, now = new Date()): number {
  const points = weeklyTotals(db, 520, now);
  let i = points.length - 1;
  // The current week doesn't break the streak until it is over.
  if (points[i].workouts === 0) i--;
  let streak = 0;
  for (; i >= 0 && points[i].workouts > 0; i--) streak++;
  return streak;
}

/** Working sets per muscle group in the 7 days up to `now`, most first. */
export function setsPerMuscleGroup(db: Database, now = new Date()): { muscleGroup: string; sets: number }[] {
  const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const rows = db
    .select({ muscleGroup: exercises.muscleGroup })
    .from(workoutSets)
    .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
    .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
    .where(
      and(
        isNotNull(workouts.finishedAt),
        gte(workouts.startedAt, since),
        lt(workouts.startedAt, now),
        eq(workoutSets.isWarmup, false),
      ),
    )
    .all();
  const counts = new Map<string, number>();
  for (const { muscleGroup } of rows) counts.set(muscleGroup, (counts.get(muscleGroup) ?? 0) + 1);
  return [...counts.entries()].map(([muscleGroup, sets]) => ({ muscleGroup, sets })).sort((a, b) => b.sets - a.sets);
}

export interface HistoryRow {
  id: number;
  startedAt: Date;
  finishedAt: Date | null;
  dayName: string | null;
  notes: string | null;
  exerciseCount: number;
  setCount: number;
  volume: number;
}

/** Finished workouts, newest first, with totals for the list. */
export function historyList(db: Database, limit = 200): HistoryRow[] {
  const list = db
    .select({
      id: workouts.id,
      startedAt: workouts.startedAt,
      finishedAt: workouts.finishedAt,
      dayName: routineDays.name,
      notes: workouts.notes,
    })
    .from(workouts)
    .leftJoin(routineDays, eq(workouts.dayId, routineDays.id))
    .where(isNotNull(workouts.finishedAt))
    .orderBy(desc(workouts.startedAt))
    .limit(limit)
    .all();
  if (list.length === 0) return [];

  const oldest = list[list.length - 1].startedAt;
  const sets = db
    .select({
      workoutId: workoutSets.workoutId,
      workoutExerciseId: workoutSets.workoutExerciseId,
      weight: workoutSets.weight,
      reps: workoutSets.reps,
      isWarmup: workoutSets.isWarmup,
    })
    .from(workoutSets)
    .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
    .where(gte(workouts.startedAt, oldest))
    .all();

  return list.map((w) => {
    const own = sets.filter((s) => s.workoutId === w.id);
    const working = own.filter((s) => !s.isWarmup);
    return {
      ...w,
      exerciseCount: new Set(own.map((s) => s.workoutExerciseId)).size,
      setCount: working.length,
      volume: working.reduce((sum, s) => sum + s.weight * s.reps, 0),
    };
  });
}

/** Days (local yyyy-mm-dd) in a month that have a finished workout, mapped to the workout ids. */
export function workoutDaysInMonth(db: Database, year: number, month: number): Map<string, number[]> {
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 1);
  const rows = db
    .select({ id: workouts.id, startedAt: workouts.startedAt })
    .from(workouts)
    .where(and(isNotNull(workouts.finishedAt), gte(workouts.startedAt, from), lt(workouts.startedAt, to)))
    .orderBy(asc(workouts.startedAt))
    .all();
  const days = new Map<string, number[]>();
  for (const row of rows) {
    const key = dayKey(row.startedAt);
    days.set(key, [...(days.get(key) ?? []), row.id]);
  }
  return days;
}

export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Recorded body weights, oldest first. */
export function bodyWeights(db: Database): { date: Date; value: number }[] {
  return db
    .select({ date: bodyMeasurements.measuredAt, value: bodyMeasurements.weight })
    .from(bodyMeasurements)
    .where(isNotNull(bodyMeasurements.weight))
    .orderBy(asc(bodyMeasurements.measuredAt))
    .all()
    .map((r) => ({ date: r.date, value: r.value! }));
}
