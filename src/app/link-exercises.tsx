import { eq } from 'drizzle-orm';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';

import { ExerciseImage } from '@/components/exercise-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { linkToLibrary, unlinkedExercises, type LibraryExercise } from '@/data/library';
import { GOOD_MATCH, similarLibraryExercises } from '@/data/match';
import { db } from '@/db/client';
import { exercises } from '@/db/schema';
import { useDb, write } from '@/db/use-db';

interface Row {
  id: number;
  name: string;
  suggestion: { exercise: LibraryExercise; score: number } | null;
}

/** The exercise already using a library entry, if it isn't a plain library exercise. */
function ownerOf(libraryId: string) {
  const owner = db.select().from(exercises).where(eq(exercises.libraryId, libraryId)).get();
  return owner && owner.source !== 'library' ? owner : undefined;
}

/**
 * Exercises without a library entry, such as ones imported from Jefit, with the closest library
 * exercise for each. Linking gives them a picture and their muscles for the weekly stats.
 */
export default function LinkExercisesScreen() {
  const unlinked = useDb(unlinkedExercises);
  const key = unlinked.map((e) => `${e.id}:${e.name}`).join('|');
  const rows: Row[] = useMemo(
    () => unlinked.map((e) => ({ id: e.id, name: e.name, suggestion: similarLibraryExercises(e.name, 1)[0] ?? null })),
    // The suggestions only depend on which exercises are unlinked and their names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const good = rows.filter((r) => r.suggestion && r.suggestion.score >= GOOD_MATCH && !ownerOf(r.suggestion.exercise.id));

  const link = (row: Row, item: LibraryExercise) => {
    const owner = ownerOf(item.id);
    if (!owner) {
      write((db) => linkToLibrary(db, row.id, item.id));
      return;
    }
    Alert.alert(
      'Merge exercises?',
      `"${owner.name}" already uses "${item.name}". Linking merges its history and routine slots into "${row.name}" and removes it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge', onPress: () => write((db) => linkToLibrary(db, row.id, item.id)) },
      ],
    );
  };

  const linkAll = () =>
    write((db) => {
      for (const row of good) linkToLibrary(db, row.id, row.suggestion!.exercise.id);
    });

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => String(r.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          <ThemedText type="small" themeColor="textSecondary">
            Linking an exercise to the library gives it a picture, instructions and its muscles for the weekly sets per
            muscle. It keeps its name and history.
          </ThemedText>
          {good.length ? <Button title={`Link all ${good.length} close matches`} onPress={linkAll} /> : null}
        </View>
      }
      ListEmptyComponent={<ThemedText themeColor="textSecondary">Every exercise is linked to the library.</ThemedText>}
      renderItem={({ item: row }) => (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">{row.name}</ThemedText>
          {row.suggestion ? (
            <View style={styles.suggestion}>
              <ExerciseImage libraryId={row.suggestion.exercise.id} size={56} />
              <View style={styles.grow}>
                <ThemedText type="small">{row.suggestion.exercise.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {row.suggestion.exercise.primaryMuscles.join(', ')}
                  {row.suggestion.score >= GOOD_MATCH ? ' · close match' : ''}
                </ThemedText>
              </View>
              <Button title="Link" variant="secondary" onPress={() => link(row, row.suggestion!.exercise)} />
            </View>
          ) : null}
          <Button
            title="Choose another"
            variant="secondary"
            onPress={() => router.push({ pathname: '/pick-exercise', params: { linkFor: row.id } })}
          />
        </ThemedView>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two, padding: Spacing.three, paddingBottom: Spacing.five },
  header: { gap: Spacing.two, marginBottom: Spacing.one },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: Spacing.half },
});
