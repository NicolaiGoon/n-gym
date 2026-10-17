import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

/** A horizontal row of choices where one (or none, when `allowNone`) is selected. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  allowNone = false,
}: {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowNone?: boolean;
}) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(selected && allowNone ? null : option.value)}
            style={[styles.chip, { backgroundColor: selected ? theme.tint : theme.backgroundElement }]}>
            <ThemedText type="small" style={{ color: selected ? theme.onTint : theme.text }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999 },
});
