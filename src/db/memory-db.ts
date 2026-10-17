import { drizzle } from 'drizzle-orm/sql-js';
import { migrate } from 'drizzle-orm/sql-js/migrator';
import initSqlJs from 'sql.js';

import * as schema from './schema';
import type { Database } from './types';

/**
 * A fresh in-memory database with all migrations applied. Used by tests and by the desktop MCP
 * server, which runs in Node without expo-sqlite.
 */
export async function createMemoryDb(migrationsFolder = './drizzle'): Promise<Database> {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  sqlite.run('PRAGMA foreign_keys = ON;');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}
