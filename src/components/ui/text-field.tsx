import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function TextField({ label, style, ...rest }: TextInputProps & { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.wrapper}>
      {label ? (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }, style]}
        {...rest}
      />
    </View>
  );
}

/** A text field that edits a number. Keeps the raw text so partial input like "2." works. */
export function NumberField({
  value,
  onChangeValue,
  ...rest
}: Omit<TextInputProps, 'value' | 'onChangeText'> & {
  label?: string;
  value: string;
  onChangeValue: (text: string) => void;
}) {
  return (
    <TextField
      keyboardType="decimal-pad"
      value={value}
      onChangeText={(text) => onChangeValue(text.replace(',', '.'))}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.one, flex: 1 },
  input: {
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    fontSize: 16,
  },
});
