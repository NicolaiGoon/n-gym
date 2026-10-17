import { asc, eq, sql } from 'drizzle-orm';

import { exerciseHistory } from '@/db/queries';
import { deloadStatus, startDeloadWeek } from '@/db/repo/deload';
import { createExercise, exercisesQuery, MUSCLE_GROUPS, type Exercise } from '@/db/repo/exercises';
import {
  addDay,
  addExerciseToDay,
  createRoutine,
  getDay,
  getRoutine,
  getSlot,
  removeSlot,
  slotsQuery,
  updateRoutine,
  updateSlot,
  type SlotChanges,
} from '@/db/repo/routines';
import { getSettings } from '@/db/repo/settings';
import { suggestFor } from '@/db/repo/workouts';
import { exercises, routineDays, routines } from '@/db/schema';
import { exerciseRecords, exerciseSessions, historyList, setsPerMuscleGroup, weeklyTotals, weekStreak } from '@/db/stats';
import type { Database } from '@/db/types';
import { defaultRule, describeRule, isStalled, validateRule, type ProgressionRule } from '@/progression';

import type { JsonSchema } from './schema';

/**
 * The coach's actions. Read actions answer straight away; write actions only describe what they
 * would change (a proposal), and run when the user approves it. Plain TypeScript, so the same
 * actions back the on-device model, tests, and a desktop MCP server.
 */

/** A tool definition in the MCP format. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Extract<JsonSchema, { type: 'object' }>;
}

/** One line of a proposal: what is added, changed or removed. */
export interface Change {
  kind: 'add' | 'update' | 'remove';
  label: string;
  before?: string;
  after?: string;
}

export interface ProposalPreview {
  summary: string;
  changes: Change[];
}

interface ReadAction {
  kind: 'read';
  definition: ToolDefinition;
  run: (db: Database, input: any) => unknown;
}

interface WriteAction {
  kind: 'write';
  definition: ToolDefinition;
  /** Checks the input against the current data and describes the change. Throws when it can't be done. */
  preview: (db: Database, input: any) => ProposalPreview;
  /** Makes the change and returns a short result for the model. */
  apply: (db: Database, input: any) => string;
}

export type Action = ReadAction | WriteAction;

// ---- Shared input pieces ----------------------------------------------------------------------

const RULE_SCHEMA: JsonSchema = {
  type: 'object',
  description:
    'Progression rule. Only `type` is required; missing fields use sensible defaults. ' +
    'double: sets, repMin, repMax, increment. linear: sets, reps, increment, failuresBeforeDeload, deloadPercent (0–1). ' +
    'rpe: sets, reps, targetRpe, increment. wave (5/3/1): trainingMax, increment, roundTo. ' +
    'topBackoff: repMin, repMax, increment, backoffSets, backoffPercent (0–1), backoffReps, roundTo.',
  properties: {
    type: { type: 'string', enum: ['double', 'linear', 'rpe', 'wave', 'topBackoff'] },
    sets: { type: 'integer', minimum: 1 },
    reps: { type: 'integer', minimum: 1 },
    repMin: { type: 'integer', minimum: 1 },
    repMax: { type: 'integer', minimum: 1 },
    increment: { type: 'number', minimum: 0 },
    targetRpe: { type: 'number', minimum: 1, maximum: 10 },
    failuresBeforeDeload: { type: 'integer', minimum: 1 },
    deloadPercent: { type: 'number', minimum: 0, maximum: 1 },
    trainingMax: { type: 'number', minimum: 0 },
    roundTo: { type: 'number', minimum: 0 },
    backoffSets: { type: 'integer', minimum: 0 },
    backoffPercent: { type: 'number', minimum: 0, maximum: 1 },
    backoffReps: { type: 'integer', minimum: 1 },
  },
  required: ['type'],
};

const SLOT_FIELDS = {
  rule: RULE_SCHEMA,
  startWeight: { type: 'number', minimum: 0, description: 'Weight for the first session, used until there is history.' },
  restSeconds: { type: 'integer', minimum: 0, description: 'Rest between sets in seconds.' },
} satisfies Record<string, JsonSchema>;

const EXERCISE_NAME: JsonSchema = {
  type: 'string',
  minLength: 1,
  description: 'Exact exercise name from list_exercises (not case-sensitive).',
};

interface SlotInput {
  rule?: Partial<ProgressionRule> & { type: ProgressionRule['type'] };
  startWeight?: number;
  restSeconds?: number;
}

interface ExerciseSlotInput extends SlotInput {
  exercise: string;
}

