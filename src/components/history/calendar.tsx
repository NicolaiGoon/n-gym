import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconButton } from '@/components/ui/list-row';
import { Spacing } from '@/constants/theme';
import { dayKey, workoutDaysInMonth } from '@/db/stats';
import { useDb } from '@/db/use-db';
import { useTheme } from '@/hooks/use-theme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Month grid with workout days highlighted. Tapping a highlighted day opens its workout. */
export function Calendar({ onOpenWorkout }: { onOpenWorkout: (workoutId: number) => void }) {
  const theme = useTheme();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const days = useDb((db) => workoutDaysInMonth(db, month.getFullYear(), month.getMonth()));

  const leading = (month.getDay() + 6) % 7; // Monday first
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  const today = dayKey(new Date());
  const shift = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <IconButton label="‹" accessibilityLabel="Previous month" onPress={() => shift(-1)} />
        <ThemedText type="smallBold">
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · {days.size} workout
          {days.size === 1 ? '' : 's'}
        </ThemedText>
        <IconButton label="›" accessibilityLabel="Next month" onPress={() => shift(1)} />
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((d, i) => (
          <View key={`h${i}`} style={styles.cell}>
            <ThemedText type="small" themeColor="textSecondary">
              {d}
            </ThemedText>
          </View>
        ))}
        {cells.map((date, i) => {
          if (!date) return <View key={`e${i}`} style={styles.cell} />;
          const key = dayKey(date);
          const ids = days.get(key);
          return (
            <Pressable
              key={key}
              disabled={!ids}
              onPress={() => ids && onOpenWorkout(ids[ids.length - 1])}
              accessibilityLabel={ids ? `Workout on ${date.toDateString()}` : undefined}
              style={styles.cell}>
              <View
                style={[
                  styles.day,
                  ids ? { backgroundColor: theme.tint } : null,
                  key === today && !ids ? { borderColor: theme.tint, borderWidth: 1 } : null,
                ]}>
                <ThemedText type="small" style={ids ? { color: theme.onTint } : undefined}>
                  {date.getDate()}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: Spacing.one },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
