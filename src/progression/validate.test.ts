import { describe, expect, it } from 'vitest';

import { defaultRule, describeRule, validateRule } from './validate';

describe('validateRule', () => {
  it('accepts every default rule', () => {
    for (const type of ['double', 'linear', 'rpe'] as const) {
      expect(validateRule(defaultRule(type, 2.5))).toEqual([]);
    }
  });

  it('reports bad numbers', () => {
    expect(validateRule({ type: 'double', sets: 0, repMin: 8, repMax: 6, increment: -1 })).toHaveLength(3);
    expect(validateRule({ type: 'rpe', sets: 3, reps: 5, targetRpe: 11, increment: 2.5 })).toEqual([
      'Target RPE must be between 1 and 10.',
    ]);
    expect(
      validateRule({ type: 'linear', sets: 3, reps: 5, increment: 2.5, failuresBeforeDeload: 3, deloadPercent: 1 }),
    ).toEqual(['Deload must be between 0% and 100%.']);
  });
});

describe('describeRule', () => {
  it('summarises each type', () => {
    expect(describeRule(defaultRule('double', 2.5))).toBe('3×8–12, double progression');
    expect(describeRule(defaultRule('linear', 2.5))).toBe('3×5, linear');
    expect(describeRule(defaultRule('rpe', 2.5))).toBe('3×5 @ RPE 8');
  });
});
