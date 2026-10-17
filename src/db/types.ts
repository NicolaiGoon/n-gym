import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

/**
 * Any synchronous SQLite Drizzle database with our schema: expo-sqlite on the phone,
 * sql.js in tests. Data functions take this so they can be tested in Node.
 */
export type Database = BaseSQLiteDatabase<'sync', any, typeof schema>;
