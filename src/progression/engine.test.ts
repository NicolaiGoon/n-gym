import { describe, expect, it } from 'vitest';

import { suggestNext } from './engine';
import { estimateOneRepMax, volume } from './stats';
import type { ExerciseSession, LoggedSet, ProgressionRule } from './types';

const session = (sets: LoggedSet[], date = '2026-10-01'): ExerciseSession => ({ date, sets });
const sets = (weight: number, ...reps: number[]): LoggedSet[] => reps.map((r) => ({ weight, reps: r }));

describe('double progression', () => {
  const rule: ProgressionRule = { type: 'double', sets: 3, repMin: 8, repMax: 12, increment: 2.5 };

  it('starts at the bottom of the range', () => {
    expect(suggestNext(rule, [], 40)).toMatchObject({ weight: 40, reps: 8, kind: 'start' });
  });

  it('adds weight once every set reaches the top of the range', () => {
    const next = suggestNext(rule, [session(sets(40, 12, 12, 12))]);
    expect(next).toMatchObject({ weight: 42.5, reps: 8, kind: 'increase' });
  });

  it('holds weight and asks for one more rep on the weakest set', () => {
    const next = suggestNext(rule, [session(sets(40, 12, 10, 9))]);
    expect(next).toMatchObject({ weight: 40, reps: 10, kind: 'hold' });
  });

  it('ignores warm-up sets', () => {
    const next = suggestNext(rule, [
      session([{ weight: 20, reps: 5, isWarmup: true }, ...sets(40, 12, 12, 12)]),
    ]);
    expect(next.kind).toBe('increase');
  });

  it('does not progress when fewer sets than prescribed were done', () => {
    const next = suggestNext(rule, [session(sets(40, 12, 12))]);
    expect(next.kind).toBe('hold');
  });
});

describe('linear progression', () => {
  const rule: ProgressionRule = {
    type: 'linear',
    sets: 3,
    reps: 5,
    increment: 2.5,
    failuresBeforeDeload: 3,
    deloadPercent: 0.1,
  };

  it('adds weight after a successful session', () => {
    expect(suggestNext(rule, [session(sets(100, 5, 5, 5))])).toMatchObject({ weight: 102.5, kind: 'increase' });
  });

  it('repeats the weight after a miss', () => {
    expect(suggestNext(rule, [session(sets(100, 5, 5, 3))])).toMatchObject({ weight: 100, kind: 'hold' });
  });

  it('deloads after three misses in a row at the same weight', () => {
    const history = [session(sets(100, 5, 4, 3)), session(sets(100, 5, 5, 4)), session(sets(100, 5, 3, 3))];
    expect(suggestNext(rule, history)).toMatchObject({ weight: 90, kind: 'deload' });
  });

  it('only counts misses at the current weight', () => {
    const history = [session(sets(97.5, 5, 4, 3)), session(sets(97.5, 5, 5, 5)), session(sets(100, 5, 5, 3))];
    expect(suggestNext(rule, history).kind).toBe('hold');
  });
});

describe('RPE progression', () => {
  const rule: ProgressionRule = { type: 'rpe', sets: 3, reps: 5, targetRpe: 8, increment: 2.5 };
  const rated = (rpe: number) => session([{ weight: 100, reps: 5, rpe }]);

  it('holds when on target', () => {
    expect(suggestNext(rule, [rated(8)])).toMatchObject({ weight: 100, kind: 'hold' });
  });

  it('adds weight when the set felt easy', () => {
    expect(suggestNext(rule, [rated(6)])).toMatchObject({ weight: 105, kind: 'increase' });
  });

  it('drops weight when the set was too hard', () => {
    expect(suggestNext(rule, [rated(9)])).toMatchObject({ weight: 97.5, kind: 'decrease' });
  });

  it('holds when no RPE was logged', () => {
    expect(suggestNext(rule, [session(sets(100, 5))]).kind).toBe('hold');
  });
});

describe('stats', () => {
  it('estimates 1RM with Epley', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 5)).toBe(116.7);
  });

  it('sums volume over working sets only', () => {
    expect(volume([{ weight: 20, reps: 10, isWarmup: true }, ...sets(50, 10, 8)])).toBe(900);
  });
});
