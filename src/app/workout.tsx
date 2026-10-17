import { useKeepAwake } from 'expo-keep-awake';
import { router, Stack } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ExerciseCard } from '@/components/workout/exercise-card';
import { RestBanner } from '@/components/workout/rest-banner';
import { Spacing } from '@/constants/theme';
import { getDay } from '@/db/repo/routines';
import { getSettings } from '@/db/repo/settings';
import { discardWorkout, getActiveWorkout, previousSets, workoutDetail } from '@/db/repo/workouts';
import { useDb, write } from '@/db/use-db';
import { formatDuration, useNow } from '@/hooks/use-now';
import { skipRest } from '@/workout/rest-timer';

/** The workout in progress. */
export default function WorkoutScreen() {
  useKeepAwake();
  const workout = useDb(getActiveWorkout);
  const day = useDb((db) => (workout?.dayId ? getDay(db, workout.dayId) : undefined));
  const items = useDb((db) => (workout ? workoutDetail(db, workout.id) : []));
  const previous = useDb((db) => new Map(items.map((item) => [item.id, previousSets(db, item.exerciseId, workout?.id)])));
  const { unit } = useDb(getSettings);
  const now = useNow();

  if (!workout) {
    return (
      <Page>
        <Stack.Screen options={{ title: 'Workout' }} />
        <ThemedText themeColor="textSecondary">No workout in progress.</ThemedText>
      </Page>
    );
  }

  const elapsed = formatDuration((now - workout.startedAt.getTime()) / 1000);

  const confirmDiscard = () =>
    Alert.alert('Discard workout?', 'Everything logged in this workout will be deleted.', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          skipRest();
          if (write((db) => discardWorkout(db, workout.id))) router.back();
        },
      },
    ]);

  return (
    <Page>
      <Stack.Screen options={{ title: `${day?.name ?? 'Workout'} · ${elapsed}` }} />
      <RestBanner />

      {items.length === 0 ? (
        <ThemedText themeColor="textSecondary">Add an exercise to get started.</ThemedText>
      ) : null}
      {items.map((item, index) => (
        <ExerciseCard
          key={item.id}
          item={item}
          previous={previous.get(item.id) ?? []}
          unit={unit}
          isFirst={index === 0}
          isLast={index === items.length - 1}
        />
      ))}

      <Button
        title="Add exercise"
        variant="secondary"
        onPress={() => router.push({ pathname: '/pick-exercise', params: { workoutId: workout.id } })}
      />
      <View style={styles.footer}>
        <Button title="Discard" variant="danger" onPress={confirmDiscard} />
        <Button title="Finish workout" onPress={() => router.push('/finish')} style={styles.grow} />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  grow: { flex: 1 },
});
