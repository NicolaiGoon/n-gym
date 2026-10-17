import { router, useLocalSearchParams } from 'expo-router';

import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { SummaryView } from '@/components/workout/summary-view';
import { getSettings } from '@/db/repo/settings';
import { getWorkout, workoutSummary } from '@/db/repo/workouts';
import { useDb } from '@/db/use-db';

export default function SummaryScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const workout = useDb((db) => getWorkout(db, id));
  const summary = useDb((db) => (workout ? workoutSummary(db, id) : undefined));
  const { unit } = useDb(getSettings);

  if (!workout || !summary) return <Page>{null}</Page>;

  return (
    <Page>
      <ThemedText type="subtitle">Workout saved</ThemedText>
      <SummaryView summary={summary} unit={unit} />
      {workout.notes ? <ThemedText type="small">{workout.notes}</ThemedText> : null}
      <Button title="Done" onPress={() => router.back()} />
    </Page>
  );
}
