import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';

import type { ExerciseSession } from '@/progression/types';

import type { Database } from './types';
import { workoutSets, workouts } from './schema';

/** Finished workouts, newest first. */
export function listWorkouts(db: Database, limit = 50) {
  return db
    .select()
    .from(workouts)
    .where(isNotNull(workouts.finishedAt))
    .orderBy(desc(workouts.startedAt))
    .limit(limit);
}

/** Past sessions of one exercise, oldest first, in the shape the progression engine expects. */
export async function exerciseHistory(db: Database, exerciseId: number): Promise<ExerciseSession[]> {
  const rows = await db
    .select({
      workoutId: workouts.id,
      startedAt: workouts.startedAt,
      weight: workoutSets.weight,
      reps: workoutSets.reps,
      rpe: workoutSets.rpe,
      isWarmup: workoutSets.isWarmup,
    })
    .from(workoutSets)
    .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
    .where(and(eq(workoutSets.exerciseId, exerciseId), isNotNull(workouts.finishedAt)))
    .orderBy(asc(workouts.startedAt), asc(workoutSets.position));

  const sessions = new Map<number, ExerciseSession>();
  for (const row of rows) {
    let session = sessions.get(row.workoutId);
    if (!session) {
      session = { date: row.startedAt.toISOString(), sets: [] };
      sessions.set(row.workoutId, session);
    }
    session.sets.push({
      weight: row.weight,
      reps: row.reps,
      rpe: row.rpe ?? undefined,
      isWarmup: row.isWarmup,
    });
  }
  return [...sessions.values()];
}
