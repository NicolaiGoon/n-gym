import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  autoBackupStatus,
  chooseBackupFolder,
  exportAndShare,
  pickBackup,
  setPendingRestore,
  turnOffAutoBackup,
} from '@/backup/files';
import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { NumberField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { getDeloadEvery, setDeloadEvery } from '@/db/repo/deload';
import { getSettings, updateSettings, type WeightUnit } from '@/db/repo/settings';
import { useDb, write } from '@/db/use-db';

const UNIT_OPTIONS: { value: WeightUnit; label: string }[] = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'lb', label: 'Pounds (lb)' },
];

/** Runs an async file action and shows any error. */
async function attempt(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    Alert.alert('Something went wrong', error instanceof Error ? error.message : String(error));
  }
}

export default function SettingsScreen() {
  const [initial] = useState(() => getSettings(db));
  const [unit, setUnit] = useState<WeightUnit>(initial.unit);
  const [increment, setIncrement] = useState(String(initial.defaultIncrement));
  const [deloadEvery, setDeloadEveryText] = useState(() => String(getDeloadEvery(db)));
  const autoBackup = useDb(() => autoBackupStatus());

  const save = () => {
    const ok = write((db) => {
      setDeloadEvery(db, Number(deloadEvery || 0));
      updateSettings(db, { unit, defaultIncrement: Number(increment) });
    });
    if (ok) router.back();
  };

  const restore = () =>
    attempt(async () => {
      const backup = await pickBackup();
      if (!backup) return;
      setPendingRestore(backup);
      router.push('/restore');
    });

  return (
    <Page>
      <ThemedText type="small" themeColor="textSecondary">
        Weight unit
      </ThemedText>
      <Chips options={UNIT_OPTIONS} value={unit} onChange={(value) => value && setUnit(value)} />
      <ThemedText type="small" themeColor="textSecondary">
        Changing the unit relabels weights; it doesn’t convert numbers you’ve already entered.
      </ThemedText>
      <NumberField label={`Default increment for new exercises (${unit})`} value={increment} onChangeValue={setIncrement} />
      <NumberField label="Suggest a deload week every N weeks (0 = off)" value={deloadEvery} onChangeValue={setDeloadEveryText} />
      <ThemedText type="small" themeColor="textSecondary">
        A deload is also suggested when 3 or more lifts stall.
      </ThemedText>
      <Button title="Save" onPress={save} />

      <ThemedText type="smallBold" style={styles.section}>
        Backup
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Your data lives only on this phone. Keep a copy somewhere else, such as Google Drive.
      </ThemedText>
      <View style={styles.row}>
        <Button title="Export backup" variant="secondary" onPress={() => attempt(() => exportAndShare())} style={styles.grow} />
        <Button title="Restore from file" variant="secondary" onPress={restore} style={styles.grow} />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {autoBackup.folder
          ? `Weekly backup is on. Last backup: ${autoBackup.lastBackupAt?.toLocaleString() ?? 'never'}.`
          : 'Weekly backup is off. Choose a folder and a backup is saved there every 7 days when you open the app.'}
      </ThemedText>
      <View style={styles.row}>
        <Button
          title={autoBackup.folder ? 'Change folder' : 'Choose backup folder'}
          variant="secondary"
          onPress={() => attempt(chooseBackupFolder)}
          style={styles.grow}
        />
        {autoBackup.folder ? <Button title="Turn off" variant="danger" onPress={turnOffAutoBackup} /> : null}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.two },
  grow: { flex: 1 },
});
