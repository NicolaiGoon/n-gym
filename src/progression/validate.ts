import type { ProgressionRule } from './types';

/** Returns a list of problems with a rule, empty when it is valid. */
export function validateRule(rule: ProgressionRule): string[] {
  const errors: string[] = [];
  const positiveInt = (value: number, label: string) => {
    if (!Number.isInteger(value) || value < 1) errors.push(`${label} must be a whole number of at least 1.`);
  };
  const nonNegative = (value: number, label: string) => {
    if (!Number.isFinite(value) || value < 0) errors.push(`${label} can't be negative.`);
  };
  const fraction = (value: number, label: string) => {
    if (!(value > 0 && value < 1)) errors.push(`${label} must be between 0% and 100%.`);
  };

  nonNegative(rule.increment, 'Increment');

  switch (rule.type) {
    case 'double':
      positiveInt(rule.sets, 'Sets');
      positiveInt(rule.repMin, 'Minimum reps');
      positiveInt(rule.repMax, 'Maximum reps');
      if (rule.repMax < rule.repMin) errors.push('Maximum reps must be at least the minimum.');
      break;
    case 'linear':
      positiveInt(rule.sets, 'Sets');
      positiveInt(rule.reps, 'Reps');
      positiveInt(rule.failuresBeforeDeload, 'Misses before deload');
      fraction(rule.deloadPercent, 'Deload');
      break;
    case 'rpe':
      positiveInt(rule.sets, 'Sets');
      positiveInt(rule.reps, 'Reps');
      if (!(rule.targetRpe >= 1 && rule.targetRpe <= 10)) errors.push('Target RPE must be between 1 and 10.');
      break;
    case 'wave':
      if (!(rule.trainingMax > 0)) errors.push('Training max must be greater than 0.');
      nonNegative(rule.roundTo, 'Rounding');
      break;
    case 'topBackoff':
      positiveInt(rule.repMin, 'Minimum reps');
      positiveInt(rule.repMax, 'Maximum reps');
      if (rule.repMax < rule.repMin) errors.push('Maximum reps must be at least the minimum.');
      if (!Number.isInteger(rule.backoffSets) || rule.backoffSets < 0) errors.push('Back-off sets must be a whole number.');
      fraction(rule.backoffPercent, 'Back-off weight');
      positiveInt(rule.backoffReps, 'Back-off reps');
      nonNegative(rule.roundTo, 'Rounding');
      break;
  }
  return errors;
}

/** A sensible starting rule of each type, used when switching type in the editor. */
export function defaultRule(type: ProgressionRule['type'], increment: number): ProgressionRule {
  switch (type) {
    case 'double':
      return { type, sets: 3, repMin: 8, repMax: 12, increment };
    case 'linear':
      return { type, sets: 3, reps: 5, increment, failuresBeforeDeload: 3, deloadPercent: 0.1 };
    case 'rpe':
      return { type, sets: 3, reps: 5, targetRpe: 8, increment };
    case 'wave':
      return { type, trainingMax: 100, increment: increment * 2, roundTo: increment };
    case 'topBackoff':
      return { type, repMin: 4, repMax: 6, increment, backoffSets: 3, backoffPercent: 0.85, backoffReps: 8, roundTo: increment };
  }
}

/** Short description such as "3×8–12, double progression". */
export function describeRule(rule: ProgressionRule): string {
  switch (rule.type) {
    case 'double':
      return `${rule.sets}×${rule.repMin}–${rule.repMax}, double progression`;
    case 'linear':
      return `${rule.sets}×${rule.reps}, linear`;
    case 'rpe':
      return `${rule.sets}×${rule.reps} @ RPE ${rule.targetRpe}`;
    case 'wave':
      return `5/3/1 waves, training max ${rule.trainingMax}`;
    case 'topBackoff':
      return `Top set ${rule.repMin}–${rule.repMax} + ${rule.backoffSets}×${rule.backoffReps} @ ${Math.round(rule.backoffPercent * 100)}%`;
  }
}
