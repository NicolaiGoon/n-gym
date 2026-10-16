import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { FlatList, StyleSheet } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { routines } from '@/db/schema';

export default function WorkoutScreen() {
  const { data } = useLiveQuery(db.select().from(routines));

  return (
    <Screen title="Workout">
      <FlatList
        data={data}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <ThemedText themeColor="textSecondary">
            No routines yet. Create one here, import from Jefit, or ask the Coach to build one.
          </ThemedText>
        }
        renderItem={({ item }) => (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{item.name}</ThemedText>
            {item.notes ? <ThemedText type="small">{item.notes}</ThemedText> : null}
          </ThemedView>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  card: { padding: Spacing.three, borderRadius: 12, gap: Spacing.one },
});
