import { eq, sql } from 'drizzle-orm';

import { getSetting, getSettings, setSetting } from '@/db/repo/settings';
import { bodyMeasurements, exercises, routineDays, routineExercises, routines, workoutExercises, workouts, workoutSets } from '@/db/schema';
import type { Database } from '@/db/types';
import type { ProgressionRule } from '@/progression';

import type { JefitExport, JefitLog } from './parse';

/**
 * Turns a parsed Jefit export into n-gym data. Everything is matched by Jefit's ids, so importing
 * the same export twice adds nothing the second time.
 */

/** What to do with one Jefit exercise: use a library exercise, or create a new one. */
export type ExerciseChoice = { type: 'existing'; exerciseId: number } | { type: 'new' };

export interface JefitExerciseRow {
  key: string;
  /** Most recent non-empty name. */
  name: string;
  sessions: number;
  muscleGroup: string;
  equipment: string | null;
  /** The remembered or best-guess choice. */
  choice: ExerciseChoice;
}

const MAP_KEY = 'jefitExerciseMap';

/** Points remembered Jefit matches at `to` after exercise `from` was merged into it. */
export function remapJefitExercise(db: Database, from: number, to: number): void {
  const map = savedMap(db);
  let changed = false;
  for (const key of Object.keys(map)) {
    if (map[key] === from) {
      map[key] = to;
      changed = true;
    }
  }
  if (changed) setSetting(db, MAP_KEY, JSON.stringify(map));
}

/** Jefit body part codes, inferred from the exercises they appear on. */
const BODYPARTS: Record<number, string> = {
  0: 'abs',
  1: 'back',
  2: 'biceps',
  3: 'chest',
  4: 'forearms',
  5: 'glutes',
  6: 'shoulders',
  7: 'triceps',
  8: 'legs',
  9: 'calves',
  10: 'cardio',
  11: 'other',
};

const NAME_HINTS: [RegExp, string][] = [
  [/calf|calves/i, 'calves'],
  [/crunch|sit-?up|plank|\babs?\b|leg raise|ab wheel/i, 'abs'],
  [/curl(?!.*leg)|bicep/i, 'biceps'],
  [/tricep|pushdown|skull|dip/i, 'triceps'],
  [/bench|chest|fly|flye|push-?up|pec/i, 'chest'],
  [/lateral raise|shoulder|overhead|military|upright row|face pull|rear delt|front raise|arnold/i, 'shoulders'],
  [/row|pull-?up|chin-?up|pulldown|deadlift|back|shrug/i, 'back'],
  [/squat|lunge|leg|hack|split|step-?up|hamstring|quad/i, 'legs'],
  [/glute|hip thrust|bridge/i, 'glutes'],
  [/wrist|forearm/i, 'forearms'],
];

function guessEquipment(name: string): string | null {
  if (/barbell|\bbb\b|ez[- ]?bar|smith/i.test(name)) return 'barbell';
  if (/dumbbell|\bdb\b/i.test(name)) return 'dumbbell';
  if (/cable|pulldown|pushdown/i.test(name)) return 'cable';
  if (/machine|lever|press on leg press|leg press|leg extension|leg curl/i.test(name)) return 'machine';
  if (/push-?up|pull-?up|chin-?up|dip|plank|crunch|hanging|bodyweight/i.test(name)) return 'bodyweight';
  return null;
}

function guessMuscleGroup(name: string, bodypart: number | null): string {
  if (bodypart !== null && BODYPARTS[bodypart]) return BODYPARTS[bodypart];
  return NAME_HINTS.find(([pattern]) => pattern.test(name))?.[1] ?? 'other';
}

