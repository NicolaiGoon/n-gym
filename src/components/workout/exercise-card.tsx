import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/list-row';
import { Stepper } from '@/components/ui/stepper';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import {
  deleteSet,
  logSet,
  moveWorkoutExercise,
  removeWorkoutExercise,
  type WorkoutExerciseDetail,
  type WorkoutSet,
} from '@/db/repo/workouts';
import { write } from '@/db/use-db';
import { useTheme } from '@/hooks/use-theme';
import { startRest } from '@/workout/rest-timer';

function formatSet(set: Pick<WorkoutSet, 'weight' | 'reps'>, unit: string) {
  return `${set.weight} ${unit} × ${set.reps}`;
}

/** One exercise in the active workout: target, last time, logged sets and the entry row. */
export function ExerciseCard({
  item,
  previous,
  unit,
  isFirst,
  isLast,
}: {
  item: WorkoutExerciseDetail;
  previous: WorkoutSet[];
  unit: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const theme = useTheme();
  const lastLogged = item.sets.at(-1);
  // Prefill from the last set logged here, else from the target.
  const [weight, setWeight] = useState(String(lastLogged?.weight ?? item.target?.weight ?? 0));
  const [reps, setReps] = useState(String(lastLogged?.reps ?? item.target?.reps ?? 8));
  const [rpe, setRpe] = useState('');
  const [warmup, setWarmup] = useState(false);

  const workingDone = item.sets.filter((s) => !s.isWarmup).length;
  const targetSets = item.target?.sets ?? 0;

  const log = () => {
    const ok = write((db) =>
      logSet(db, item.id, {
        weight: Number(weight),
        reps: Number(reps),
        rpe: rpe.trim() ? Number(rpe) : null,
        isWarmup: warmup,
      }),
    );
    if (ok) {
      setRpe('');
      startRest(warmup ? Math.min(60, item.restSeconds) : item.restSeconds);
    }
  };

  const confirmRemove = () =>
    Alert.alert('Remove exercise?', `${item.name} and its logged sets will be removed from this workout.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => write((db) => removeWorkoutExercise(db, item.id)) },
    ]);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        <ThemedText type="smallBold" style={styles.title}>
          {item.name}
        </ThemedText>
        {!isFirst ? (
          <IconButton label="↑" accessibilityLabel="Move up" onPress={() => write((db) => moveWorkoutExercise(db, item.id, 'up'))} />
        ) : null}
        {!isLast ? (
          <IconButton label="↓" accessibilityLabel="Move down" onPress={() => write((db) => moveWorkoutExercise(db, item.id, 'down'))} />
        ) : null}
        {item.sets.length === 0 ? (
          <IconButton
            label="⇄"
            accessibilityLabel="Swap exercise"
            onPress={() => router.push({ pathname: '/pick-exercise', params: { swapId: item.id } })}
          />
        ) : null}
        <IconButton label="✕" accessibilityLabel="Remove exercise" onPress={confirmRemove} />
      </View>

      {item.target ? (
        <View>
          <ThemedText type="small">
            Target: {item.target.sets}×{item.target.reps} @ {item.target.weight} {unit}
            {targetSets ? `  ·  ${workingDone}/${targetSets} sets` : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {item.target.reason}
          </ThemedText>
        </View>
      ) : null}
      {previous.length ? (
        <ThemedText type="small" themeColor="textSecondary">
          Last time: {previous.map((s) => formatSet(s, unit)).join(', ')}
        </ThemedText>
      ) : null}

      {item.sets.map((set, index) => (
        <View key={set.id} style={styles.setRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.setIndex}>
            {set.isWarmup ? 'W' : index + 1 - item.sets.slice(0, index).filter((s) => s.isWarmup).length}
          </ThemedText>
          <ThemedText type="small" style={styles.grow}>
            {formatSet(set, unit)}
            {set.rpe ? `  @ RPE ${set.rpe}` : ''}
          </ThemedText>
          <IconButton label="✕" accessibilityLabel="Delete set" onPress={() => write((db) => deleteSet(db, set.id))} />
        </View>
      ))}

      <View style={styles.entry}>
        <Stepper label={`Weight (${unit})`} value={weight} onChange={setWeight} step={item.increment || 1} />
        <Stepper label="Reps" value={reps} onChange={setReps} step={1} decimal={false} />
      </View>
      <View style={styles.entry}>
        <View style={styles.rpe}>
          <TextField placeholder="RPE (optional)" value={rpe} onChangeText={setRpe} keyboardType="decimal-pad" />
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: warmup }}
          onPress={() => setWarmup(!warmup)}
          style={[styles.warmup, { backgroundColor: warmup ? theme.tint : theme.background }]}>
          <ThemedText type="small" style={{ color: warmup ? theme.onTint : theme.text }}>
            Warm-up
          </ThemedText>
        </Pressable>
        <Button title="Log set" onPress={log} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  setIndex: { width: 20, textAlign: 'center' },
  grow: { flex: 1 },
  entry: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-end' },
  rpe: { flex: 1, flexDirection: 'row' },
  warmup: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + Spacing.one, borderRadius: 10 },
});
