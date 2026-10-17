import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

export default function CoachScreen() {
  return (
    <Screen title="Coach">
      <ThemedText themeColor="textSecondary">
        The on-device assistant will live here. It will propose workouts and changes, and nothing is
        saved until you approve it.
      </ThemedText>
    </Screen>
  );
}
