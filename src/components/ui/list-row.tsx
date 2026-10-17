import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A tappable card row with a title, optional subtitle and trailing content. */
export function ListRow({
  title,
  subtitle,
  onPress,
  trailing,
  dimmed = false,
}: {
  title: string;
  subtitle?: string | null;
  onPress?: () => void;
  trailing?: ReactNode;
  dimmed?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, opacity: dimmed ? 0.6 : 1 },
      ]}>
      <View style={styles.text}>
        <ThemedText type="smallBold">{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/** Small text button used inside rows, e.g. ↑ ↓ ✕. */
export function IconButton({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={8} style={styles.icon}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 12,
    gap: Spacing.two,
  },
  text: { flex: 1, gap: Spacing.half },
  icon: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
});