const EXERCISE_SLOT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { exercise: EXERCISE_NAME, ...SLOT_FIELDS },
  required: ['exercise'],
};

function findExercise(db: Database, name: string): Exercise {
  const exact = db
    .select()
    .from(exercises)
    .where(sql`lower(${exercises.name}) = lower(${name.trim()})`)
    .get();
  if (exact) return exact;
  const close = exercisesQuery(db, { query: name.trim().split(/\s+/)[0] }).limit(5).all();
  throw new Error(
    `No exercise called "${name}".` + (close.length ? ` Close matches: ${close.map((e) => e.name).join(', ')}.` : ''),
  );
}

/** Fills a partial rule with defaults for its type and checks it. */
function resolveRule(rule: SlotInput['rule'], exercise: Exercise): ProgressionRule {
  const base = defaultRule(rule!.type, exercise.defaultIncrement);
  const merged = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(base)) {
    const value = (rule as Record<string, unknown>)[key];
    if (value !== undefined) merged[key] = value;
  }
  const resolved = merged as unknown as ProgressionRule;
  const errors = validateRule(resolved);
  if (errors.length) throw new Error(`${exercise.name}: ${errors.join(' ')}`);
  return resolved;
}

function slotChanges(input: SlotInput, exercise: Exercise): SlotChanges {
  const changes: SlotChanges = {};
  if (input.rule) changes.rule = resolveRule(input.rule, exercise);
  if (input.startWeight !== undefined) changes.startWeight = input.startWeight;
  if (input.restSeconds !== undefined) changes.restSeconds = input.restSeconds;
  return changes;
}

function describeSlot(slot: { rule: ProgressionRule; startWeight: number; restSeconds: number }, unit: string): string {
  const start = slot.startWeight ? `, start ${slot.startWeight} ${unit}` : '';
  return `${describeRule(slot.rule)}${start}, rest ${slot.restSeconds}s`;
}

/** The slot an exercise gets when added with `changes`, for previews. */
function newSlot(exercise: Exercise, changes: SlotChanges) {
  return {
    rule: changes.rule ?? defaultRule('double', exercise.defaultIncrement),
    startWeight: changes.startWeight ?? 0,
    restSeconds: changes.restSeconds ?? 120,
  };
}

function requireDay(db: Database, dayId: number) {
  const day = getDay(db, dayId);
  if (!day) throw new Error(`No routine day with id ${dayId}. Use get_routine to find day ids.`);
  return day;
}

function requireSlot(db: Database, slotId: number) {
  const slot = getSlot(db, slotId);
  if (!slot) throw new Error(`No routine exercise with id ${slotId}. Use get_routine to find ids.`);
  const exercise = db.select().from(exercises).where(eq(exercises.id, slot.exerciseId)).get()!;
  const day = getDay(db, slot.dayId)!;
  return { slot, exercise, day };
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

// ---- Read actions -------------------------------------------------------------------------------

const listExercises: ReadAction = {
  kind: 'read',
  definition: {
    name: 'list_exercises',
    description: 'Lists exercises in the library, optionally filtered by name or muscle group.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part of the name, e.g. "press".' },
        muscleGroup: { type: 'string', enum: MUSCLE_GROUPS },
      },
    },
  },
  run: (db, input: { query?: string; muscleGroup?: string }) =>
    exercisesQuery(db, input)
      .all()
      .map((e) => ({ name: e.name, muscleGroup: e.muscleGroup, equipment: e.equipment, increment: e.defaultIncrement })),
};

const listRoutines: ReadAction = {
  kind: 'read',
  definition: {
    name: 'list_routines',
    description: 'Lists routines with their ids and day names.',
    inputSchema: { type: 'object', properties: {} },
  },
  run: (db) =>
    db
      .select()
      .from(routines)
      .orderBy(asc(routines.name))
      .all()
      .map((r) => ({
        id: r.id,
        name: r.name,
        archived: r.archived,
        days: db
          .select({ id: routineDays.id, name: routineDays.name })
          .from(routineDays)
          .where(eq(routineDays.routineId, r.id))
          .orderBy(asc(routineDays.position))
          .all(),
      })),
};

