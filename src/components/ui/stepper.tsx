import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** A number field with − and + buttons. The value is kept as text so partial input works. */
export function Stepper({
  label,
  value,
  onChange,
  step,
  decimal = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
  decimal?: boolean;
}) {
  const theme = useTheme();
  const bump = (direction: 1 | -1) => {
    const current = Number(value) || 0;
    onChange(String(Math.max(0, round(current + direction * step))));
  };
  return (
    <View style={styles.wrapper}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
        <Pressable accessibilityLabel={`Decrease ${label}`} onPress={() => bump(-1)} hitSlop={6} style={styles.button}>
          <ThemedText type="smallBold">−</ThemedText>
        </Pressable>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(text.replace(',', '.'))}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          selectTextOnFocus
          style={[styles.input, { color: theme.text }]}
        />
        <Pressable accessibilityLabel={`Increase ${label}`} onPress={() => bump(1)} hitSlop={6} style={styles.button}>
          <ThemedText type="smallBold">+</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 10 },
  button: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  input: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '600', paddingVertical: Spacing.two },
});
