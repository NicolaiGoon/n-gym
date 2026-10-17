import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { getPendingRestore, setPendingRestore } from '@/backup/files';
import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { backupCounts, restoreMerge, restoreReplace } from '@/db/backup';
import { write } from '@/db/use-db';
import { skipRest } from '@/workout/rest-timer';

const formatDate = (date: Date | null) => (date ? date.toLocaleDateString() : '–');

export default function RestoreScreen() {
  const [backup] = useState(getPendingRestore);
  if (!backup) {
    return (
      <Page>
        <ThemedText themeColor="textSecondary">No backup selected.</ThemedText>
      </Page>
    );
  }
  const counts = backupCounts(backup);

  const done = (message: string) => {
    setPendingRestore(null);
    Alert.alert('Restore complete', message);
    router.back();
  };

  const merge = () => {
    let result: ReturnType<typeof restoreMerge> | undefined;
    if (!write((db) => (result = restoreMerge(db, backup))) || !result) return;
    done(
      `Added ${result.workoutsAdded} workouts, ${result.routinesAdded} routines and ${result.exercisesAdded} exercises.` +
        (result.workoutsSkipped ? ` Skipped ${result.workoutsSkipped} workouts that were already here.` : ''),
    );
  };

  const replace = () =>
    Alert.alert('Replace everything?', 'All data currently in the app will be deleted and replaced by this backup.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Replace',
        style: 'destructive',
        onPress: () => {
          skipRest();
          if (write((db) => restoreReplace(db, backup))) done('The app now contains exactly what was in the backup.');
        },
      },
    ]);

  return (
    <Page>
      <ThemedText type="smallBold">Backup from {new Date(backup.exportedAt).toLocaleString()}</ThemedText>
      <ThemedText type="small">
        {counts.workouts} workouts ({formatDate(counts.firstWorkout)} to {formatDate(counts.lastWorkout)}), {counts.sets}{' '}
        sets, {counts.routines} routines, {counts.exercises} exercises.
      </ThemedText>
      <Button title="Add to my data" onPress={merge} />
      <ThemedText type="small" themeColor="textSecondary">
        Keeps everything you have. Exercises are matched by name, routines are added as copies, and workouts that are
        already here are skipped. Your settings stay as they are.
      </ThemedText>
      <Button title="Replace everything" variant="danger" onPress={replace} />
      <ThemedText type="small" themeColor="textSecondary">
        Deletes what is in the app now and restores the backup exactly, settings included.
      </ThemedText>
    </Page>
  );
}