const getRoutineAction: ReadAction = {
  kind: 'read',
  definition: {
    name: 'get_routine',
    description: 'Shows a routine: each day (with dayId) and its exercises (with slotId), progression rules, start weights and rest.',
    inputSchema: { type: 'object', properties: { routineId: { type: 'integer' } }, required: ['routineId'] },
  },
  run: (db, { routineId }: { routineId: number }) => {
    const routine = getRoutine(db, routineId);
    if (!routine) throw new Error(`No routine with id ${routineId}.`);
    const days = db.select().from(routineDays).where(eq(routineDays.routineId, routineId)).orderBy(asc(routineDays.position)).all();
    return {
      id: routine.id,
      name: routine.name,
      notes: routine.notes,
      days: days.map((day) => ({
        dayId: day.id,
        name: day.name,
        exercises: slotsQuery(db, day.id)
          .all()
          .map((s) => ({ slotId: s.id, exercise: s.name, rule: s.rule, startWeight: s.startWeight, restSeconds: s.restSeconds })),
      })),
    };
  },
};

const getExerciseStats: ReadAction = {
  kind: 'read',
  definition: {
    name: 'get_exercise_stats',
    description: 'Records, recent sessions, whether the lift has stalled, and the suggested next session for one exercise.',
    inputSchema: { type: 'object', properties: { exercise: EXERCISE_NAME }, required: ['exercise'] },
  },
  run: (db, { exercise: name }: { exercise: string }) => {
    const exercise = findExercise(db, name);
    const sessions = exerciseSessions(db, exercise.id);
    const records = exerciseRecords(sessions);
    return {
      exercise: exercise.name,
      unit: getSettings(db).unit,
      sessionCount: records.sessionCount,
      bestEstimatedOneRepMax: records.bestOneRepMax && {
        value: round1(records.bestOneRepMax.value),
        set: `${records.bestOneRepMax.weight}×${records.bestOneRepMax.reps}`,
        date: isoDate(records.bestOneRepMax.date),
      },
      heaviest: records.heaviest && { ...records.heaviest, date: isoDate(records.heaviest.date) },
      recentSessions: sessions.slice(-5).map((s) => ({
        date: isoDate(s.date),
        sets: s.sets.filter((set) => !set.isWarmup).map((set) => `${set.weight}×${set.reps}`),
        estimatedOneRepMax: round1(s.bestOneRepMax),
      })),
      stalled: isStalled(exerciseHistory(db, exercise.id)),
      nextSession: suggestFor(db, exercise.id),
    };
  },
};

const listRecentWorkouts: ReadAction = {
  kind: 'read',
  definition: {
    name: 'list_recent_workouts',
    description: 'Finished workouts, newest first, with exercise and set counts and volume.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  },
  run: (db, { limit = 10 }: { limit?: number }) =>
    historyList(db, limit).map((w) => ({
      date: isoDate(w.startedAt),
      day: w.dayName,
      minutes: w.finishedAt ? Math.round((w.finishedAt.getTime() - w.startedAt.getTime()) / 60000) : null,
      exercises: w.exerciseCount,
      sets: w.setCount,
      volume: round1(w.volume),
      notes: w.notes,
    })),
};

const getTrainingSummary: ReadAction = {
  kind: 'read',
  definition: {
    name: 'get_training_summary',
    description: 'Workouts and volume per week for the last 8 weeks, the week streak, sets per muscle group this week, and deload status.',
    inputSchema: { type: 'object', properties: {} },
  },
  run: (db) => {
    const deload = deloadStatus(db);
    return {
      unit: getSettings(db).unit,
      weeks: weeklyTotals(db, 8).map((w) => ({ weekStart: isoDate(w.weekStart), workouts: w.workouts, volume: round1(w.volume) })),
      weekStreak: weekStreak(db),
      setsPerMuscleGroupLast7Days: setsPerMuscleGroup(db),
      deload: {
        active: deload.active,
        until: deload.until && isoDate(deload.until),
        suggestedBecause: deload.reasons,
        stalledLifts: deload.stalled.map((e) => e.name),
      },
    };
  },
};

// ---- Write actions ------------------------------------------------------------------------------

interface CreateRoutineInput {
  name: string;
  notes?: string;
  days: { name: string; exercises?: ExerciseSlotInput[] }[];
}

const DAY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, description: 'e.g. "Push" or "Day A".' },
    exercises: { type: 'array', items: EXERCISE_SLOT_SCHEMA },
  },
  required: ['name'],
};

/** Resolves the exercises of a new day, so a bad name fails before anything is written. */
function resolveDayExercises(db: Database, list: ExerciseSlotInput[] = []) {
  return list.map((item) => {
    const exercise = findExercise(db, item.exercise);
    return { exercise, changes: slotChanges(item, exercise) };
  });
}

