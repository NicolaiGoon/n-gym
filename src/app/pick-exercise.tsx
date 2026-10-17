import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ExerciseList } from '@/components/exercise-list';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Database } from '@/db/types';
import { addExerciseToDay } from '@/db/repo/routines';
import { addExerciseToWorkout, swapWorkoutExercise } from '@/db/repo/workouts';
import { write } from '@/db/use-db';

/**
 * Picks an exercise for one of three purposes, chosen by the route param:
 * `dayId` adds it to a routine day, `workoutId` adds it to the workout, `swapId` replaces a workout exercise.
 */
export default function PickExerciseScreen() {
  const params = useLocalSearchParams<{ dayId?: string; workoutId?: string; swapId?: string }>();

  const pick = (exerciseId: number) => (db: Database) => {
    if (params.swapId) swapWorkoutExercise(db, Number(params.swapId), exerciseId);
    else if (params.workoutId) addExerciseToWorkout(db, Number(params.workoutId), exerciseId);
    else if (params.dayId) addExerciseToDay(db, Number(params.dayId), exerciseId);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.inner}>
        <ExerciseList
          onSelect={(exercise) => {
            if (write(pick(exercise.id))) router.back();
          }}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: Spacing.three },
});