function savedMap(db: Database): Record<string, number> {
  try {
    return JSON.parse(getSetting(db, MAP_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function findByName(db: Database, name: string) {
  return db.select({ id: exercises.id }).from(exercises).where(sql`lower(${exercises.name}) = lower(${name})`).get();
}

/** Every exercise in the export's logs and routines, with how it will be matched. */
export function jefitExercises(db: Database, data: JefitExport): JefitExerciseRow[] {
  const saved = savedMap(db);
  const rows = new Map<string, { name: string; date: string; sessions: Set<number>; bodypart: number | null }>();
  const touch = (key: string, name: string, date: string) => {
    const row = rows.get(key) ?? { name: '', date: '', sessions: new Set<number>(), bodypart: null };
    // The latest non-empty name wins: Jefit renamed exercises over the years.
    if (name && date >= row.date) {
      row.name = name;
      row.date = date;
    }
    rows.set(key, row);
    return row;
  };
  for (const log of data.logs) touch(log.key, log.name, log.date).sessions.add(log.sessionId || -log.id);
  for (const item of data.routineExercises) {
    const row = touch(item.key, item.name, '');
    row.bodypart ??= item.bodypart;
  }
  for (const custom of data.customExercises) {
    const row = rows.get(custom.key);
    if (!row) continue;
    row.bodypart = custom.bodypart ?? row.bodypart;
    if (!row.name) row.name = custom.name;
  }

  return [...rows.entries()]
    .map(([key, row]) => {
      const name = row.name || `Jefit exercise ${key}`;
      const remembered = saved[key];
      const existing =
        remembered !== undefined && db.select({ id: exercises.id }).from(exercises).where(eq(exercises.id, remembered)).get()
          ? { id: remembered }
          : findByName(db, name);
      return {
        key,
        name,
        sessions: row.sessions.size,
        muscleGroup: guessMuscleGroup(name, row.bodypart),
        equipment: guessEquipment(name),
        choice: existing ? ({ type: 'existing', exerciseId: existing.id } as const) : ({ type: 'new' } as const),
      };
    })
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

interface WorkoutGroup {
  externalId: string;
  start: Date;
  end: Date;
  jefitDayId: number | null;
  logs: JefitLog[];
}

/** Logs grouped into workouts: by Jefit session, or by date when the session is missing. */
function workoutGroups(data: JefitExport): WorkoutGroup[] {
  const groups = new Map<string, WorkoutGroup>();
  for (const log of [...data.logs].sort((a, b) => a.id - b.id)) {
    const session = data.sessions.get(log.sessionId);
    const externalId = session ? `jefit:${session.id}` : `jefit:date:${log.date}`;
    let group = groups.get(externalId);
    if (!group) {
      const noon = new Date(`${log.date}T12:00:00`);
      const start = session?.start ? new Date(session.start * 1000) : noon;
      const end = session && session.end > session.start ? new Date(session.end * 1000) : start;
      group = { externalId, start, end, jefitDayId: session?.dayId ?? null, logs: [] };
      groups.set(externalId, group);
    }
    group.logs.push(log);
  }
  return [...groups.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

function importedIds(db: Database, table: typeof workouts | typeof routines): Set<string> {
  return new Set(
    db
      .select({ id: table.externalId })
      .from(table)
      .all()
      .map((r) => r.id)
      .filter((id): id is string => !!id),
  );
}

const measuredAt = (date: string) => new Date(`${date}T12:00:00`);

export interface ImportPreview {
  workouts: number;
  workoutsAlreadyImported: number;
  sets: number;
  first: Date | null;
  last: Date | null;
  newExercises: number;
  routines: number;
  measurements: number;
  notes: number;
}

export function previewImport(db: Database, data: JefitExport, choices: Record<string, ExerciseChoice>): ImportPreview {
  const done = importedIds(db, workouts);
  const groups = workoutGroups(data);
  const fresh = groups.filter((g) => !done.has(g.externalId));
  const doneRoutines = importedIds(db, routines);
  const existingDates = new Set(
    db
      .select({ at: bodyMeasurements.measuredAt })
      .from(bodyMeasurements)
      .all()
      .map((r) => r.at.getTime()),
  );
  return {
    workouts: fresh.length,
    workoutsAlreadyImported: groups.length - fresh.length,
    sets: fresh.reduce((sum, g) => sum + g.logs.reduce((n, log) => n + log.sets.length, 0), 0),
    first: fresh[0]?.start ?? null,
    last: fresh.at(-1)?.start ?? null,
    newExercises: Object.values(choices).filter((c) => c.type === 'new').length,
    routines: data.routines.filter((r) => !doneRoutines.has(`jefit:${r.id}`)).length,
    measurements: data.measurements.filter((m) => !existingDates.has(measuredAt(m.date).getTime())).length,
    notes: data.notes.length,
  };
}

export interface ImportResult {
  workouts: number;
  sets: number;
  exercisesCreated: number;
  routines: number;
  measurements: number;
}

/** Converts weights to the app's unit, rounded to 0.01. */
function weightConverter(from: 'kg' | 'lb', to: 'kg' | 'lb') {
  const factor = from === to ? 1 : from === 'kg' ? 2.20462 : 0.453592;
  return (weight: number) => Math.round(weight * factor * 100) / 100;
}

/** A routine exercise's Jefit targets as a progression rule. */
function ruleFor(targets: number[], sets: number, increment: number): ProgressionRule {
  const count = Math.max(1, sets || targets.length || 3);
  if (targets.length === 0) return { type: 'double', sets: count, repMin: 8, repMax: 12, increment };
  const low = Math.min(...targets);
  const high = Math.max(...targets);
  if (low === high) return { type: 'linear', sets: count, reps: low, increment, failuresBeforeDeload: 3, deloadPercent: 0.1 };
  return { type: 'double', sets: count, repMin: low, repMax: high, increment };
}

/** Rows per insert statement, well under SQLite's limit on bound parameters. */
const CHUNK = 100;

function chunks<T>(rows: T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) result.push(rows.slice(i, i + CHUNK));
  return result;
}

function maxId(db: Database, table: typeof workouts | typeof workoutExercises): number {
  return db.select({ max: sql<number | null>`max(${table.id})` }).from(table).get()?.max ?? 0;
}

export function applyImport(db: Database, data: JefitExport, choices: Record<string, ExerciseChoice>): ImportResult {
  const result: ImportResult = { workouts: 0, sets: 0, exercisesCreated: 0, routines: 0, measurements: 0 };
  const { unit, defaultIncrement } = getSettings(db);
  const convert = weightConverter(data.massUnit, unit);
  const rows = new Map(jefitExercises(db, data).map((r) => [r.key, r]));

  db.transaction((tx) => {
    // Exercises: resolve every Jefit key to an n-gym id, creating new ones where chosen.
    const ids = new Map<string, number>();
    for (const [key, row] of rows) {
      const choice = choices[key] ?? row.choice;
      if (choice.type === 'existing') {
        ids.set(key, choice.exerciseId);
        continue;
      }
      let name = row.name;
      for (let n = 2; findByName(tx, name); n++) name = `${row.name} (${n})`;
      const id = tx
        .insert(exercises)
        .values({
          name,
          muscleGroup: row.muscleGroup,
          equipment: row.equipment,
          defaultIncrement: row.equipment === 'bodyweight' ? 0 : defaultIncrement,
          source: 'jefit',
        })
        .returning({ id: exercises.id })
        .get().id;
      ids.set(key, id);
      result.exercisesCreated++;
    }
    const map = savedMap(tx);
    for (const [key, id] of ids) map[key] = id;
    setSetting(tx, MAP_KEY, JSON.stringify(map));

    // Routines, days and their exercises.
    const doneRoutines = importedIds(tx, routines);
    const dayIds = new Map<number, number>();
    for (const routine of data.routines) {
      const externalId = `jefit:${routine.id}`;
      if (doneRoutines.has(externalId)) continue;
      const routineId = tx
        .insert(routines)
        .values({ name: routine.name || 'Jefit routine', notes: routine.description || null, externalId })
        .returning({ id: routines.id })
        .get().id;
      result.routines++;
      const days = data.days.filter((d) => d.routineId === routine.id).sort((a, b) => a.index - b.index);
      days.forEach((day, position) => {
        const dayId = tx
          .insert(routineDays)
          .values({ routineId, name: day.name || `Day ${position + 1}`, position })
          .returning({ id: routineDays.id })
          .get().id;
        dayIds.set(day.id, dayId);
        const items = data.routineExercises.filter((e) => e.dayId === day.id && ids.has(e.key)).sort((a, b) => a.sort - b.sort);
        items.forEach((item, slot) => {
          const exerciseId = ids.get(item.key)!;
          const exercise = tx.select().from(exercises).where(eq(exercises.id, exerciseId)).get()!;
          tx.insert(routineExercises)
            .values({
              dayId,
              exerciseId,
              position: slot,
              rule: ruleFor(item.targetReps, item.sets, exercise.defaultIncrement),
              restSeconds: item.restSeconds > 0 ? item.restSeconds : 120,
            })
            .run();
        });
      });
    }

    // Workouts with their exercises and sets. Ids are assigned here so the rows can be inserted in
    // a few large statements instead of one per row, which is what makes a big import fast.
    const doneWorkouts = importedIds(tx, workouts);
    let nextWorkoutId = maxId(tx, workouts) + 1;
    let nextItemId = maxId(tx, workoutExercises) + 1;
    const workoutRows: (typeof workouts.$inferInsert)[] = [];
    const itemRows: (typeof workoutExercises.$inferInsert)[] = [];
    const setRows: (typeof workoutSets.$inferInsert)[] = [];
    for (const group of workoutGroups(data)) {
      if (doneWorkouts.has(group.externalId)) continue;
      const workoutId = nextWorkoutId++;
      workoutRows.push({
        id: workoutId,
        dayId: group.jefitDayId !== null ? (dayIds.get(group.jefitDayId) ?? null) : null,
        startedAt: group.start,
        finishedAt: group.end,
        source: 'jefit',
        externalId: group.externalId,
      });
      group.logs.forEach((log, position) => {
        const exerciseId = ids.get(log.key)!;
        const itemId = nextItemId++;
        itemRows.push({ id: itemId, workoutId, exerciseId, position });
        log.sets.forEach((set, i) =>
          setRows.push({
            workoutExerciseId: itemId,
            workoutId,
            exerciseId,
            position: i,
            weight: convert(set.weight),
            reps: set.reps,
            loggedAt: group.start,
          }),
        );
      });
    }
    for (const chunk of chunks(workoutRows)) tx.insert(workouts).values(chunk).run();
    for (const chunk of chunks(itemRows)) tx.insert(workoutExercises).values(chunk).run();
    for (const chunk of chunks(setRows)) tx.insert(workoutSets).values(chunk).run();
    result.workouts = workoutRows.length;
    result.sets = setRows.length;

    // Body measurements, one per date.
    for (const m of data.measurements) {
      const at = measuredAt(m.date);
      if (tx.select({ id: bodyMeasurements.id }).from(bodyMeasurements).where(eq(bodyMeasurements.measuredAt, at)).get()) continue;
      tx.insert(bodyMeasurements)
        .values({
          measuredAt: at,
          weight: m.weight === null ? null : convert(m.weight),
          bodyFat: m.bodyFat,
          measurements: Object.keys(m.measurements).length ? m.measurements : null,
          source: 'jefit',
        })
        .run();
      result.measurements++;
    }

    // Exercise notes, added once each.
    for (const note of data.notes) {
      const exerciseId = ids.get(note.key);
      if (exerciseId === undefined) continue;
      const line = note.date ? `${note.date}: ${note.text}` : note.text;
      const current = tx.select({ notes: exercises.notes }).from(exercises).where(eq(exercises.id, exerciseId)).get()?.notes ?? '';
      if (current.split('\n').includes(line)) continue;
      tx.update(exercises)
        .set({ notes: current ? `${current}\n${line}` : line })
        .where(eq(exercises.id, exerciseId))
        .run();
    }
  });
  return result;
}