function dayChanges(db: Database, day: { name: string; exercises?: ExerciseSlotInput[] }, prefix: string): Change[] {
  const { unit } = getSettings(db);
  return [
    { kind: 'add', label: `${prefix}${day.name.trim()}` },
    ...resolveDayExercises(db, day.exercises).map(({ exercise, changes }) => ({
      kind: 'add' as const,
      label: `${prefix}${day.name.trim()} · ${exercise.name}`,
      after: describeSlot(newSlot(exercise, changes), unit),
    })),
  ];
}

function insertDay(db: Database, routineId: number, day: { name: string; exercises?: ExerciseSlotInput[] }) {
  const dayId = addDay(db, routineId, day.name);
  for (const { exercise, changes } of resolveDayExercises(db, day.exercises)) {
    const slotId = addExerciseToDay(db, dayId, exercise.id);
    if (Object.keys(changes).length) updateSlot(db, slotId, changes);
  }
  return dayId;
}

const createRoutineAction: WriteAction = {
  kind: 'write',
  definition: {
    name: 'create_routine',
    description: 'Creates a routine with its days and exercises. Needs the user’s approval.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        notes: { type: 'string' },
        days: { type: 'array', items: DAY_SCHEMA, minItems: 1 },
      },
      required: ['name', 'days'],
    },
  },
  preview: (db, input: CreateRoutineInput) => ({
    summary: `Create routine “${input.name.trim()}” with ${input.days.length} day${input.days.length === 1 ? '' : 's'}`,
    changes: [
      { kind: 'add', label: `Routine ${input.name.trim()}`, after: input.notes?.trim() || undefined },
      ...input.days.flatMap((day) => dayChanges(db, day, 'Day ')),
    ],
  }),
  apply: (db, input: CreateRoutineInput) => {
    const routineId = createRoutine(db, input.name);
    if (input.notes) updateRoutine(db, routineId, { notes: input.notes });
    input.days.forEach((day) => insertDay(db, routineId, day));
    return `Created routine ${input.name.trim()} (id ${routineId}).`;
  },
};

const addDayAction: WriteAction = {
  kind: 'write',
  definition: {
    name: 'add_day',
    description: 'Adds a day, with optional exercises, to the end of an existing routine. Needs the user’s approval.',
    inputSchema: {
      type: 'object',
      properties: { routineId: { type: 'integer' }, ...DAY_SCHEMA.properties },
      required: ['routineId', 'name'],
    },
  },
  preview: (db, { routineId, ...day }: { routineId: number; name: string; exercises?: ExerciseSlotInput[] }) => {
    const routine = getRoutine(db, routineId);
    if (!routine) throw new Error(`No routine with id ${routineId}.`);
    return { summary: `Add day “${day.name.trim()}” to ${routine.name}`, changes: dayChanges(db, day, `${routine.name} · `) };
  },
  apply: (db, { routineId, ...day }) => `Added day (id ${insertDay(db, routineId, day)}).`,
};

const addExerciseAction: WriteAction = {
  kind: 'write',
  definition: {
    name: 'add_exercise_to_day',
    description: 'Adds an exercise to the end of a routine day. Needs the user’s approval.',
    inputSchema: {
      type: 'object',
      properties: { dayId: { type: 'integer' }, exercise: EXERCISE_NAME, ...SLOT_FIELDS },
      required: ['dayId', 'exercise'],
    },
  },
  preview: (db, { dayId, ...item }: ExerciseSlotInput & { dayId: number }) => {
    const day = requireDay(db, dayId);
    const exercise = findExercise(db, item.exercise);
    const changes = slotChanges(item, exercise);
    return {
      summary: `Add ${exercise.name} to ${day.name}`,
      changes: [{ kind: 'add', label: `${day.name} · ${exercise.name}`, after: describeSlot(newSlot(exercise, changes), getSettings(db).unit) }],
    };
  },
  apply: (db, { dayId, ...item }) => {
    const exercise = findExercise(db, item.exercise);
    const slotId = addExerciseToDay(db, dayId, exercise.id);
    const changes = slotChanges(item, exercise);
    if (Object.keys(changes).length) updateSlot(db, slotId, changes);
    return `Added ${exercise.name} (slotId ${slotId}).`;
  },
};

