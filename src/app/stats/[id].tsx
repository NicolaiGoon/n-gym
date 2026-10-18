import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts/line-chart';
import { ExerciseImage } from '@/components/exercise-image';
import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Spacing } from '@/constants/theme';
import { libraryExercise, musclesOf } from '@/data/library';
import { exerciseHistory } from '@/db/queries';
import { getExercise } from '@/db/repo/exercises';
import { getSettings } from '@/db/repo/settings';
import { exerciseRecords, exerciseSessions, type SessionPoint } from '@/db/stats';
import { useCachedDb, useDb } from '@/db/use-db';
import { isStalled } from '@/progression';

type Metric = 'oneRepMax' | 'topWeight' | 'volume';
type Range = '3m' | '1y' | 'all';

const RANGES: { value: Range; label: string }[] = [
  { value: '3m', label: '3 months' },
  { value: '1y', label: '1 year' },
  { value: 'all', label: 'All' },
];

const rangeStart = (range: Range) => {
  const days = range === '3m' ? 91 : range === '1y' ? 365 : null;
  return days === null ? 0 : Date.now() - days * 24 * 3600 * 1000;
};

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
  const sessions = useCachedDb(`sessions:${id}`, (db) => exerciseSessions(db, id));
  const stalled = useCachedDb(`stalled:${id}`, (db) => isStalled(exerciseHistory(db, id)));
  const { unit } = useDb(getSettings);
  const [metric, setMetric] = useState<Metric>('oneRepMax');
  const [showSteps, setShowSteps] = useState(false);
  const [range, setRange] = useState<Range>('1y');

  if (!exercise) return <Page>{null}</Page>;
  const records = exerciseRecords(sessions);
  const round = (v: number) => Math.round(v * 10) / 10;
  const library = libraryExercise(exercise.libraryId);
  const muscles = musclesOf(exercise);

  const since = rangeStart(range);
  const shown = sessions.filter((s) => s.date.getTime() >= since);
  const log = [...sessions].reverse();

  const header = (
    <View style={styles.header}>
      {library?.image ? <ExerciseImage libraryId={exercise.libraryId} size="wide" /> : null}
      {muscles.primary.length ? (
        <ThemedText type="small" themeColor="textSecondary">
          Works {muscles.primary.join(', ')}
          {muscles.secondary.length ? `, helped by ${muscles.secondary.join(', ')}` : ''}.
        </ThemedText>
      ) : null}
      {library?.instructions.length ? (
        showSteps ? (
          <View style={styles.steps}>
            {library.instructions.map((step, i) => (
              <ThemedText key={i} type="small">
                {i + 1}. {step}
              </ThemedText>
            ))}
          </View>
        ) : (
          <Button title="How to do it" variant="secondary" onPress={() => setShowSteps(true)} />
        )
      ) : null}
      {exercise.notes ? (
        <ThemedText type="small" themeColor="textSecondary">
          {exercise.notes}
        </ThemedText>
      ) : null}

      {sessions.length === 0 ? (
        <ThemedText themeColor="textSecondary">No logged sessions yet.</ThemedText>
      ) : (
        <>
          {stalled ? (
            <ThemedText type="small" themeColor="textSecondary">
              ⚠ Stalled: your best estimated 1RM hasn’t improved over the last 3 sessions.
            </ThemedText>
          ) : null}
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
          <Chips options={RANGES} value={range} onChange={(r) => r && setRange(r)} />
          <LineChart
            points={(shown.length > 1 ? shown : sessions).map((s) => ({ date: s.date, value: metricValue(s, metric) }))}
            format={(v) => `${metric === 'volume' ? Math.round(v).toLocaleString() : round(v)} ${unit}`}
          />

          <ThemedText type="smallBold" themeColor="textSecondary">
            LOG · {sessions.length} SESSION{sessions.length === 1 ? '' : 'S'}
          </ThemedText>
        </>
      )}
    </View>
  );

  return (
    <Page scroll={false}>
      <Stack.Screen options={{ title: exercise.name }} />
      <FlatList
        data={log}
        keyExtractor={(s) => String(s.workoutId)}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={styles.headerSpacing}
        contentContainerStyle={styles.list}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
        renderItem={({ item: s }) => (
          <Pressable onPress={() => router.push({ pathname: '/history/[id]', params: { id: s.workoutId } })}>
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
        )}
        ListFooterComponent={
          <Button
            title="Edit exercise"
            variant="secondary"
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id } })}
          />
        }
        ListFooterComponentStyle={styles.footer}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.three },
  headerSpacing: { marginBottom: Spacing.two },
  list: { gap: Spacing.two, paddingBottom: Spacing.four },
  footer: { marginTop: Spacing.two },
  steps: { gap: Spacing.one },
  records: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  record: { flexBasis: '45%', flexGrow: 1, padding: Spacing.three, borderRadius: 12, gap: Spacing.half },
  session: { padding: Spacing.three, borderRadius: 12, gap: Spacing.one },
});
