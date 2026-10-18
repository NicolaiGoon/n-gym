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
import { pickChangeFile, setPendingChanges } from '@/coach/change-files';
import { Page } from '@/components/page';
import { pickJefitExport } from '@/import/jefit/files';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { NumberField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { unlinkedExercises } from '@/data/library';
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
  const unlinked = useDb((db) => unlinkedExercises(db).length);

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

  const importChanges = () =>
    attempt(async () => {
      const file = await pickChangeFile();
      if (!file) return;
      setPendingChanges(file);
      router.push('/import-changes');
    });

  const importJefit = () =>
    attempt(async () => {
      if (await pickJefitExport()) router.push('/import-jefit');
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

      <ThemedText type="smallBold" style={styles.section}>
        Import from Jefit
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Bring over your Jefit history, routines, body measurements and exercise notes from a Jefit export file. You see
        a preview first, and importing the same file again adds nothing twice.
      </ThemedText>
      <Button title="Choose Jefit export" variant="secondary" onPress={importJefit} />

      <ThemedText type="smallBold" style={styles.section}>
        Exercise library
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {unlinked
          ? `${unlinked} of your exercises, such as ones from Jefit, have no picture or muscles yet. Link them to the library to include them in the weekly sets per muscle.`
          : 'All your exercises are linked to the library.'}
      </ThemedText>
      {unlinked ? <Button title="Link to library" variant="secondary" onPress={() => router.push('/link-exercises')} /> : null}

      <ThemedText type="smallBold" style={styles.section}>
        Desktop coach
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        A coach on your computer (through the n-gym MCP server) reads your backup and saves the changes it suggests to
        a change file. Import that file to review and approve them here.
      </ThemedText>
      <Button title="Import coach changes" variant="secondary" onPress={importChanges} />
    </Page>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.two },
  grow: { flex: 1 },
});
