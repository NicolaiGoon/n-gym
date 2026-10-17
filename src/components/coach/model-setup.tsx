import { totalMemory } from 'expo-device';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { deleteModel, downloadModel, isDownloaded } from '@/coach/llama';
import { COACH_MODELS, formatBytes, recommendedModel, type CoachModel } from '@/coach/models';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function ProgressBar({ fraction }: { fraction: number }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      style={[styles.track, { backgroundColor: theme.background }]}>
      <View style={[styles.fill, { width: `${Math.min(100, fraction * 100)}%`, backgroundColor: theme.tint }]} />
    </View>
  );
}

/** Lists the coach models with download, cancel, use and delete. */
export function ModelSetup({ selectedId, onSelect }: { selectedId: string | null; onSelect: (model: CoachModel) => void }) {
  const recommended = recommendedModel(totalMemory);
  const [download, setDownload] = useState<{ id: string; fraction: number } | null>(null);
  const [, setVersion] = useState(0);
  const abort = useRef<AbortController | null>(null);

  const start = async (model: CoachModel) => {
    abort.current = new AbortController();
    setDownload({ id: model.id, fraction: 0 });
    try {
      await downloadModel(model, (fraction) => setDownload({ id: model.id, fraction }), abort.current.signal);
      onSelect(model);
    } catch (error) {
      if (!abort.current.signal.aborted) {
        Alert.alert('Download failed', error instanceof Error ? error.message : String(error));
      }
    } finally {
      setDownload(null);
      setVersion((v) => v + 1);
    }
  };

  const confirmDelete = (model: CoachModel) =>
    Alert.alert(`Delete ${model.name}?`, `Frees ${formatBytes(model.bytes)}. You can download it again later.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteModel(model);
          setVersion((v) => v + 1);
        },
      },
    ]);

  return (
    <View style={styles.list}>
      <ThemedText type="small" themeColor="textSecondary">
        The coach runs entirely on your phone. Download a model once, over Wi-Fi, and it works offline from then on.
        {totalMemory ? ` Your phone has ${formatBytes(totalMemory)} of RAM.` : ''}
      </ThemedText>
      {COACH_MODELS.map((model) => {
        const downloaded = isDownloaded(model);
        const downloading = download?.id === model.id;
        return (
          <ThemedView key={model.id} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">
              {model.name}
              {model.id === recommended.id ? '  ·  Recommended' : ''}
              {model.id === selectedId && downloaded ? '  ·  In use' : ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatBytes(model.bytes)}. {model.description}
            </ThemedText>
            {downloading ? (
              <>
                <ProgressBar fraction={download.fraction} />
                <View style={styles.row}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
                    {Math.round(download.fraction * 100)}% of {formatBytes(model.bytes)}
                  </ThemedText>
                  <Button title="Cancel" variant="secondary" onPress={() => abort.current?.abort()} />
                </View>
              </>
            ) : downloaded ? (
              <View style={styles.row}>
                <Button title="Use" onPress={() => onSelect(model)} style={styles.grow} />
                <Button title="Delete" variant="danger" onPress={() => confirmDelete(model)} />
              </View>
            ) : (
              <Button title="Download" variant="secondary" disabled={!!download} onPress={() => start(model)} />
            )}
          </ThemedView>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.three },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
