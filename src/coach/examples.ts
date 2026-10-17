/** A sample input for each action, used by the action console on the Coach tab. Ids are placeholders. */
export const EXAMPLE_INPUTS: Record<string, unknown> = {
  list_exercises: { muscleGroup: 'chest' },
  list_routines: {},
  get_routine: { routineId: 1 },
  get_exercise_stats: { exercise: 'Barbell Bench Press' },
  list_recent_workouts: { limit: 5 },
  get_training_summary: {},
  create_routine: {
    name: 'Upper / Lower',
    days: [
      {
        name: 'Upper',
        exercises: [
          { exercise: 'Barbell Bench Press', rule: { type: 'topBackoff' }, startWeight: 60 },
          { exercise: 'Barbell Row', rule: { type: 'double', repMin: 6, repMax: 10 } },
        ],
      },
      { name: 'Lower', exercises: [{ exercise: 'Barbell Squat', rule: { type: 'wave', trainingMax: 100 } }] },
    ],
  },
  add_day: { routineId: 1, name: 'Arms', exercises: [{ exercise: 'Barbell Curl' }] },
  add_exercise_to_day: { dayId: 1, exercise: 'Barbell Squat', rule: { type: 'linear', reps: 5 }, startWeight: 60 },
  update_routine_exercise: { slotId: 1, rule: { type: 'double', repMin: 8, repMax: 12 } },
  remove_routine_exercise: { slotId: 1 },
  create_exercise: { name: 'Zercher Squat', muscleGroup: 'legs', equipment: 'barbell' },
  start_deload_week: {},
};
