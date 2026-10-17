/**
 * Reads a Jefit export. See docs/jefit-export-format.md for the layout: `### NAME ###` sections,
 * each made of blank-line-separated blocks that carry their own header row.
 */

export type Row = Record<string, string>;

export interface JefitSet {
  weight: number;
  reps: number;
}

export interface JefitLog {
  id: number;
  sessionId: number;
  /** `${belongSys}:${eid}`, which stays the same when Jefit renames an exercise. */
  key: string;
  name: string;
  /** yyyy-mm-dd */
  date: string;
  sets: JefitSet[];
}

export interface JefitSession {
  id: number;
  dayId: number;
  /** Unix seconds. */
  start: number;
  end: number;
}

export interface JefitRoutine {
  id: number;
  name: string;
  description: string;
}

export interface JefitDay {
  id: number;
  routineId: number;
  name: string;
  index: number;
}

export interface JefitRoutineExercise {
  dayId: number;
  key: string;
  name: string;
  sets: number;
  restSeconds: number;
  targetReps: number[];
  sort: number;
  bodypart: number | null;
}

export interface JefitCustomExercise {
  key: string;
  name: string;
  bodypart: number | null;
}

export interface JefitMeasurement {
  date: string;
  weight: number | null;
  bodyFat: number | null;
  measurements: Record<string, number>;
}

export interface JefitNote {
  key: string;
  date: string;
  text: string;
}

export interface JefitExport {
  massUnit: 'kg' | 'lb';
  lengthUnit: 'cm' | 'in';
  logs: JefitLog[];
  sessions: Map<number, JefitSession>;
  routines: JefitRoutine[];
  days: JefitDay[];
  routineExercises: JefitRoutineExercise[];
  customExercises: JefitCustomExercise[];
  measurements: JefitMeasurement[];
  notes: JefitNote[];
}

/** Splits CSV text into rows of fields, honouring quotes (which may hold commas, quotes and newlines). */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let fieldStarted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
      fieldStarted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
      fieldStarted = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      // An empty line yields an empty row, which separates blocks.
      rows.push(fieldStarted || field ? [...row, field] : []);
      row = [];
      field = '';
      fieldStarted = false;
    } else {
      field += c;
      fieldStarted = true;
    }
  }
  if (fieldStarted || field) rows.push([...row, field]);
  return rows;
}

/** Section name → blocks → records keyed by the block's header row. */
export function sections(text: string): Map<string, Row[][]> {
  const result = new Map<string, Row[][]>();
  let current: Row[][] | null = null;
  let header: string[] | null = null;
  for (const fields of csvRows(text.replace(/^﻿/, ''))) {
    const first = fields[0]?.trim() ?? '';
    if (fields.length === 1 && first.startsWith('###')) {
      const name = first.replace(/#/g, '').trim();
      current = name ? [] : null;
      if (name) result.set(name, current!);
      header = null;
      continue;
    }
    if (fields.length === 0 || (fields.length === 1 && first === '')) {
      header = null;
      continue;
    }
    if (!current) continue;
    if (!header) {
      header = fields.map((f) => f.trim());
      current.push([]);
      continue;
    }
    const record: Row = {};
    header.forEach((name, i) => (record[name] = fields[i] ?? ''));
    current[current.length - 1].push(record);
  }
  return result;
}

const num = (value: string | undefined) => {
  const n = Number(value?.trim());
  return Number.isFinite(n) ? n : 0;
};

const optionalNum = (value: string | undefined) => (value?.trim() ? num(value) : null);

/**
 * "40x8,40x8,40x5," → sets. A log with fractional reps ("0x0.0,0x10") is a cardio entry and gives
 * no sets; so does a set with no reps.
 */
export function parseLogs(logs: string): JefitSet[] {
  const entries = logs
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.some((entry) => entry.split('x')[1]?.includes('.'))) return [];
  return entries
    .map((entry) => {
      const [weight, reps] = entry.split('x');
      return { weight: num(weight), reps: Math.round(num(reps)) };
    })
    .filter((set) => set.reps > 0 && set.weight >= 0);
}

