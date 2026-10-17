import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ListRow } from '@/components/ui/list-row';
import { NameDialog } from '@/components/ui/name-dialog';
import { Spacing } from '@/constants/theme';
import { createRoutine, routinesQuery } from '@/db/repo/routines';
import { getActiveWorkout, startWorkout } from '@/db/repo/workouts';
import { useDb, write } from '@/db/use-db';

export default function WorkoutScreen() {
  const routines = useDb((db) => routinesQuery(db).all());
  const active = useDb(getActiveWorkout);
  const [creating, setCreating] = useState(false);

  const startEmpty = () => {
    if (write((db) => startWorkout(db, null))) router.push('/workout');
  };

  return (
    <Screen title="Workout">
      {active ? (
        <ListRow
          title="Workout in progress"
          subtitle={`Started at ${active.startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          onPress={() => router.push('/workout')}
          trailing={<Button title="Resume" onPress={() => router.push('/workout')} />}
        />
      ) : (
        <Button title="Start empty workout" variant="secondary" onPress={startEmpty} />
      )}
      <View style={styles.actions}>
        <Button title="New routine" onPress={() => setCreating(true)} style={styles.grow} />
        <Button title="Settings" variant="secondary" onPress={() => router.push('/settings')} />
      </View>
      <FlatList
        data={routines}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <ThemedText themeColor="textSecondary">
            No routines yet. Create one, then start a workout from one of its days.
          </ThemedText>
        }
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={item.archived ? 'Archived' : item.notes}
            dimmed={item.archived}
            onPress={() => router.push({ pathname: '/routine/[id]', params: { id: item.id } })}
          />
        )}
      />
      <NameDialog
        key={String(creating)}
        visible={creating}
        title="New routine"
        placeholder="e.g. Push / Pull / Legs"
        onCancel={() => setCreating(false)}
        onSubmit={(name) => {
          let id = 0;
          if (write((db) => (id = createRoutine(db, name)))) {
            setCreating(false);
            router.push({ pathname: '/routine/[id]', params: { id } });
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Spacing.two },
  grow: { flex: 1 },
  list: { gap: Spacing.two },
});
