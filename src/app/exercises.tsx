import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { SectionList, StyleSheet } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { listExercises } from '@/db/queries';

export default function ExercisesScreen() {
  const { data } = useLiveQuery(listExercises(db));

  const sections = Object.entries(Object.groupBy(data, (e) => e.muscleGroup)).map(([group, items]) => ({
    title: group,
    data: items ?? [],
  }));

  return (
    <Screen title="Exercises">
      <SectionList
        sections={sections}
        keyExtractor={(e) => String(e.id)}
        renderSectionHeader={({ section }) => (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.header}>
            {section.title.toUpperCase()}
          </ThemedText>
        )}
        renderItem={({ item }) => (
          <ThemedView type="backgroundElement" style={styles.row}>
            <ThemedText type="small">{item.name}</ThemedText>
            {item.equipment ? (
              <ThemedText type="small" themeColor="textSecondary">
                {item.equipment}
              </ThemedText>
            ) : null}
          </ThemedView>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: Spacing.three, marginBottom: Spacing.one },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
    marginBottom: Spacing.one,
  },
});
