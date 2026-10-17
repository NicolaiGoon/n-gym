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

/**
 * 5/3/1-style waves from a training max: three working weeks (5s, 3s, 5/3/1) and a deload week.
 * The training max goes up by `increment` after each four-week cycle.
 */
export interface WaveProgressionRule {
  type: 'wave';
  trainingMax: number;
  increment: number;
  /** Weights are rounded to a multiple of this. */
  roundTo: number;
}

/** One heavy top set worked up a rep range, followed by lighter back-off sets at a percentage of it. */
export interface TopBackoffRule {
  type: 'topBackoff';
  repMin: number;
  repMax: number;
  increment: number;
  backoffSets: number;
  /** Back-off weight as a fraction of the top set, e.g. 0.85. */
  backoffPercent: number;
  backoffReps: number;
  roundTo: number;
}

export type ProgressionRule =
  | DoubleProgressionRule
  | LinearProgressionRule
  | RpeProgressionRule
  | WaveProgressionRule
  | TopBackoffRule;

/** A prescribed set when sets differ from each other (waves, top + back-off). */
export interface PlannedSet {
  weight: number;
  reps: number;
  /** As many reps as possible; `reps` is the minimum. */
  amrap?: boolean;
  label?: 'top' | 'backoff';
}

/** What the engine recommends for the next session of an exercise. */
export interface Suggestion {
  /** The heaviest prescribed weight. */
  weight: number;
  sets: number;
  /** Target reps for every working set (for the top set when there is a plan). */
  reps: number;
  /** Set-by-set prescription when sets differ; absent when every set is `weight × reps`. */
  plan?: PlannedSet[];
  /** Plain-language explanation, shown in the UI and given to the assistant. */
  reason: string;
  kind: 'start' | 'increase' | 'hold' | 'deload' | 'decrease';
}
