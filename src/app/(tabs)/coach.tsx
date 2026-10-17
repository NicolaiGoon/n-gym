import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { isDownloaded } from '@/coach/llama';
import { COACH_MODELS, type CoachModel } from '@/coach/models';
import { CoachChat } from '@/components/coach/chat';
import { ModelSetup } from '@/components/coach/model-setup';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/repo/settings';

const MODEL_KEY = 'coachModel';

function savedModel(): CoachModel | null {
  const model = COACH_MODELS.find((m) => m.id === getSetting(db, MODEL_KEY));
  return model && isDownloaded(model) ? model : null;
}

export default function CoachScreen() {
  const [model, setModel] = useState(savedModel);
  const [choosing, setChoosing] = useState(false);

  const select = (next: CoachModel) => {
    setSetting(db, MODEL_KEY, next.id);
    setModel(next);
    setChoosing(false);
  };

  // The chosen model may have been deleted from the list.
  const current = model && isDownloaded(model) ? model : null;
  const showSetup = choosing || !current;

  return (
    <Screen title="Coach">
      <View style={styles.header}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
          {current ? current.name : 'No model yet'}
        </ThemedText>
        {current ? (
          <Button title={showSetup ? 'Back to chat' : 'Model'} variant="secondary" onPress={() => setChoosing(!choosing)} />
        ) : null}
        <Button title="Actions" variant="secondary" onPress={() => router.push('/coach-actions')} />
      </View>
      {showSetup ? (
        <ScrollView contentContainerStyle={styles.setup}>
          <ModelSetup selectedId={current?.id ?? null} onSelect={select} />
        </ScrollView>
      ) : (
        <CoachChat key={current.id} model={current} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  grow: { flex: 1 },
  setup: { paddingBottom: Spacing.four },
});