const MEASUREMENT_COLUMNS = ['chest', 'arms', 'waist', 'calves', 'hips', 'thighs', 'shoulders', 'neck', 'forearms'];

export function parseJefitExport(text: string): JefitExport {
  const all = sections(text);
  const records = (name: string) => (all.get(name) ?? []).flat();
  if (!all.has('EXERCISE LOGS')) throw new Error('This doesn’t look like a Jefit export (it has no EXERCISE LOGS section).');

  const setting = records('SETTING')[0] ?? {};
  const massUnit = setting.mass?.trim() === 'lb' ? 'lb' : 'kg';
  const lengthUnit = setting.length?.trim() === 'in' ? 'in' : 'cm';

  const logs: JefitLog[] = records('EXERCISE LOGS')
    .map((r) => ({
      id: num(r._id),
      sessionId: num(r.belongsession),
      key: `${num(r.belongSys)}:${num(r.eid)}`,
      name: r.ename?.trim() ?? '',
      date: r.mydate?.trim() ?? '',
      sets: parseLogs(r.logs ?? ''),
    }))
    .filter((log) => log.sets.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(log.date));

  const sessions = new Map<number, JefitSession>();
  for (const r of records('WORKOUT SESSIONS')) {
    const id = num(r._id);
    sessions.set(id, { id, dayId: num(r.day_id), start: num(r.starttime), end: num(r.endtime) });
  }

  // ROUTINES mixes three kinds of block; tell them apart by their columns.
  const routines: JefitRoutine[] = [];
  const days: JefitDay[] = [];
  const routineExercises: JefitRoutineExercise[] = [];
  for (const block of all.get('ROUTINES') ?? []) {
    for (const r of block) {
      if ('belongplan' in r) {
        routineExercises.push({
          dayId: num(r.belongplan),
          key: `${num(r.belongSys)}:${num(r.exercise_id)}`,
          name: r.exercisename?.trim() ?? '',
          sets: num(r.setcount),
          restSeconds: num(r.timer),
          targetReps: (r.targetrep ?? '').split(',').map(num).filter((n) => n > 0),
          sort: num(r.mysort),
          bodypart: optionalNum(r.bodypart),
        });
      } else if ('package' in r) {
        days.push({ id: num(r._id), routineId: num(r.package), name: r.name?.trim() ?? '', index: num(r.dayIndex) });
      } else if ('dayaweek' in r) {
        routines.push({ id: num(r._id), name: r.name?.trim() ?? '', description: r.description?.trim() ?? '' });
      }
    }
  }

  const customExercises = records('CUSTOM EXERCISES').map((r) => ({
    key: `0:${num(r._id)}`,
    name: r.name?.trim() ?? '',
    bodypart: optionalNum(r.bodypart),
  }));

  const measurements = records('PROFILE')
    .map((r) => ({
      date: r.mydate?.trim() ?? '',
      weight: num(r.weight) > 0 ? num(r.weight) : null,
      bodyFat: num(r.fatpercent) > 0 ? num(r.fatpercent) : null,
      measurements: Object.fromEntries(MEASUREMENT_COLUMNS.filter((c) => num(r[c]) > 0).map((c) => [c, num(r[c])])),
    }))
    .filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.date) && (m.weight !== null || m.bodyFat !== null || Object.keys(m.measurements).length));

  const notes = records('NOTES')
    .map((r) => ({ key: `${num(r.belongSys)}:${num(r.eid)}`, date: r.mydate?.trim() ?? '', text: r.mynote?.trim() ?? '' }))
    .filter((n) => n.text);

  return { massUnit, lengthUnit, logs, sessions, routines, days, routineExercises, customExercises, measurements, notes };
}