const updateSlotAction: WriteAction = {
  kind: 'write',
  definition: {
    name: 'update_routine_exercise',
    description: 'Changes the progression rule, start weight or rest of an exercise in a routine. Needs the user’s approval.',
    inputSchema: { type: 'object', properties: { slotId: { type: 'integer' }, ...SLOT_FIELDS }, required: ['slotId'] },
  },
  preview: (db, { slotId, ...input }: SlotInput & { slotId: number }) => {
    const { slot, exercise, day } = requireSlot(db, slotId);
    const changes = slotChanges(input, exercise);
    if (!Object.keys(changes).length) throw new Error('Nothing to change: give a rule, startWeight or restSeconds.');
    const unit = getSettings(db).unit;
    return {
      summary: `Change ${exercise.name} on ${day.name}`,
      changes: [
        { kind: 'update', label: `${day.name} · ${exercise.name}`, before: describeSlot(slot, unit), after: describeSlot({ ...slot, ...changes }, unit) },
      ],
    };
  },
  apply: (db, { slotId, ...input }) => {
    const { exercise } = requireSlot(db, slotId);
    updateSlot(db, slotId, slotChanges(input, exercise));
    return `Updated ${exercise.name}.`;
  },
};

const removeSlotAction: WriteAction = {
  kind: 'write',
  definition: {
    name: 'remove_routine_exercise',
    description: 'Removes an exercise from a routine day. Logged history is kept. Needs the user’s approval.',
    inputSchema: { type: 'object', properties: { slotId: { type: 'integer' } }, required: ['slotId'] },
  },
  preview: (db, { slotId }: { slotId: number }) => {
    const { slot, exercise, day } = requireSlot(db, slotId);
    return {
      summary: `Remove ${exercise.name} from ${day.name}`,
      changes: [{ kind: 'remove', label: `${day.name} · ${exercise.name}`, before: describeSlot(slot, getSettings(db).unit) }],
    };
  },
  apply: (db, { slotId }) => {
    const { exercise } = requireSlot(db, slotId);
    removeSlot(db, slotId);
    return `Removed ${exercise.name}.`;
  },
};

interface CreateExerciseInput {
  name: string;
  muscleGroup: string;
  equipment?: string;
  increment?: number;
}

const createExerciseAction: WriteAction = {
  kind: 'write',
  definition: {
    name: 'create_exercise',
    description: 'Adds a new exercise to the library. Check list_exercises first. Needs the user’s approval.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        muscleGroup: { type: 'string', enum: MUSCLE_GROUPS },
        equipment: { type: 'string', enum: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other'] },
        increment: { type: 'number', minimum: 0, description: 'Weight step for progression.' },
      },
      required: ['name', 'muscleGroup'],
    },
  },
  preview: (db, input: CreateExerciseInput) => {
    const existing = db.select().from(exercises).where(sql`lower(${exercises.name}) = lower(${input.name.trim()})`).get();
    if (existing) throw new Error(`${existing.name} already exists.`);
    const increment = input.increment ?? getSettings(db).defaultIncrement;
    return {
      summary: `Add exercise ${input.name.trim()}`,
      changes: [
        {
          kind: 'add',
          label: `Exercise ${input.name.trim()}`,
          after: [input.muscleGroup, input.equipment, `+${increment} per step`].filter(Boolean).join(', '),
        },
      ],
    };
  },
  apply: (db, input: CreateExerciseInput) => {
    createExercise(db, {
      name: input.name,
      muscleGroup: input.muscleGroup,
      equipment: input.equipment ?? null,
      defaultIncrement: input.increment ?? getSettings(db).defaultIncrement,
    });
    return `Added ${input.name.trim()}.`;
  },
};

const startDeloadAction: WriteAction = {
  kind: 'write',
  definition: {
    name: 'start_deload_week',
    description: 'Starts a 7-day deload: workouts started during it use 90% of the planned weight and half the sets. Needs the user’s approval.',
    inputSchema: { type: 'object', properties: {} },
  },
  preview: (db) => {
    if (deloadStatus(db).active) throw new Error('A deload week is already running.');
    return {
      summary: 'Start a deload week',
      changes: [{ kind: 'update', label: 'Next 7 days', before: 'Normal targets', after: '90% weight, half the sets' }],
    };
  },
  apply: (db) => {
    startDeloadWeek(db);
    return 'Deload week started.';
  },
};

export const ACTIONS: Action[] = [
  listExercises,
  listRoutines,
  getRoutineAction,
  getExerciseStats,
  listRecentWorkouts,
  getTrainingSummary,
  createRoutineAction,
  addDayAction,
  addExerciseAction,
  updateSlotAction,
  removeSlotAction,
  createExerciseAction,
  startDeloadAction,
];
