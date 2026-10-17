import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import migrations from '../../drizzle/migrations';
import { runAutoBackupIfDue } from '@/backup/files';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

import { db } from './client';
import { seedIfEmpty } from './seed';

/** Runs migrations and seeding before rendering the app. */
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const { success, error } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);
  const [seedError, setSeedError] = useState<Error>();

  useEffect(() => {
    if (!success) return;
    seedIfEmpty(db)
      .then(() => {
        setSeeded(true);
        runAutoBackupIfDue();
      })
      .catch(setSeedError);
  }, [success]);

  const failure = error ?? seedError;
  if (failure) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="smallBold">Database error</ThemedText>
        <ThemedText type="small">{failure.message}</ThemedText>
      </ThemedView>
    );
  }

  if (!seeded) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
});
