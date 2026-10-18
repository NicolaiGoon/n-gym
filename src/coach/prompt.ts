import { asc, eq } from 'drizzle-orm';

import { deloadStatus } from '@/db/repo/deload';
import { getActiveRoutine, programPlan } from '@/db/repo/program';
import { getSettings } from '@/db/repo/settings';
import { routines } from '@/db/schema';
import { historyList, weeklyTotals, weekStreak } from '@/db/stats';
import type { Database } from '@/db/types';

/** The coach's instructions plus a short picture of the user's training, rebuilt for each turn. */
export function buildSystemPrompt(db: Database, now = new Date()): string {
  const { unit, defaultIncrement } = getSettings(db);
  const weeks = weeklyTotals(db, 4, now);
  const last = historyList(db, 1)[0];
  const deload = deloadStatus(db, now);
  const program = getActiveRoutine(db);
  const plan = program ? programPlan(db, program.id) : null;
  const nextDay = plan?.days.find((d) => d.id === plan.nextDayId);
  const active = db.select({ id: routines.id, name: routines.name }).from(routines).where(eq(routines.archived, false)).orderBy(asc(routines.name)).all();

  const facts = [
    `Today is ${now.toDateString()}.`,
    `Weights are in ${unit}; the default weight step is ${defaultIncrement} ${unit}.`,
    `Workouts in the last 4 weeks, oldest first: ${weeks.map((w) => w.workouts).join(', ')}. Week streak: ${weekStreak(db, now)}.`,
    last ? `Last workout: ${last.startedAt.toDateString()}${last.dayName ? ` (${last.dayName})` : ''}.` : 'No workouts logged yet.',
    active.length ? `Routines: ${active.map((r) => `${r.name} (id ${r.id})`).join(', ')}.` : 'No routines yet.',
    program
      ? `Active program: ${program.name} (id ${program.id})${nextDay ? `; next day is ${nextDay.name}` : ''}.`
      : 'No active program is set.',
    deload.active ? `A deload week is running until ${deload.until!.toDateString()}.` : '',
    deload.stalled.length ? `Stalled lifts: ${deload.stalled.map((e) => e.name).join(', ')}.` : '',
  ].filter(Boolean);

  return `You are the coach inside n-gym, a workout tracker. You run offline on the user's phone.

How to work:
- Use the tools to look things up. Never guess ids or exercise names: exercise names must match list_exercises exactly.
- Tools that change data only create a proposal card. The user approves or rejects it. Never say a change is saved until you are told it was approved.
- Do a whole request in one proposal where you can, e.g. one create_routine call with every day and exercise.
- Pick progression rules that suit the goal: double progression for hypertrophy accessories, linear or top set + back-off for main strength lifts, 5/3/1 waves for experienced lifters.
- Keep replies short and practical. No medical advice.

About the user:
${facts.map((f) => `- ${f}`).join('\n')}`;
}
