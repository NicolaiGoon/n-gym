import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { IconButton, ListRow } from '@/components/ui/list-row';
import { NameDialog } from '@/components/ui/name-dialog';
import { Spacing } from '@/constants/theme';
import { getSettings } from '@/db/repo/settings';
import { deleteDay, getDay, moveSlot, removeSlot, renameDay, slotsQuery } from '@/db/repo/routines';
import { useDb, write } from '@/db/use-db';
import { describeRule } from '@/progression';

export default function DayScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const day = useDb((db) => getDay(db, id));
  const slots = useDb((db) => slotsQuery(db, id).all());
  const { unit } = useDb(getSettings);
  const [renaming, setRenaming] = useState(false);

  if (!day) return <Page>{null}</Page>;

  const confirmDelete = () =>
    Alert.alert('Delete day?', `"${day.name}" and its exercise list will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => write((db) => deleteDay(db, id)) && router.back() },
    ]);

  return (
    <Page>
      <Stack.Screen options={{ title: day.name }} />

      {slots.length === 0 ? <ThemedText themeColor="textSecondary">No exercises yet.</ThemedText> : null}
      {slots.map((slot, index) => (
        <ListRow
          key={slot.id}
          title={slot.name}
          subtitle={`${describeRule(slot.rule)} · start ${slot.startWeight} ${unit} · rest ${slot.restSeconds}s`}
          onPress={() => router.push({ pathname: '/slot/[id]', params: { id: slot.id } })}
          trailing={
            <View style={styles.row}>
              {index > 0 ? (
                <IconButton label="↑" accessibilityLabel="Move up" onPress={() => write((db) => moveSlot(db, slot.id, 'up'))} />
              ) : null}
              {index < slots.length - 1 ? (
                <IconButton label="↓" accessibilityLabel="Move down" onPress={() => write((db) => moveSlot(db, slot.id, 'down'))} />
              ) : null}
              <IconButton label="✕" accessibilityLabel="Remove" onPress={() => write((db) => removeSlot(db, slot.id))} />
            </View>
          }
        />
      ))}
      <Button title="Add exercise" onPress={() => router.push({ pathname: '/pick-exercise', params: { dayId: id } })} />

      <View style={styles.footer}>
        <Button title="Rename" variant="secondary" onPress={() => setRenaming(true)} />
        <Button title="Delete day" variant="danger" onPress={confirmDelete} />
      </View>

      <NameDialog
        key={String(renaming)}
        visible={renaming}
        title="Rename day"
        initialValue={day.name}
        onCancel={() => setRenaming(false)}
        onSubmit={(name) => write((db) => renameDay(db, id, name)) && setRenaming(false)}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  footer: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
});
