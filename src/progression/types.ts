/**
 * Progression engine types.
 *
 * Everything in src/progression is plain TypeScript with no React Native
 * imports, so it can be unit tested in Node and reused by the in-app
 * assistant's tools (and a desktop MCP server later).
 */

/** One logged set. Weight is in the user's unit (kg or lb). */
export interface LoggedSet {
  weight: number;
  reps: number;
  /** Rate of perceived exertion, 1–10. Optional. */
  rpe?: number;
  isWarmup?: boolean;
}

/** All working sets of one exercise in one past workout. */
export interface ExerciseSession {
  date: string; // ISO date
  sets: LoggedSet[];
}

/** Double progression: work up a rep range, then add weight and drop back to the bottom. */
export interface DoubleProgressionRule {
  type: 'double';
  sets: number;
  repMin: number;
  repMax: number;
  increment: number;
}

/** Linear progression: fixed sets × reps, add weight every successful session, deload after repeated misses. */
export interface LinearProgressionRule {
  type: 'linear';
  sets: number;
  reps: number;
  increment: number;
  /** Consecutive failed sessions before a deload. */
  failuresBeforeDeload: number;
  /** Fraction to drop on deload, e.g. 0.1 for 10%. */
  deloadPercent: number;
}

/** RPE-based: keep reps fixed and adjust weight so the top set lands on the target RPE. */
export interface RpeProgressionRule {
  type: 'rpe';
  sets: number;
  reps: number;
  targetRpe: number;
  increment: number;
}

export type ProgressionRule = DoubleProgressionRule | LinearProgressionRule | RpeProgressionRule;

/** What the engine recommends for the next session of an exercise. */
export interface Suggestion {
  weight: number;
  sets: number;
  /** Target reps for every working set. */
  reps: number;
  /** Plain-language explanation, shown in the UI and given to the assistant. */
  reason: string;
  kind: 'start' | 'increase' | 'hold' | 'deload' | 'decrease';
}
