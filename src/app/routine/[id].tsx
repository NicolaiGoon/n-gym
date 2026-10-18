import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { MuscleSets } from '@/components/charts/muscle-sets';
import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { IconButton, ListRow } from '@/components/ui/list-row';
import { NameDialog } from '@/components/ui/name-dialog';
import { Spacing } from '@/constants/theme';
import {
  addDay,
  daysQuery,
  deleteRoutine,
  getRoutine,
  moveDay,
  setRoutineArchived,
  updateRoutine,
} from '@/db/repo/routines';
import { getActiveRoutine, setActiveRoutine } from '@/db/repo/program';
import { startWorkout } from '@/db/repo/workouts';
import { plannedSetsPerMuscle } from '@/db/stats';
import { useCachedDb, useDb, write } from '@/db/use-db';

type Dialog = { kind: 'rename' } | { kind: 'add-day' } | null;

export default function RoutineScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const routine = useDb((db) => getRoutine(db, id));
  const days = useDb((db) => daysQuery(db, id).all());
  const weekly = useCachedDb(`plannedSets:${id}`, (db) => plannedSetsPerMuscle(db, id));
  const isActive = useDb((db) => getActiveRoutine(db)?.id === id);
  const [dialog, setDialog] = useState<Dialog>(null);

  if (!routine) return <Page>{null}</Page>;

  const start = (dayId: number) => {
    if (write((db) => startWorkout(db, dayId))) router.push('/workout');
  };

  const confirmDelete = () =>
    Alert.alert('Delete routine?', `"${routine.name}" and its days will be deleted. Logged workouts are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => write((db) => deleteRoutine(db, id)) && router.back(),
      },
    ]);

  return (
    <Page>
      <Stack.Screen options={{ title: routine.name }} />
      {isActive ? (
        <ThemedText type="small" themeColor="textSecondary">
          This is your active program. The Workout tab shows which day is next.
        </ThemedText>
      ) : (
        <Button title="Set as active program" onPress={() => write((db) => setActiveRoutine(db, id))} />
      )}

      <ThemedText type="smallBold" themeColor="textSecondary">
        DAYS
      </ThemedText>
      {days.length === 0 ? (
        <ThemedText themeColor="textSecondary">Add a day, e.g. Push A, then add exercises to it.</ThemedText>
      ) : null}
      {days.map((day, index) => (
        <ListRow
          key={day.id}
          title={day.name}
          subtitle={`${day.exerciseCount} exercise${day.exerciseCount === 1 ? '' : 's'}`}
          onPress={() => router.push({ pathname: '/day/[id]', params: { id: day.id } })}
          trailing={
            <View style={styles.row}>
              {day.exerciseCount > 0 ? <Button title="Start" onPress={() => start(day.id)} /> : null}
              {index > 0 ? (
                <IconButton label="↑" accessibilityLabel="Move up" onPress={() => write((db) => moveDay(db, day.id, 'up'))} />
              ) : null}
              {index < days.length - 1 ? (
                <IconButton label="↓" accessibilityLabel="Move down" onPress={() => write((db) => moveDay(db, day.id, 'down'))} />
              ) : null}
            </View>
          }
        />
      ))}
      <Button title="Add day" onPress={() => setDialog({ kind: 'add-day' })} />

      {weekly.length ? (
        <>
          <ThemedText type="smallBold" themeColor="textSecondary">
            WEEKLY SETS PER MUSCLE
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            If you train each day once a week. Half a set is counted for muscles that only help.
          </ThemedText>
          <MuscleSets totals={weekly} empty="" />
        </>
      ) : null}

      <View style={styles.footer}>
        <Button title="Rename" variant="secondary" onPress={() => setDialog({ kind: 'rename' })} />
        <Button
          title={routine.archived ? 'Unarchive' : 'Archive'}
          variant="secondary"
          onPress={() => write((db) => setRoutineArchived(db, id, !routine.archived))}
        />
        {isActive ? (
          <Button title="Stop following" variant="secondary" onPress={() => write((db) => setActiveRoutine(db, null))} />
        ) : null}
        <Button title="Delete" variant="danger" onPress={confirmDelete} />
      </View>

      <NameDialog
        key={dialog?.kind ?? 'closed'}
        visible={dialog !== null}
        title={dialog?.kind === 'rename' ? 'Rename routine' : 'New day'}
        initialValue={dialog?.kind === 'rename' ? routine.name : ''}
        placeholder={dialog?.kind === 'add-day' ? 'e.g. Push A' : undefined}
        onCancel={() => setDialog(null)}
        onSubmit={(name) => {
          const ok = write((db) =>
            dialog?.kind === 'rename' ? updateRoutine(db, id, { name }) : addDay(db, id, name),
          );
          if (ok) setDialog(null);
        }}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  footer: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', marginTop: Spacing.three },
});
