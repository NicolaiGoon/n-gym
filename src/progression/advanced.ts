import type { LoggedSet, PlannedSet, Suggestion, TopBackoffRule, WaveProgressionRule } from './types';

export function roundTo(weight: number, step: number): number {
  if (!(step > 0)) return Math.round(weight * 100) / 100;
  return Math.round(Math.round(weight / step) * step * 100) / 100;
}

const WAVE_WEEKS: { name: string; percents: number[]; reps: number[]; amrap: boolean }[] = [
  { name: '5s week', percents: [0.65, 0.75, 0.85], reps: [5, 5, 5], amrap: true },
  { name: '3s week', percents: [0.7, 0.8, 0.9], reps: [3, 3, 3], amrap: true },
  { name: '5/3/1 week', percents: [0.75, 0.85, 0.95], reps: [5, 3, 1], amrap: true },
  { name: 'deload week', percents: [0.4, 0.5, 0.6], reps: [5, 5, 5], amrap: false },
];

/** Week and cycle come from how many sessions of the exercise have been done. */
export function waveProgression(rule: WaveProgressionRule, sessionCount: number): Suggestion {
  const weekIndex = sessionCount % WAVE_WEEKS.length;
  const cycle = Math.floor(sessionCount / WAVE_WEEKS.length);
  const trainingMax = rule.trainingMax + cycle * rule.increment;
  const week = WAVE_WEEKS[weekIndex];
  const plan: PlannedSet[] = week.percents.map((p, i) => ({
    weight: roundTo(trainingMax * p, rule.roundTo),
    reps: week.reps[i],
    ...(week.amrap && i === week.percents.length - 1 ? { amrap: true } : {}),
  }));
  const top = plan[plan.length - 1];
  const kind = weekIndex === 3 ? 'deload' : sessionCount === 0 ? 'start' : weekIndex === 0 ? 'increase' : 'hold';
  const amrapNote = week.amrap ? ' Last set: as many reps as you can.' : '';
  return {
    weight: top.weight,
    sets: plan.length,
    reps: top.reps,
    plan,
    kind,
    reason:
      `Cycle ${cycle + 1}, ${week.name} from a training max of ${trainingMax}.` +
      (kind === 'increase' ? ` Training max went up by ${rule.increment}.` : '') +
      amrapNote,
  };
}

function backoffPlan(rule: TopBackoffRule, topWeight: number, topReps: number): PlannedSet[] {
  const backoff = roundTo(topWeight * rule.backoffPercent, rule.roundTo);
  return [
    { weight: topWeight, reps: topReps, label: 'top' },
    ...Array.from({ length: rule.backoffSets }, () => ({ weight: backoff, reps: rule.backoffReps, label: 'backoff' as const })),
  ];
}

/** Progresses the top set like double progression; back-off sets follow it. */
export function topBackoffProgression(rule: TopBackoffRule, last: LoggedSet[] | undefined, startWeight: number): Suggestion {
  const make = (weight: number, reps: number, kind: Suggestion['kind'], reason: string): Suggestion => {
    const plan = backoffPlan(rule, weight, reps);
    return { weight, reps, sets: plan.length, plan, kind, reason };
  };
  if (!last || last.length === 0) {
    return make(startWeight, rule.repMin, 'start', `First session: one top set of ${rule.repMin}–${rule.repMax}, then ${rule.backoffSets} back-off sets.`);
  }
  const topWeight = Math.max(...last.map((s) => s.weight));
  const topReps = Math.max(...last.filter((s) => s.weight === topWeight).map((s) => s.reps));
  if (topReps >= rule.repMax) {
    const next = roundTo(topWeight + rule.increment, rule.roundTo);
    return make(next, rule.repMin, 'increase', `Top set hit ${topReps} reps at ${topWeight}. Add ${rule.increment} and restart at ${rule.repMin}.`);
  }
  const target = Math.min(Math.max(topReps + 1, rule.repMin), rule.repMax);
  return make(topWeight, target, 'hold', `Stay at ${topWeight} for the top set and aim for ${target} reps.`);
}

/**
 * Applies a deload to a suggestion: 90% of the weight and half the sets.
 */
export function applyDeload(suggestion: Suggestion, step: number): Suggestion {
  if (suggestion.kind === 'deload') return suggestion;
  const sets = Math.max(1, Math.ceil(suggestion.sets / 2));
  const plan = suggestion.plan
    ?.slice(0, sets)
    .map(({ amrap: _amrap, ...set }) => ({ ...set, weight: roundTo(set.weight * 0.9, step) }));
  return {
    ...suggestion,
    weight: roundTo(suggestion.weight * 0.9, step),
    sets,
    plan,
    kind: 'deload',
    reason: `Deload week: 90% of the planned weight and half the sets. (Planned: ${suggestion.sets}×${suggestion.reps} @ ${suggestion.weight}.)`,
  };
}
