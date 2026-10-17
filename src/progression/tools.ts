import { estimateOneRepMax } from './stats';
import { roundTo } from './advanced';
import type { ExerciseSession } from './types';

export type Unit = 'kg' | 'lb';

export const BAR_WEIGHT: Record<Unit, number> = { kg: 20, lb: 45 };
export const PLATES: Record<Unit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

export interface PlateBreakdown {
  /** Plates for one side, heaviest first. */
  perSide: number[];
  /** Weight that can't be made with the plates (0 when exact). */
  remainder: number;
}

/** Plates per side to load `total` on a bar. Returns null when the weight is at or below the bar. */
export function plateBreakdown(total: number, unit: Unit, bar = BAR_WEIGHT[unit]): PlateBreakdown | null {
  if (!(total > bar)) return null;
  let side = Math.round(((total - bar) / 2) * 1000) / 1000;
  const perSide: number[] = [];
  for (const plate of PLATES[unit]) {
    while (side + 1e-9 >= plate) {
      perSide.push(plate);
      side = Math.round((side - plate) * 1000) / 1000;
    }
  }
  return { perSide, remainder: Math.round(side * 2 * 100) / 100 };
}

/**
 * Warm-up sets up to a working weight: the empty bar, then about 40%, 60% and 80%.
 * Steps that round to the bar or repeat an earlier weight are dropped.
 */
export function warmupSets(working: number, unit: Unit, step: number, bar = BAR_WEIGHT[unit]): { weight: number; reps: number }[] {
  if (!(working > bar)) return [];
  const sets = [{ weight: bar, reps: 10 }];
  for (const [fraction, reps] of [
    [0.4, 5],
    [0.6, 3],
    [0.8, 1],
  ] as const) {
    const weight = roundTo(working * fraction, step);
    if (weight > sets[sets.length - 1].weight && weight < working) sets.push({ weight, reps });
  }
  return sets;
}

/**
 * True when the best estimated 1RM of the last `window` sessions is no better than
 * the best before them. Needs at least `window + 1` sessions.
 */
export function isStalled(history: ExerciseSession[], window = 3): boolean {
  if (history.length < window + 1) return false;
  const best = (sessions: ExerciseSession[]) =>
    Math.max(0, ...sessions.flatMap((s) => s.sets.filter((x) => !x.isWarmup).map((x) => estimateOneRepMax(x.weight, x.reps))));
  const before = best(history.slice(0, -window));
  const recent = best(history.slice(-window));
  return before > 0 && recent <= before;
}
