/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';

import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { exerciseHistory } from '@/db/queries';
import { exercisesQuery } from '@/db/repo/exercises';
import { routinesQuery, slotsQuery, daysQuery } from '@/db/repo/routines';
import { updateSettings } from '@/db/repo/settings';
import { suggestFor } from '@/db/repo/workouts';
import { bodyMeasurements, exercises, workouts } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import { historyList } from '@/db/stats';
import { createTestDb } from '@/db/test-db';
import type { Database } from '@/db/types';

import { JEFIT_FIXTURE } from './fixture';
import { applyImport, jefitExercises, previewImport, type ExerciseChoice } from './import';
import { csvRows, parseJefitExport, parseLogs } from './parse';

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
  await seedIfEmpty(db);
});

const defaults = (rows: ReturnType<typeof jefitExercises>) => Object.fromEntries(rows.map((r) => [r.key, r.choice]));
const exerciseId = (name: string) => exercisesQuery(db, { query: name }).all().find((e) => e.name === name)!.id;

describe('parsing', () => {
  it('reads quoted CSV with commas, escaped quotes and blank lines', () => {
    expect(csvRows('a,"b, c","say ""hi"""\n\nx,\n')).toEqual([['a', 'b, c', 'say "hi"'], [], ['x', '']]);
  });

  it('reads set logs, dropping cardio entries and trailing commas', () => {
    expect(parseLogs('60x10,60x8,')).toEqual([
      { weight: 60, reps: 10 },
      { weight: 60, reps: 8 },
    ]);
    expect(parseLogs('0x12')).toEqual([{ weight: 0, reps: 12 }]);
    expect(parseLogs('0x0.0,0x10')).toEqual([]);
    expect(parseLogs('20x0')).toEqual([]);
  });

  it('reads every section of the export', () => {
    const data = parseJefitExport(JEFIT_FIXTURE);
    expect(data.massUnit).toBe('kg');
    // The cardio-style treadmill row and the empty log are dropped.
    expect(data.logs.map((l) => l.id)).toEqual([1, 2, 3, 4, 6]);
    expect(data.sessions.size).toBe(3);
    expect(data.routines).toEqual([{ id: 7, name: 'Upper, Lower', description: 'Four days, heavy' }]);
    expect(data.days.map((d) => d.name)).toEqual(['Lower', 'Upper']);
    expect(data.routineExercises.map((e) => [e.key, e.targetReps])).toEqual([
      ['1:12', [5, 5, 5, 5]],
      ['1:3', [12, 10, 8]],
      ['0:1', [8, 8, 8]],
    ]);
    expect(data.measurements).toHaveLength(2);
    expect(data.notes).toEqual([{ key: '1:12', date: '2024-01-12', text: 'στη μπάρα, χαμηλά' }]);
  });

  it('refuses a file that is not a Jefit export', () => {
    expect(() => parseJefitExport('hello')).toThrow('Jefit export');
  });
});

describe('matching exercises', () => {
  it('uses the latest name per Jefit id and matches the library by name', () => {
    const rows = jefitExercises(db, parseJefitExport(JEFIT_FIXTURE));
    const bench = rows.find((r) => r.key === '1:3')!;
    expect(bench).toMatchObject({ name: 'Barbell Bench Press', sessions: 2 });
    expect(bench.choice).toEqual({ type: 'existing', exerciseId: exerciseId('Barbell Bench Press') });
    expect(rows.find((r) => r.key === '0:1')).toMatchObject({ name: 'Pendlay Row', muscleGroup: 'back', choice: { type: 'new' } });
    expect(rows.find((r) => r.key === '1:61')).toMatchObject({ muscleGroup: 'abs', equipment: 'bodyweight' });
  });
});

