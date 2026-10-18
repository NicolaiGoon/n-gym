import { useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { ExerciseImage } from '@/components/exercise-image';
import { ThemedText } from '@/components/themed-text';
import { Chips } from '@/components/ui/chips';
import { ListRow } from '@/components/ui/list-row';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { exercisesQuery, MUSCLE_GROUPS, type Exercise } from '@/db/repo/exercises';
import { useCachedDb } from '@/db/use-db';

const GROUP_OPTIONS = MUSCLE_GROUPS.map((g) => ({ value: g, label: g[0].toUpperCase() + g.slice(1) }));

/** Searchable, filterable exercise library. */
export function ExerciseList({ onSelect, header }: { onSelect: (exercise: Exercise) => void; header?: React.ReactElement }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const exercises = useCachedDb(`exercises:${group}:${query}`, (db) =>
    exercisesQuery(db, { query, muscleGroup: group }).all(),
  );

  return (
    <FlatList
      data={exercises}
      keyExtractor={(e) => String(e.id)}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={12}
      windowSize={7}
      removeClippedSubviews
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <>
          {header}
          <TextField placeholder="Search exercises" value={query} onChangeText={setQuery} autoCorrect={false} />
          <Chips options={GROUP_OPTIONS} value={group} onChange={setGroup} allowNone />
        </>
      }
      ListHeaderComponentStyle={styles.header}
      ListEmptyComponent={<ThemedText themeColor="textSecondary">No exercises match.</ThemedText>}
      renderItem={({ item }) => (
        <ListRow
          title={item.name}
          subtitle={[item.primaryMuscles.length ? item.primaryMuscles.join(', ') : item.muscleGroup, item.equipment]
            .filter(Boolean)
            .join(' · ')}
          leading={<ExerciseImage libraryId={item.libraryId} size={56} />}
          onPress={() => onSelect(item)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two, paddingBottom: Spacing.four },
  header: { gap: Spacing.two, marginBottom: Spacing.one },
});
