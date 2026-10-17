import { topBackoffProgression, waveProgression } from './advanced';
import type {
  DoubleProgressionRule,
  ExerciseSession,
  LinearProgressionRule,
  LoggedSet,
  ProgressionRule,
  RpeProgressionRule,
  Suggestion,
} from './types';

/**
 * Suggests the next session for one exercise.
 *
 * @param history past sessions of this exercise, oldest first
 * @param startWeight weight to use when there is no history yet
 */
export function suggestNext(
  rule: ProgressionRule,
  history: ExerciseSession[],
  startWeight = 0,
): Suggestion {
  const sessions = history.map(workingSets).filter((sets) => sets.length > 0);
  switch (rule.type) {
    case 'double':
      return doubleProgression(rule, sessions, startWeight);
    case 'linear':
      return linearProgression(rule, sessions, startWeight);
    case 'rpe':
      return rpeProgression(rule, sessions, startWeight);
    case 'wave':
      return waveProgression(rule, sessions.length);
    case 'topBackoff':
      return topBackoffProgression(rule, sessions.at(-1), startWeight);
  }
}

function workingSets(session: ExerciseSession): LoggedSet[] {
  return session.sets.filter((s) => !s.isWarmup);
}

/** The heaviest weight used across the working sets of a session. */
function topWeight(sets: LoggedSet[]): number {
  return Math.max(...sets.map((s) => s.weight));
}

/** Sets done at the session's top weight; lighter back-off sets don't count toward progression. */
function topSets(sets: LoggedSet[]): LoggedSet[] {
  const top = topWeight(sets);
  return sets.filter((s) => s.weight === top);
}

function round(weight: number): number {
  return Math.round(weight * 100) / 100;
}

function doubleProgression(
  rule: DoubleProgressionRule,
  sessions: LoggedSet[][],
  startWeight: number,
): Suggestion {
  const last = sessions.at(-1);
  if (!last) {
    return {
      weight: startWeight,
      sets: rule.sets,
      reps: rule.repMin,
      kind: 'start',
      reason: `First session: ${rule.sets}×${rule.repMin} and work up to ${rule.repMax} reps.`,
    };
  }

  const weight = topWeight(last);
  const sets = topSets(last);
  const completedAllSets = sets.length >= rule.sets;
  const lowestReps = Math.min(...sets.map((s) => s.reps));

  if (completedAllSets && lowestReps >= rule.repMax) {
    return {
      weight: round(weight + rule.increment),
      sets: rule.sets,
      reps: rule.repMin,
      kind: 'increase',
      reason: `Hit ${rule.repMax} reps on every set at ${weight}. Add ${rule.increment} and restart at ${rule.repMin} reps.`,
    };
  }

  const target = Math.min(Math.max(lowestReps + 1, rule.repMin), rule.repMax);
  return {
    weight,
    sets: rule.sets,
    reps: target,
    kind: 'hold',
    reason: `Stay at ${weight} and aim for ${target} reps on every set (top of range is ${rule.repMax}).`,
  };
}

function hitTarget(sets: LoggedSet[], setCount: number, reps: number): boolean {
  const top = topSets(sets);
  return top.length >= setCount && top.every((s) => s.reps >= reps);
}

function linearProgression(
  rule: LinearProgressionRule,
  sessions: LoggedSet[][],
  startWeight: number,
): Suggestion {
  const last = sessions.at(-1);
  if (!last) {
    return {
      weight: startWeight,
      sets: rule.sets,
      reps: rule.reps,
      kind: 'start',
      reason: `First session: ${rule.sets}×${rule.reps}.`,
    };
  }

  const weight = topWeight(last);
  if (hitTarget(last, rule.sets, rule.reps)) {
    return {
      weight: round(weight + rule.increment),
      sets: rule.sets,
      reps: rule.reps,
      kind: 'increase',
      reason: `Completed ${rule.sets}×${rule.reps} at ${weight}. Add ${rule.increment}.`,
    };
  }

  // Count consecutive misses at this same weight, most recent first.
  let failures = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const sets = sessions[i];
    if (topWeight(sets) !== weight || hitTarget(sets, rule.sets, rule.reps)) break;
    failures++;
  }

  if (failures >= rule.failuresBeforeDeload) {
    const deloaded = round(weight * (1 - rule.deloadPercent));
    return {
      weight: deloaded,
      sets: rule.sets,
      reps: rule.reps,
      kind: 'deload',
      reason: `Missed ${rule.sets}×${rule.reps} at ${weight} ${failures} times in a row. Deload ${Math.round(rule.deloadPercent * 100)}% to ${deloaded}.`,
    };
  }

  return {
    weight,
    sets: rule.sets,
    reps: rule.reps,
    kind: 'hold',
    reason: `Missed ${rule.sets}×${rule.reps} at ${weight}. Repeat it (${failures} of ${rule.failuresBeforeDeload} misses before a deload).`,
  };
}

function rpeProgression(
  rule: RpeProgressionRule,
  sessions: LoggedSet[][],
  startWeight: number,
): Suggestion {
  const last = sessions.at(-1);
  if (!last) {
    return {
      weight: startWeight,
      sets: rule.sets,
      reps: rule.reps,
      kind: 'start',
      reason: `First session: ${rule.sets}×${rule.reps} at about RPE ${rule.targetRpe}.`,
    };
  }

  const weight = topWeight(last);
  const rated = topSets(last).filter((s) => s.rpe !== undefined);
  if (rated.length === 0) {
    return {
      weight,
      sets: rule.sets,
      reps: rule.reps,
      kind: 'hold',
      reason: `No RPE logged last time, so stay at ${weight}. Log RPE to get adjustments.`,
    };
  }

  const rpe = Math.max(...rated.map((s) => s.rpe!));
  const diff = rule.targetRpe - rpe;
  if (Math.abs(diff) < 0.5) {
    return {
      weight,
      sets: rule.sets,
      reps: rule.reps,
      kind: 'hold',
      reason: `Top set was RPE ${rpe}, right on target. Stay at ${weight}.`,
    };
  }

  // One increment per full RPE point away from target.
  const steps = Math.trunc(diff) || Math.sign(diff);
  const next = round(Math.max(0, weight + steps * rule.increment));
  return {
    weight: next,
    sets: rule.sets,
    reps: rule.reps,
    kind: steps > 0 ? 'increase' : 'decrease',
    reason: `Top set was RPE ${rpe} against a target of ${rule.targetRpe}. Move to ${next}.`,
  };
}
