import { count } from 'drizzle-orm';

import type { Database } from './types';
import { exercises } from './schema';

type NewExercise = typeof exercises.$inferInsert;

/** A starter library. Jefit imports and user-created exercises are added on top. */
const BUILTIN_EXERCISES: NewExercise[] = [
  { name: 'Barbell Bench Press', muscleGroup: 'chest', equipment: 'barbell' },
  { name: 'Incline Dumbbell Press', muscleGroup: 'chest', equipment: 'dumbbell', defaultIncrement: 2 },
  { name: 'Dumbbell Fly', muscleGroup: 'chest', equipment: 'dumbbell', defaultIncrement: 2 },
  { name: 'Barbell Squat', muscleGroup: 'legs', equipment: 'barbell' },
  { name: 'Romanian Deadlift', muscleGroup: 'legs', equipment: 'barbell' },
  { name: 'Leg Press', muscleGroup: 'legs', equipment: 'machine', defaultIncrement: 5 },
  { name: 'Leg Curl', muscleGroup: 'legs', equipment: 'machine' },
  { name: 'Standing Calf Raise', muscleGroup: 'calves', equipment: 'machine', defaultIncrement: 5 },
  { name: 'Barbell Deadlift', muscleGroup: 'back', equipment: 'barbell', defaultIncrement: 5 },
  { name: 'Barbell Row', muscleGroup: 'back', equipment: 'barbell' },
  { name: 'Pull-Up', muscleGroup: 'back', equipment: 'bodyweight' },
  { name: 'Lat Pulldown', muscleGroup: 'back', equipment: 'cable' },
  { name: 'Seated Cable Row', muscleGroup: 'back', equipment: 'cable' },
  { name: 'Overhead Press', muscleGroup: 'shoulders', equipment: 'barbell' },
  { name: 'Dumbbell Lateral Raise', muscleGroup: 'shoulders', equipment: 'dumbbell', defaultIncrement: 1 },
  { name: 'Face Pull', muscleGroup: 'shoulders', equipment: 'cable' },
  { name: 'Barbell Curl', muscleGroup: 'biceps', equipment: 'barbell' },
  { name: 'Dumbbell Hammer Curl', muscleGroup: 'biceps', equipment: 'dumbbell', defaultIncrement: 1 },
  { name: 'Triceps Pushdown', muscleGroup: 'triceps', equipment: 'cable' },
  { name: 'Skull Crusher', muscleGroup: 'triceps', equipment: 'barbell' },
  { name: 'Plank', muscleGroup: 'abs', equipment: 'bodyweight', defaultIncrement: 0 },
];

export async function seedIfEmpty(db: Database): Promise<void> {
  const [{ total }] = await db.select({ total: count() }).from(exercises);
  if (total > 0) return;
  await db.insert(exercises).values(BUILTIN_EXERCISES);
}
