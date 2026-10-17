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
          <Stack.Screen name="coach-actions" options={{ title: 'Coach actions' }} />
          <Stack.Screen name="import-changes" options={{ title: 'Coach changes' }} />
          <Stack.Screen name="import-jefit" options={{ title: 'Import from Jefit' }} />
          <Stack.Screen name="pick-exercise" options={{ title: 'Choose exercise', presentation: 'modal' }} />
          <Stack.Screen name="finish" options={{ title: 'Finish workout' }} />
          <Stack.Screen name="summary/[id]" options={{ title: 'Summary' }} />
          <Stack.Screen name="restore" options={{ title: 'Restore backup' }} />
          <Stack.Screen name="history/[id]" options={{ title: 'Workout' }} />
        </Stack>
      </DatabaseProvider>
    </ThemeProvider>
  );
}
