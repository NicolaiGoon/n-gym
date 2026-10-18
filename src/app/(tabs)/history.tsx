import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet } from 'react-native';

import { Calendar } from '@/components/history/calendar';
import { Overview } from '@/components/history/overview';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Chips } from '@/components/ui/chips';
import { ListRow } from '@/components/ui/list-row';
import { Spacing } from '@/constants/theme';
import { getSettings } from '@/db/repo/settings';
import { historyList, type HistoryRow } from '@/db/stats';
import { useCachedDb, useDb } from '@/db/use-db';
import { formatDuration } from '@/hooks/use-now';

type View = 'overview' | 'list' | 'calendar';

const VIEWS: { value: View; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'list', label: 'Workouts' },
  { value: 'calendar', label: 'Calendar' },
];

const open = (id: number) => router.push({ pathname: '/history/[id]', params: { id } });

/** Workouts load in pages as you scroll, so years of history stay quick. */
const PAGE = 40;

function WorkoutRow({ workout: w, unit }: { workout: HistoryRow; unit: string }) {
  return (
    <ListRow
      title={`${w.startedAt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${w.dayName ? ` · ${w.dayName}` : ''}`}
      subtitle={[
        w.finishedAt ? formatDuration((w.finishedAt.getTime() - w.startedAt.getTime()) / 1000) : null,
        `${w.exerciseCount} exercises`,
        `${w.setCount} sets`,
        `${Math.round(w.volume).toLocaleString()} ${unit}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      onPress={() => open(w.id)}
    />
  );
}

function WorkoutList() {
  const [limit, setLimit] = useState(PAGE);
  const rows = useCachedDb(`history:${limit}`, (db) => historyList(db, limit));
  const { unit } = useDb(getSettings);
  return (
    <FlatList
      data={rows}
      keyExtractor={(w) => String(w.id)}
      renderItem={({ item }) => <WorkoutRow workout={item} unit={unit} />}
      contentContainerStyle={styles.content}
      onEndReached={() => rows.length === limit && setLimit(limit + PAGE)}
      onEndReachedThreshold={0.5}
      initialNumToRender={12}
      windowSize={7}
      removeClippedSubviews
      ListEmptyComponent={<ThemedText themeColor="textSecondary">No finished workouts yet.</ThemedText>}
    />
  );
}

export default function HistoryScreen() {
  const [view, setView] = useState<View>('overview');

  return (
    <Screen title="History">
      <Chips options={VIEWS} value={view} onChange={(v) => v && setView(v)} />
      {view === 'list' ? (
        <WorkoutList />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {view === 'overview' ? <Overview /> : <Calendar onOpenWorkout={open} />}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.two, paddingBottom: Spacing.four },
});
