import { getDocumentAsync } from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';

import { db } from '@/db/client';
import { createBackup, parseBackup, serializeBackup, type Backup } from '@/db/backup';
import { getSetting, setSetting } from '@/db/repo/settings';

const FOLDER_KEY = 'backupFolderUri';
const LAST_BACKUP_KEY = 'lastBackupAt';
const AUTO_BACKUP_DAYS = 7;

function fileName(now: Date) {
  return `n-gym-backup-${now.toISOString().slice(0, 10)}.json`;
}

/** Writes a backup to the cache folder and opens the share sheet (Drive, email, Files…). */
export async function exportAndShare(now = new Date()): Promise<void> {
  const file = new File(Paths.cache, fileName(now));
  if (file.exists) file.delete();
  file.create();
  file.write(serializeBackup(createBackup(db, now)));
  await shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save n-gym backup' });
}

/** Lets the user pick a backup file and parses it. Returns null if they cancel. */
export async function pickBackup(): Promise<Backup | null> {
  const result = await getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  return parseBackup(await new File(result.assets[0].uri).text());
}

export interface AutoBackupStatus {
  folder: string | null;
  lastBackupAt: Date | null;
}

export function autoBackupStatus(): AutoBackupStatus {
  const last = getSetting(db, LAST_BACKUP_KEY);
  return { folder: getSetting(db, FOLDER_KEY) ?? null, lastBackupAt: last ? new Date(last) : null };
}

/** Asks for a folder for weekly backups and writes the first one right away. */
export async function chooseBackupFolder(): Promise<void> {
  const directory = await Directory.pickDirectoryAsync();
  setSetting(db, FOLDER_KEY, directory.uri);
  writeToFolder(directory.uri, new Date());
}

export function turnOffAutoBackup(): void {
  setSetting(db, FOLDER_KEY, null);
}

function writeToFolder(folderUri: string, now: Date) {
  const file = new Directory(folderUri).createFile(fileName(now), 'application/json');
  file.write(serializeBackup(createBackup(db, now)));
  setSetting(db, LAST_BACKUP_KEY, now.toISOString());
}

/** Called on app start: writes a backup to the chosen folder if the last one is a week old. Never throws. */
export function runAutoBackupIfDue(now = new Date()): void {
  try {
    const { folder, lastBackupAt } = autoBackupStatus();
    if (!folder) return;
    if (lastBackupAt && now.getTime() - lastBackupAt.getTime() < AUTO_BACKUP_DAYS * 24 * 60 * 60 * 1000) return;
    writeToFolder(folder, now);
  } catch (error) {
    // A missing folder or revoked permission shouldn't stop the app from opening.
    console.warn('Automatic backup failed', error);
  }
}

/** The backup picked for restoring, held while the preview screen is open. */
let pending: Backup | null = null;

export function setPendingRestore(backup: Backup | null) {
  pending = backup;
}

export function getPendingRestore(): Backup | null {
  return pending;
}
