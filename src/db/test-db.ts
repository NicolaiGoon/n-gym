import { createMemoryDb } from './memory-db';

/** A fresh in-memory database with all migrations applied, for tests. */
export const createTestDb = () => createMemoryDb();
