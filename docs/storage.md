# Storage

Storage holds three things: **events** (so we can dedupe across sessions and recall what was shown), **preferences** (the user's accumulated likes/dislikes/filters), and **schema metadata** (migration version).

## Backends

| Backend     | Module                                | Where    | When to use                  |
| ----------- | ------------------------------------- | -------- | ---------------------------- |
| `sqlite`    | `adapters/storage/sqlite.js`          | Node     | default for CLI / scripts    |
| `indexeddb` | `adapters/storage/indexeddb.js`       | Browser  | web-app integration          |
| `memory`    | `adapters/storage/memory.js`          | Anywhere | tests, ephemeral runs        |

All three implement the same `StorageAdapter` interface (see [adapters.md](adapters.md)).

## Schema

Logical tables (mapped to object stores in IndexedDB):

### `events`

| column        | type     | notes                                      |
| ------------- | -------- | ------------------------------------------ |
| `id`          | TEXT PK  | canonical hash of `(title, startsAt, venue, city)` |
| `title`       | TEXT     |                                            |
| `description` | TEXT     | nullable                                   |
| `starts_at`   | TEXT     | ISO 8601                                   |
| `ends_at`     | TEXT     | nullable                                   |
| `city`        | TEXT     |                                            |
| `category`    | TEXT     | comedy, concert, …                         |
| `venue_json`  | TEXT     | JSON-encoded venue                         |
| `source_json` | TEXT     | JSON-encoded source `{name, url}`          |
| `price_json`  | TEXT     | nullable, JSON                             |
| `subcategories_json` | TEXT | JSON array of strings                    |
| `raw`         | TEXT     | nullable, source text snippet               |
| `first_seen_at` | TEXT   | set on first insert                        |
| `last_seen_at`  | TEXT   | bumped on every re-encounter               |

### `preferences`

Single row keyed by `scope` (`'global'` for unscoped, `'city:berlin'` or `'category:comedy'` for scoped).

| column            | type    | notes                              |
| ----------------- | ------- | ---------------------------------- |
| `scope`           | TEXT PK | `'global'` or `'<key>:<value>'`    |
| `liked_json`      | TEXT    | JSON `EventRef[]`                  |
| `disliked_json`   | TEXT    | JSON `EventRef[]`                  |
| `filters_json`    | TEXT    | JSON explicit filters              |
| `derived_traits`  | TEXT    | nullable, LLM-summarized string    |
| `updated_at`      | TEXT    |                                    |

`getPreference()` returns the merge of `'global'` plus any scoped rows that match the current query (city/category). Scoped prefs override global.

### `schema_version`

| column      | type    |
| ----------- | ------- |
| `version`   | INTEGER PK |
| `applied_at` | TEXT  |

## Migrations

Migrations are an append-only array in `src/adapters/storage/migrations.js`:

```js
export const migrations = [
  { version: 1, up: `CREATE TABLE events (...); CREATE TABLE preferences (...);` },
  { version: 2, up: `ALTER TABLE preferences ADD COLUMN derived_traits TEXT;` },
];
```

On `init()`, the adapter:
1. Ensures `schema_version` exists.
2. Reads the current max version (0 if empty).
3. Inside a transaction, applies every migration with `version > current` in order.
4. Inserts a `schema_version` row per applied migration.

Rules:

- **Migrations are append-only.** Never edit a shipped migration. Add a new one.
- **No "down".** Reversing migrations adds bug surface and isn't needed for a local-data lib.
- **One concern per migration.** Easier to read in a year.
- **IndexedDB mirrors the same array.** The IndexedDB adapter uses `migrations.length` as its DB version and applies each in `onupgradeneeded` based on `event.oldVersion`.

## Clearing preferences

`clearPreference(scope?)`:

- No `scope` → wipes all preference rows (`global` and scoped).
- `{ city: 'Berlin' }` → deletes `'city:berlin'`. `'global'` and other scopes untouched.
- `{ category: 'comedy' }` → deletes `'category:comedy'`.
- `{ city, category }` → deletes the most specific scope `'city:<x>|category:<y>'`.

This does **not** delete cached events; it only resets the user's stated preferences. Events are independent because we may still want cross-session dedupe even after a preference reset.

## Why SQLite, not Postgres / files

- Self-contained, single-file, no server.
- Mirrors well to IndexedDB on the browser side.
- `better-sqlite3` is synchronous and fast; we wrap it in `async` for interface symmetry.
