import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { deleteSet, updateSet, type WorkoutSet } from '@/db/repo/workouts';
import { write } from '@/db/use-db';

/** Edits or deletes a logged set. Render with `key={set.id}` so the fields start from the set. */
export function SetEditDialog({ set, unit, onClose }: { set: WorkoutSet | null; unit: string; onClose: () => void }) {
  const [weight, setWeight] = useState(String(set?.weight ?? ''));
  const [reps, setReps] = useState(String(set?.reps ?? ''));
  const [rpe, setRpe] = useState(set?.rpe == null ? '' : String(set.rpe));
  const [warmup, setWarmup] = useState(set?.isWarmup ?? false);
  if (!set) return null;

  const save = () => {
    const ok = write((db) =>
      updateSet(db, set.id, {
        weight: Number(weight),
        reps: Number(reps),
        rpe: rpe.trim() ? Number(rpe) : null,
        isWarmup: warmup,
      }),
    );
    if (ok) onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable>
          <ThemedView style={styles.dialog}>
            <ThemedText type="smallBold">Edit set</ThemedText>
            <View style={styles.row}>
              <NumberField label={`Weight (${unit})`} value={weight} onChangeValue={setWeight} />
              <NumberField label="Reps" value={reps} onChangeValue={setReps} keyboardType="number-pad" />
              <NumberField label="RPE" value={rpe} onChangeValue={setRpe} />
            </View>
            <Button
              title={warmup ? 'Warm-up set' : 'Working set'}
              variant="secondary"
              onPress={() => setWarmup(!warmup)}
            />
            <View style={styles.row}>
              <Button
                title="Delete"
                variant="danger"
                onPress={() => write((db) => deleteSet(db, set.id)) && onClose()}
              />
              <View style={styles.grow} />
              <Button title="Cancel" variant="secondary" onPress={onClose} />
              <Button title="Save" onPress={save} />
            </View>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.four },
  dialog: { borderRadius: 16, padding: Spacing.four, gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.two },
  grow: { flex: 1 },
});
