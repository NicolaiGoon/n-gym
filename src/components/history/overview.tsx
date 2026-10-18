import { StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/charts/bar-chart';
import { LineChart } from '@/components/charts/line-chart';
import { MuscleSets } from '@/components/charts/muscle-sets';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getSettings } from '@/db/repo/settings';
import { bodyWeights, setsPerMuscle, weekStreak, weeklyTotals } from '@/db/stats';
import { useCachedDb, useDb } from '@/db/use-db';

const short = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** This week, streak, weekly volume and sets per muscle. */
export function Overview() {
  const { unit } = useDb(getSettings);
  const weeks = useCachedDb('weeklyTotals:12', (db) => weeklyTotals(db, 12));
  const streak = useCachedDb('weekStreak', (db) => weekStreak(db));
  const groups = useCachedDb('setsPerMuscle', (db) => setsPerMuscle(db));
  const weights = useCachedDb('bodyWeights', bodyWeights);
  const thisWeek = weeks[weeks.length - 1];
  
  return (
    <View style={styles.wrapper}>
      <View style={styles.tiles}>
        <ThemedView type="backgroundElement" style={styles.tile}>
          <ThemedText type="small" themeColor="textSecondary">
            This week
          </ThemedText>
          <ThemedText type="smallBold">
            {thisWeek.workouts} workout{thisWeek.workouts === 1 ? '' : 's'}
          </ThemedText>
        </ThemedView>
        <ThemedView type="backgroundElement" style={styles.tile}>
          <ThemedText type="small" themeColor="textSecondary">
            Streak
          </ThemedText>
          <ThemedText type="smallBold">
            {streak} week{streak === 1 ? '' : 's'}
          </ThemedText>
        </ThemedView>
      </View>

      <ThemedText type="smallBold">Weekly volume</ThemedText>
      <BarChart
        bars={weeks.map((w) => ({
          label: short(w.weekStart),
          value: w.volume,
          detail: `Week of ${short(w.weekStart)} · ${w.workouts} workout${w.workouts === 1 ? '' : 's'} · ${Math.round(w.volume).toLocaleString()} ${unit}`,
        }))}
      />

      <ThemedText type="smallBold">Working sets per muscle, last 7 days</ThemedText>
      <MuscleSets totals={groups} empty="No sets in the last 7 days." />
      <ThemedText type="small" themeColor="textSecondary">
        Sets count fully for the main muscles of each exercise and as half a set for the muscles that help.
      </ThemedText>

      {weights.length > 1 ? (
        <>
          <ThemedText type="smallBold">Body weight</ThemedText>
          <LineChart points={weights} format={(v) => `${Math.round(v * 10) / 10} ${unit}`} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.three },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, padding: Spacing.three, borderRadius: 12, gap: Spacing.half },
});
