import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { SetEditDialog } from '@/components/workout/set-edit-dialog';
import { SummaryView } from '@/components/workout/summary-view';
import { Spacing } from '@/constants/theme';
import { getDay } from '@/db/repo/routines';
import { getSettings } from '@/db/repo/settings';
import { discardWorkout, getWorkout, workoutDetail, workoutSummary, type WorkoutSet } from '@/db/repo/workouts';
import { useDb, write } from '@/db/use-db';

/** A finished workout: summary, every set (tap to edit), and delete. */
export default function WorkoutDetailScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const workout = useDb((db) => getWorkout(db, id));
  const day = useDb((db) => (workout?.dayId ? getDay(db, workout.dayId) : undefined));
  const items = useDb((db) => workoutDetail(db, id));
  const summary = useDb((db) => (workout ? workoutSummary(db, id) : undefined));
  const { unit } = useDb(getSettings);
  const [editing, setEditing] = useState<WorkoutSet | null>(null);

  if (!workout || !summary) return <Page>{null}</Page>;

  const confirmDelete = () =>
    Alert.alert('Delete workout?', 'This workout and all its sets will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => write((db) => discardWorkout(db, id)) && router.back() },
    ]);

  return (
    <Page>
      <Stack.Screen
        options={{
          title: `${day?.name ?? 'Workout'} · ${workout.startedAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
        }}
      />
      <SummaryView summary={summary} unit={unit} />
      {workout.notes ? <ThemedText type="small">{workout.notes}</ThemedText> : null}

      {items.map((item) => (
        <ThemedView key={item.id} type="backgroundElement" style={styles.card}>
          <Pressable onPress={() => router.push({ pathname: '/stats/[id]', params: { id: item.exerciseId } })}>
            <ThemedText type="smallBold">{item.name}</ThemedText>
          </Pressable>
          {item.sets.map((set, index) => (
            <Pressable key={set.id} onPress={() => setEditing(set)} style={styles.setRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.index}>
                {set.isWarmup ? 'W' : index + 1 - item.sets.slice(0, index).filter((s) => s.isWarmup).length}
              </ThemedText>
              <ThemedText type="small">
                {set.weight} {unit} × {set.reps}
                {set.rpe ? `  @ RPE ${set.rpe}` : ''}
              </ThemedText>
            </Pressable>
          ))}
        </ThemedView>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        Tap a set to edit or delete it.
      </ThemedText>

      <View style={styles.footer}>
        <Button title="Delete workout" variant="danger" onPress={confirmDelete} />
      </View>
      <SetEditDialog key={editing?.id ?? 'none'} set={editing} unit={unit} onClose={() => setEditing(null)} />
    </Page>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  setRow: { flexDirection: 'row', gap: Spacing.two, paddingVertical: Spacing.one },
  index: { width: 20, textAlign: 'center' },
  footer: { marginTop: Spacing.three },
});
