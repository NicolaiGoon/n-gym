import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ExerciseList } from '@/components/exercise-list';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { addExerciseToDay } from '@/db/repo/routines';
import { write } from '@/db/use-db';

export default function PickExerciseScreen() {
  const dayId = Number(useLocalSearchParams<{ dayId: string }>().dayId);
  return (
    <ThemedView style={styles.container}>
      <View style={styles.inner}>
        <ExerciseList
          onSelect={(exercise) => {
            if (write((db) => addExerciseToDay(db, dayId, exercise.id))) router.back();
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
