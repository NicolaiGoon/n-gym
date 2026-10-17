import { settings } from '../schema';
import type { Database } from '../types';

export type WeightUnit = 'kg' | 'lb';

export interface AppSettings {
  unit: WeightUnit;
  /** Default weight increment for new exercises, in `unit`. */
  defaultIncrement: number;
}

export const DEFAULT_SETTINGS: AppSettings = { unit: 'kg', defaultIncrement: 2.5 };

export function getSettings(db: Database): AppSettings {
  const rows = db.select().from(settings).all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const unit = map.get('unit');
  const increment = Number(map.get('defaultIncrement'));
  return {
    unit: unit === 'lb' || unit === 'kg' ? unit : DEFAULT_SETTINGS.unit,
    defaultIncrement: Number.isFinite(increment) && increment > 0 ? increment : DEFAULT_SETTINGS.defaultIncrement,
  };
}

export function updateSettings(db: Database, changes: Partial<AppSettings>): void {
  if (changes.defaultIncrement !== undefined && !(changes.defaultIncrement > 0)) {
    throw new Error('Increment must be greater than 0.');
  }
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) continue;
      tx.insert(settings)
        .values({ key, value: String(value) })
        .onConflictDoUpdate({ target: settings.key, set: { value: String(value) } })
        .run();
    }
  });
}

/** Query for live updates in screens. */
export function settingsQuery(db: Database) {
  return db.select().from(settings);
}
