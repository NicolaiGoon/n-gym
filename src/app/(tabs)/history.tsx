import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Calendar } from '@/components/history/calendar';
import { Overview } from '@/components/history/overview';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Chips } from '@/components/ui/chips';
import { ListRow } from '@/components/ui/list-row';
import { Spacing } from '@/constants/theme';
import { getSettings } from '@/db/repo/settings';
import { historyList } from '@/db/stats';
import { useDb } from '@/db/use-db';
import { formatDuration } from '@/hooks/use-now';

type View = 'overview' | 'list' | 'calendar';

const VIEWS: { value: View; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'list', label: 'Workouts' },
  { value: 'calendar', label: 'Calendar' },
];

const open = (id: number) => router.push({ pathname: '/history/[id]', params: { id } });

export default function HistoryScreen() {
  const [view, setView] = useState<View>('overview');
  const rows = useDb((db) => (view === 'list' ? historyList(db) : []));
  const { unit } = useDb(getSettings);

  return (
    <Screen title="History">
      <Chips options={VIEWS} value={view} onChange={(v) => v && setView(v)} />
      <ScrollView contentContainerStyle={styles.content}>
        {view === 'overview' ? <Overview /> : null}
        {view === 'calendar' ? <Calendar onOpenWorkout={open} /> : null}
        {view === 'list' && rows.length === 0 ? (
          <ThemedText themeColor="textSecondary">No finished workouts yet.</ThemedText>
        ) : null}
        {view === 'list'
          ? rows.map((w) => (
              <ListRow
                key={w.id}
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
            ))
          : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.two, paddingBottom: Spacing.four },
});
