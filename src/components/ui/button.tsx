import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'danger';

export function Button({
  title,
  variant = 'primary',
  style,
  ...rest
}: PressableProps & { title: string; variant?: Variant }) {
  const theme = useTheme();
  const background = { primary: theme.tint, secondary: theme.backgroundElement, danger: theme.backgroundElement }[variant];
  const color = { primary: theme.onTint, secondary: theme.text, danger: theme.danger }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      style={(state) => [
        styles.button,
        { backgroundColor: background, opacity: rest.disabled ? 0.5 : state.pressed ? 0.8 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <ThemedText type="smallBold" style={{ color }}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
  },
});
