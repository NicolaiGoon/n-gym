import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { WorkoutSummary } from '@/db/repo/workouts';
import { formatDuration } from '@/hooks/use-now';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </ThemedView>
  );
}

export function SummaryView({ summary, unit }: { summary: WorkoutSummary; unit: string }) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.grid}>
        <Stat label="Duration" value={formatDuration(summary.durationSeconds)} />
        <Stat label="Exercises" value={String(summary.exerciseCount)} />
        <Stat label="Working sets" value={String(summary.setCount)} />
        <Stat label="Volume" value={`${Math.round(summary.volume).toLocaleString()} ${unit}`} />
      </View>
      {summary.records.length ? (
        <View style={styles.records}>
          <ThemedText type="smallBold">Personal records</ThemedText>
          {summary.records.map((record) => (
            <ThemedText key={record.exerciseId} type="small">
              {record.name}: estimated 1RM {record.oneRepMax} {unit} (was {record.previous})
            </ThemedText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stat: { flexBasis: '45%', flexGrow: 1, padding: Spacing.three, borderRadius: 12, gap: Spacing.half },
  records: { gap: Spacing.one },
});
