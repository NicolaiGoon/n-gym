import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts/line-chart';
import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Spacing } from '@/constants/theme';
import { getExercise } from '@/db/repo/exercises';
import { getSettings } from '@/db/repo/settings';
import { exerciseRecords, exerciseSessions, type SessionPoint } from '@/db/stats';
import { useDb } from '@/db/use-db';

type Metric = 'oneRepMax' | 'topWeight' | 'volume';

const METRICS: { value: Metric; label: string }[] = [
  { value: 'oneRepMax', label: 'Est. 1RM' },
  { value: 'topWeight', label: 'Top weight' },
  { value: 'volume', label: 'Volume' },
];

const metricValue = (s: SessionPoint, metric: Metric) =>
  metric === 'oneRepMax' ? s.bestOneRepMax : metric === 'topWeight' ? s.topWeight : s.volume;

const formatDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function Record({ label, value, date }: { label: string; value: string; date?: Date }) {
  return (
    <ThemedView type="backgroundElement" style={styles.record}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
      {date ? (
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(date)}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

/** Progress, records and the full log of one exercise. */
export default function ExerciseStatsScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const exercise = useDb((db) => getExercise(db, id));
  const sessions = useDb((db) => exerciseSessions(db, id));
  const { unit } = useDb(getSettings);
  const [metric, setMetric] = useState<Metric>('oneRepMax');

  if (!exercise) return <Page>{null}</Page>;
  const records = exerciseRecords(sessions);
  const round = (v: number) => Math.round(v * 10) / 10;

  return (
    <Page>
      <Stack.Screen options={{ title: exercise.name }} />

      {sessions.length === 0 ? (
        <ThemedText themeColor="textSecondary">No logged sessions yet.</ThemedText>
      ) : (
        <>
          <View style={styles.records}>
            {records.bestOneRepMax ? (
              <Record
                label="Best est. 1RM"
                value={`${round(records.bestOneRepMax.value)} ${unit}`}
                date={records.bestOneRepMax.date}
              />
            ) : null}
            {records.heaviest ? (
              <Record
                label="Heaviest"
                value={`${records.heaviest.weight} ${unit} × ${records.heaviest.reps}`}
                date={records.heaviest.date}
              />
            ) : null}
            {records.bestVolume ? (
              <Record
                label="Best session volume"
                value={`${Math.round(records.bestVolume.value).toLocaleString()} ${unit}`}
                date={records.bestVolume.date}
              />
            ) : null}
            <Record label="Sessions" value={String(records.sessionCount)} />
          </View>

          <Chips options={METRICS} value={metric} onChange={(m) => m && setMetric(m)} />
          <LineChart
            points={sessions.map((s) => ({ date: s.date, value: metricValue(s, metric) }))}
            format={(v) => `${metric === 'volume' ? Math.round(v).toLocaleString() : round(v)} ${unit}`}
          />

          <ThemedText type="smallBold" themeColor="textSecondary">
            LOG
          </ThemedText>
          {[...sessions].reverse().map((s) => (
            <Pressable
              key={s.workoutId}
              onPress={() => router.push({ pathname: '/history/[id]', params: { id: s.workoutId } })}>
              <ThemedView type="backgroundElement" style={styles.session}>
                <ThemedText type="smallBold">{formatDate(s.date)}</ThemedText>
                <ThemedText type="small">
                  {s.sets
                    .map((set) => `${set.isWarmup ? 'W ' : ''}${set.weight}×${set.reps}${set.rpe ? ` @${set.rpe}` : ''}`)
                    .join(',  ')}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Est. 1RM {round(s.bestOneRepMax)} · volume {Math.round(s.volume).toLocaleString()} {unit}
                </ThemedText>
              </ThemedView>
            </Pressable>
          ))}
        </>
      )}

      <Button
        title="Edit exercise"
        variant="secondary"
        onPress={() => router.push({ pathname: '/exercise/[id]', params: { id } })}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  records: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  record: { flexBasis: '45%', flexGrow: 1, padding: Spacing.three, borderRadius: 12, gap: Spacing.half },
  session: { padding: Spacing.three, borderRadius: 12, gap: Spacing.one },
});
