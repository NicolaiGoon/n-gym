import { describe, expect, it } from 'vitest';

import { applyDeload, roundTo } from './advanced';
import { suggestNext } from './engine';
import { isStalled, plateBreakdown, warmupSets } from './tools';
import type { ExerciseSession, ProgressionRule } from './types';

const session = (sets: [number, number][]): ExerciseSession => ({
  date: '2026-10-01',
  sets: sets.map(([weight, reps]) => ({ weight, reps })),
});

describe('5/3/1 waves', () => {
  const rule: ProgressionRule = { type: 'wave', trainingMax: 100, increment: 5, roundTo: 2.5 };
  const after = (n: number) => suggestNext(rule, Array.from({ length: n }, () => session([[80, 5]])));

  it('walks the four weeks of a cycle', () => {
    expect(after(0).plan).toEqual([
      { weight: 65, reps: 5 },
      { weight: 75, reps: 5 },
      { weight: 85, reps: 5, amrap: true },
    ]);
    expect(after(0).kind).toBe('start');
    expect(after(1).plan?.map((s) => [s.weight, s.reps])).toEqual([[70, 3], [80, 3], [90, 3]]);
    expect(after(2).plan?.map((s) => [s.weight, s.reps])).toEqual([[75, 5], [85, 3], [95, 1]]);
    expect(after(3)).toMatchObject({ kind: 'deload', weight: 60 });
    expect(after(3).plan?.some((s) => s.amrap)).toBe(false);
  });

  it('raises the training max each cycle', () => {
    const next = after(4);
    expect(next.kind).toBe('increase');
    expect(next.plan?.map((s) => s.weight)).toEqual([67.5, 80, 90]); // TM 105, rounded to 2.5
    expect(next.reason).toContain('training max of 105');
  });
});

describe('top set + back-off', () => {
  const rule: ProgressionRule = {
    type: 'topBackoff',
    repMin: 4,
    repMax: 6,
    increment: 2.5,
    backoffSets: 2,
    backoffPercent: 0.85,
    backoffReps: 8,
    roundTo: 2.5,
  };

  it('starts at the starting weight', () => {
    expect(suggestNext(rule, [], 100).plan).toEqual([
      { weight: 100, reps: 4, label: 'top' },
      { weight: 85, reps: 8, label: 'backoff' },
      { weight: 85, reps: 8, label: 'backoff' },
    ]);
  });

  it('adds reps to the top set, then weight', () => {
    const hold = suggestNext(rule, [session([[100, 5], [85, 8], [85, 8]])]);
    expect(hold).toMatchObject({ kind: 'hold', weight: 100, reps: 6 });
    const up = suggestNext(rule, [session([[100, 6], [85, 8], [85, 7]])]);
    expect(up).toMatchObject({ kind: 'increase', weight: 102.5, reps: 4, sets: 3 });
    expect(up.plan?.[1].weight).toBe(87.5);
  });
});

describe('deload', () => {
  it('takes 90% and half the sets', () => {
    const deloaded = applyDeload({ weight: 100, sets: 5, reps: 5, kind: 'increase', reason: '' }, 2.5);
    expect(deloaded).toMatchObject({ weight: 90, sets: 3, kind: 'deload' });
  });

  it('trims plans and drops AMRAP', () => {
    const plan = [
      { weight: 65, reps: 5 },
      { weight: 75, reps: 5 },
      { weight: 85, reps: 5, amrap: true },
    ];
    const deloaded = applyDeload({ weight: 85, sets: 3, reps: 5, plan, kind: 'hold', reason: '' }, 2.5);
    expect(deloaded.plan).toEqual([
      { weight: 57.5, reps: 5 },
      { weight: 67.5, reps: 5 },
    ]);
  });

  it('leaves a deload alone', () => {
    const s = { weight: 60, sets: 3, reps: 5, kind: 'deload' as const, reason: 'x' };
    expect(applyDeload(s, 2.5)).toBe(s);
  });
});

describe('tools', () => {
  it('rounds to a step', () => {
    expect(roundTo(83.7, 2.5)).toBe(82.5);
    expect(roundTo(84, 2.5)).toBe(85);
    expect(roundTo(41.3, 0)).toBe(41.3);
  });

  it('breaks a weight into plates per side', () => {
    expect(plateBreakdown(102.5, 'kg')).toEqual({ perSide: [25, 15, 1.25], remainder: 0 });
    expect(plateBreakdown(61, 'kg')).toEqual({ perSide: [20], remainder: 1 });
    expect(plateBreakdown(225, 'lb')).toEqual({ perSide: [45, 45], remainder: 0 });
    expect(plateBreakdown(20, 'kg')).toBeNull();
  });

  it('builds warm-ups up to the working weight', () => {
    expect(warmupSets(100, 'kg', 2.5)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 40, reps: 5 },
      { weight: 60, reps: 3 },
      { weight: 80, reps: 1 },
    ]);
    expect(warmupSets(40, 'kg', 2.5)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 25, reps: 3 },
      { weight: 32.5, reps: 1 },
    ]);
    expect(warmupSets(20, 'kg', 2.5)).toEqual([]);
  });

  it('detects a stall when the last three sessions are no better', () => {
    const progressing = [session([[100, 5]]), session([[100, 5]]), session([[102.5, 5]]), session([[105, 5]])];
    expect(isStalled(progressing)).toBe(false);
    const stuck = [session([[105, 5]]), session([[105, 4]]), session([[105, 5]]), session([[100, 5]])];
    expect(isStalled(stuck)).toBe(true);
    expect(isStalled(stuck.slice(1))).toBe(false); // not enough sessions
  });
});
