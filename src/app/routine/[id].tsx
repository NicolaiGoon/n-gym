import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

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
import { useDb, write } from '@/db/use-db';

type Dialog = { kind: 'rename' } | { kind: 'add-day' } | null;

export default function RoutineScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const routine = useDb((db) => getRoutine(db, id));
  const days = useDb((db) => daysQuery(db, id).all());
  const [dialog, setDialog] = useState<Dialog>(null);

  if (!routine) return <Page>{null}</Page>;

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

      <View style={styles.footer}>
        <Button title="Rename" variant="secondary" onPress={() => setDialog({ kind: 'rename' })} />
        <Button
          title={routine.archived ? 'Unarchive' : 'Archive'}
          variant="secondary"
          onPress={() => write((db) => setRoutineArchived(db, id, !routine.archived))}
        />
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
  row: { flexDirection: 'row' },
  footer: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', marginTop: Spacing.three },
});