describe('importing', () => {
  it('previews what will be added', () => {
    const data = parseJefitExport(JEFIT_FIXTURE);
    const preview = previewImport(db, data, defaults(jefitExercises(db, data)));
    expect(preview).toMatchObject({ workouts: 3, workoutsAlreadyImported: 0, sets: 11, routines: 1, measurements: 2, notes: 1 });
    expect(preview.first).toEqual(new Date(1704906000 * 1000));
  });

  it('brings in workouts, routines, measurements and notes, and drives progression', () => {
    const data = parseJefitExport(JEFIT_FIXTURE);
    const result = applyImport(db, data, defaults(jefitExercises(db, data)));
    expect(result).toEqual({ workouts: 3, sets: 11, exercisesCreated: 2, routines: 1, measurements: 2 });

    const history = historyList(db);
    expect(history.map((w) => [w.dayName, w.setCount])).toEqual([
      [null, 2], // logged without a session: a workout on that date
      ['Lower', 5],
      ['Upper', 4],
    ]);
    const bench = exerciseId('Barbell Bench Press');
    expect(exerciseHistory(db, bench).map((s) => s.sets.map((x) => `${x.weight}x${x.reps}`).join(','))).toEqual([
      '60x10,60x10,60x8',
      '62.5x10,62.5x9',
    ]);
    expect(suggestFor(db, bench).weight).toBe(62.5);

    const routine = routinesQuery(db).all().find((r) => r.name === 'Upper, Lower')!;
    expect(routine.notes).toBe('Four days, heavy');
    const days = daysQuery(db, routine.id).all();
    expect(days.map((d) => d.name)).toEqual(['Upper', 'Lower']);
    expect(slotsQuery(db, days[0].id).all().map((s) => [s.name, s.rule.type, s.restSeconds])).toEqual([
      ['Barbell Bench Press', 'double', 120],
      ['Pendlay Row', 'linear', 90],
    ]);
    expect(slotsQuery(db, days[1].id).all()[0].rule).toMatchObject({ type: 'linear', sets: 4, reps: 5 });

    expect(db.select().from(bodyMeasurements).orderBy(asc(bodyMeasurements.measuredAt)).all().map((m) => [m.weight, m.bodyFat, m.measurements])).toEqual([
      [80, 15, { chest: 100, arms: 38 }],
      [78.5, null, null],
    ]);
    const squat = db.select().from(exercises).where(eq(exercises.id, exerciseId('Barbell Squat'))).get()!;
    expect(squat.notes).toBe('2024-01-12: στη μπάρα, χαμηλά');
    expect(db.select().from(exercises).where(eq(exercises.name, 'Pendlay Row')).get()).toMatchObject({ source: 'jefit', muscleGroup: 'back' });
  });

  it('adds nothing when the same export is imported again, and remembers matches', () => {
    const data = parseJefitExport(JEFIT_FIXTURE);
    const choices: Record<string, ExerciseChoice> = { ...defaults(jefitExercises(db, data)), '1:61': { type: 'existing', exerciseId: exerciseId('Barbell Curl') } };
    applyImport(db, data, choices);
    const counts = () => [db.select().from(workouts).all().length, routinesQuery(db).all().length, db.select().from(exercises).all().length];
    const before = counts();

    const rows = jefitExercises(db, data);
    expect(rows.find((r) => r.key === '1:61')!.choice).toEqual({ type: 'existing', exerciseId: exerciseId('Barbell Curl') });
    expect(rows.every((r) => r.choice.type === 'existing')).toBe(true);
    expect(previewImport(db, data, defaults(rows))).toMatchObject({ workouts: 0, workoutsAlreadyImported: 3, routines: 0, measurements: 0 });
    expect(applyImport(db, data, defaults(rows))).toEqual({ workouts: 0, sets: 0, exercisesCreated: 0, routines: 0, measurements: 0 });
    expect(counts()).toEqual(before);
    expect(db.select().from(exercises).where(eq(exercises.id, exerciseId('Barbell Squat'))).get()!.notes).toBe('2024-01-12: στη μπάρα, χαμηλά');
  });

  it('converts kilograms when the app uses pounds', () => {
    updateSettings(db, { unit: 'lb', defaultIncrement: 5 });
    const data = parseJefitExport(JEFIT_FIXTURE);
    applyImport(db, data, defaults(jefitExercises(db, data)));
    expect(exerciseHistory(db, exerciseId('Barbell Bench Press'))[0].sets[0].weight).toBe(132.28);
  });
});

// Runs against a real export when one is given: JEFIT_EXPORT=/path/to/export.csv npx vitest run src/import
const realExport = process.env.JEFIT_EXPORT;
describe.runIf(realExport && existsSync(realExport))('a real export', () => {
  it('imports completely', () => {
    const data = parseJefitExport(readFileSync(realExport!, 'utf8'));
    const rows = jefitExercises(db, data);
    const result = applyImport(db, data, defaults(rows));
    const history = historyList(db, 5000);
    console.log({ result, logs: data.logs.length, exercises: rows.length, matched: rows.filter((r) => r.choice.type === 'existing').map((r) => r.name), first: history.at(-1)?.startedAt, last: history[0]?.startedAt });
    expect(result.workouts).toBeGreaterThan(0);
    expect(applyImport(db, data, defaults(jefitExercises(db, data))).workouts).toBe(0);
  });
});
