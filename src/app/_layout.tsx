import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { DatabaseProvider } from '@/db/provider';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DatabaseProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          <Stack.Screen name="pick-exercise" options={{ title: 'Choose exercise', presentation: 'modal' }} />
          <Stack.Screen name="finish" options={{ title: 'Finish workout' }} />
          <Stack.Screen name="summary/[id]" options={{ title: 'Summary' }} />
        </Stack>
      </DatabaseProvider>
    </ThemeProvider>
  );
}
