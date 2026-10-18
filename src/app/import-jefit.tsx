import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { ListRow } from '@/components/ui/list-row';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { getExercise } from '@/db/repo/exercises';
import { getSettings } from '@/db/repo/settings';
import { write } from '@/db/use-db';
import { clearJefitImport, setJefitChoice, usePendingJefitImport } from '@/import/jefit/files';
import { applyImport, previewImport, type ImportResult } from '@/import/jefit/import';

type Filter = 'new' | 'all';

const formatDate = (date: Date | null) => (date ? date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '–');

/** Preview of a Jefit export, with exercise matching, then the import itself. */
export default function ImportJefitScreen() {
  const pending = usePendingJefitImport();
  const [filter, setFilter] = useState<Filter>('new');
  const [importing, setImporting] = useState(false);

  if (!pending) {
    return (
      <Page>
        <ThemedText themeColor="textSecondary">No Jefit export selected.</ThemedText>
      </Page>
    );
  }
  const { data, rows, choices } = pending;
  const preview = previewImport(db, data, choices);
  const unit = getSettings(db).unit;
  const nothingNew = !preview.workouts && !preview.routines && !preview.measurements;
  const shown = filter === 'all' ? rows : rows.filter((r) => choices[r.key].type === 'new');

  const runImport = () => {
    let result: ImportResult | null = null;
    const ok = write((db) => (result = applyImport(db, data, choices)));
    setImporting(false);
    if (!ok || !result) return;
    const r: ImportResult = result;
    clearJefitImport();
    Alert.alert(
      'Import complete',
      `Added ${r.workouts} workouts (${r.sets} sets), ${r.exercisesCreated} exercises, ${r.routines} routines and ${r.measurements} body measurements.${
        r.exercisesCreated ? ' To give the new exercises pictures and muscles, link them in Settings → Link to library.' : ''
      }`,
    );
    router.back();
  };

  return (
    <Page>
      <ThemedView type="backgroundElement" style={styles.summary}>
        <ThemedText type="smallBold">
          {preview.workouts} workouts, {preview.sets.toLocaleString()} sets
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {preview.workouts ? `${formatDate(preview.first)} to ${formatDate(preview.last)}. ` : ''}
          {preview.workoutsAlreadyImported ? `${preview.workoutsAlreadyImported} already imported, skipped. ` : ''}
          Also {preview.routines} routines, {preview.measurements} body measurements and {preview.notes} exercise notes.
        </ThemedText>
        {data.massUnit !== unit ? (
          <ThemedText type="small" themeColor="textSecondary">
            Weights are converted from {data.massUnit} to {unit}.
          </ThemedText>
        ) : null}
      </ThemedView>

      <ThemedText type="smallBold">Exercises</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {preview.newExercises} will be added to your library, the rest are matched to exercises you have. Tap one to match
        it to a different exercise. Your choices are remembered for the next import.
      </ThemedText>
      <Chips
        options={[
          { value: 'new', label: `New (${preview.newExercises})` },
          { value: 'all', label: `All (${rows.length})` },
        ]}
        value={filter}
        onChange={(value) => value && setFilter(value)}
      />
      <View style={styles.list}>
        {shown.map((row) => {
          const choice = choices[row.key];
          const target = choice.type === 'existing' ? getExercise(db, choice.exerciseId)?.name : null;
          return (
            <ListRow
              key={row.key}
              title={row.name}
              subtitle={`${row.sessions} session${row.sessions === 1 ? '' : 's'} · ${
                target ? `→ ${target}` : `→ new (${row.muscleGroup}${row.equipment ? `, ${row.equipment}` : ''})`
              }`}
              onPress={() => router.push({ pathname: '/pick-exercise', params: { jefitKey: row.key } })}
              trailing={
                choice.type === 'existing' ? (
                  <Button title="New" variant="secondary" onPress={() => setJefitChoice(row.key, { type: 'new' })} />
                ) : undefined
              }
            />
          );
        })}
      </View>

      {importing ? (
        <View style={styles.importing}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Importing…
          </ThemedText>
        </View>
      ) : (
        <Button
          title={nothingNew ? 'Nothing new to import' : 'Import'}
          disabled={nothingNew}
          onPress={() => {
            // The import blocks the app while it runs, so let the progress indicator draw first.
            setImporting(true);
            setTimeout(runImport, 50);
          }}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  list: { gap: Spacing.two },
  importing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.three },
});
