/**
 * Append-only migrations array. See docs/storage.md.
 *
 * Rules:
 * - Never edit a shipped migration. Always add a new one.
 * - One concern per migration.
 * - SQLite uses `up` directly; IndexedDB applies the same set in order based on oldVersion.
 */

/**
 * @typedef {Object} Migration
 * @property {number} version
 * @property {string} description
 * @property {string} up
 */

/** @type {Migration[]} */
export const migrations = [
  {
    version: 1,
    description: 'initial schema: events, preferences, schema_version',
    up: `
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        starts_at TEXT NOT NULL,
        ends_at TEXT,
        city TEXT NOT NULL,
        category TEXT NOT NULL,
        venue_json TEXT NOT NULL,
        source_json TEXT NOT NULL,
        price_json TEXT,
        subcategories_json TEXT,
        raw TEXT,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_city_category ON events(city, category);
      CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at);

      CREATE TABLE IF NOT EXISTS preferences (
        scope TEXT PRIMARY KEY,
        liked_json TEXT NOT NULL,
        disliked_json TEXT NOT NULL,
        filters_json TEXT NOT NULL,
        derived_traits TEXT,
        updated_at TEXT NOT NULL
      );
    `,
  },
];

export const CURRENT_SCHEMA_VERSION = migrations.length === 0 ? 0 : migrations[migrations.length - 1].version;
