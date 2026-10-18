import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const label = (muscle: string) => muscle[0].toUpperCase() + muscle.slice(1);
const format = (sets: number) => String(Math.round(sets * 2) / 2);

/** Horizontal bars of sets per muscle, most first. */
export function MuscleSets({ totals, empty }: { totals: { muscle: string; sets: number }[]; empty: string }) {
  const theme = useTheme();
  if (totals.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {empty}
      </ThemedText>
    );
  }
  const max = Math.max(1, ...totals.map((t) => t.sets));
  return (
    <View style={styles.list}>
      {totals.map((t) => (
        <View key={t.muscle} style={styles.row} accessible accessibilityLabel={`${label(t.muscle)}: ${format(t.sets)} sets`}>
          <ThemedText type="small" style={styles.name}>
            {label(t.muscle)}
          </ThemedText>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(t.sets / max) * 100}%`, backgroundColor: theme.tint }]} />
          </View>
          <ThemedText type="small" style={styles.count}>
            {format(t.sets)}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { width: 96 },
  track: { flex: 1, height: 8 },
  fill: { height: 8, borderRadius: 4 },
  count: { width: 32, textAlign: 'right' },
});
