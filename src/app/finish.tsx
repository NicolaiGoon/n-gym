import { router } from 'expo-router';
import { useState } from 'react';

import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { SummaryView } from '@/components/workout/summary-view';
import { getSettings } from '@/db/repo/settings';
import { finishWorkout, getActiveWorkout, workoutSummary } from '@/db/repo/workouts';
import { useDb, write } from '@/db/use-db';
import { skipRest } from '@/workout/rest-timer';

export default function FinishScreen() {
  const workout = useDb(getActiveWorkout);
  const summary = useDb((db) => (workout ? workoutSummary(db, workout.id) : undefined));
  const { unit } = useDb(getSettings);
  const [notes, setNotes] = useState('');

  if (!workout || !summary) {
    return (
      <Page>
        <ThemedText themeColor="textSecondary">No workout in progress.</ThemedText>
      </Page>
    );
  }

  const save = () => {
    if (!write((db) => finishWorkout(db, workout.id, notes))) return;
    skipRest();
    router.dismissAll();
    router.push({ pathname: '/summary/[id]', params: { id: workout.id } });
  };

  return (
    <Page>
      <SummaryView summary={summary} unit={unit} />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="How did it go?" />
      <ThemedText type="small" themeColor="textSecondary">
        Exercises with no logged sets are left out.
      </ThemedText>
      <Button title="Save workout" onPress={save} />
    </Page>
  );
}
