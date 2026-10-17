import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { formatDuration, useNow } from '@/hooks/use-now';
import { extendRest, skipRest, useRestTimer } from '@/workout/rest-timer';

/** Countdown shown while resting between sets. */
export function RestBanner() {
  const { endsAt } = useRestTimer();
  const now = useNow(500);
  if (!endsAt) return null;
  const remaining = Math.max(0, (endsAt - now) / 1000);

  return (
    <ThemedView type="backgroundSelected" style={styles.banner}>
      <View style={styles.text}>
        <ThemedText type="small" themeColor="textSecondary">
          Rest
        </ThemedText>
        <ThemedText type="subtitle">{formatDuration(Math.ceil(remaining))}</ThemedText>
      </View>
      <Button title="+30s" variant="secondary" onPress={() => extendRest(30)} />
      <Button title="Skip" variant="secondary" onPress={skipRest} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: 12 },
  text: { flex: 1 },
});
