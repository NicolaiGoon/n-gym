import { FlatList, StyleSheet } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { listWorkouts } from '@/db/queries';
import { useDb } from '@/db/use-db';

export default function HistoryScreen() {
  const data = useDb((db) => listWorkouts(db).all());

  return (
    <Screen title="History">
      <FlatList
        data={data}
        keyExtractor={(w) => String(w.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<ThemedText themeColor="textSecondary">No finished workouts yet.</ThemedText>}
        renderItem={({ item }) => (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{item.startedAt.toLocaleDateString()}</ThemedText>
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
