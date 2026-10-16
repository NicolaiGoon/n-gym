import type { ExerciseSession, LoggedSet } from './types';

/** Estimated one-rep max using the Epley formula. */
export function estimateOneRepMax(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/** Total weight × reps over working sets. */
export function volume(sets: LoggedSet[]): number {
  return sets.filter((s) => !s.isWarmup).reduce((sum, s) => sum + s.weight * s.reps, 0);
}

/** Best estimated 1RM in a session. */
export function bestOneRepMax(session: ExerciseSession): number {
  return Math.max(0, ...session.sets.filter((s) => !s.isWarmup).map((s) => estimateOneRepMax(s.weight, s.reps)));
}
