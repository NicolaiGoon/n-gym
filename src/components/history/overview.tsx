import { StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/charts/bar-chart';
import { LineChart } from '@/components/charts/line-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getSettings } from '@/db/repo/settings';
import { bodyWeights, setsPerMuscleGroup, weekStreak, weeklyTotals } from '@/db/stats';
import { useDb } from '@/db/use-db';
import { useTheme } from '@/hooks/use-theme';

const short = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** This week, streak, weekly volume and sets per muscle group. */
export function Overview() {
  const theme = useTheme();
  const { unit } = useDb(getSettings);
  const weeks = useDb((db) => weeklyTotals(db, 12));
  const streak = useDb((db) => weekStreak(db));
  const groups = useDb((db) => setsPerMuscleGroup(db));
  const weights = useDb(bodyWeights);
  const thisWeek = weeks[weeks.length - 1];
  const maxSets = Math.max(1, ...groups.map((g) => g.sets));

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

      <ThemedText type="smallBold">Working sets, last 7 days</ThemedText>
      {groups.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No sets in the last 7 days.
        </ThemedText>
      ) : null}
      {groups.map((g) => (
        <View key={g.muscleGroup} style={styles.groupRow}>
          <ThemedText type="small" style={styles.groupName}>
            {g.muscleGroup[0].toUpperCase() + g.muscleGroup.slice(1)}
          </ThemedText>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(g.sets / maxSets) * 100}%`, backgroundColor: theme.tint }]} />
          </View>
          <ThemedText type="small" style={styles.count}>
            {g.sets}
          </ThemedText>
        </View>
      ))}

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
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  groupName: { width: 80 },
  track: { flex: 1, height: 8 },
  fill: { height: 8, borderRadius: 4 },
  count: { width: 28, textAlign: 'right' },
});
