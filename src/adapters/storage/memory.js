/**
 * In-memory storage adapter. For tests and ephemeral runs.
 * Mirrors the SQLite adapter's behavior.
 */

import { scopeKey, effectiveScopeKeys, emptyPreference, mergePreferences } from './scope.js';

/**
 * @returns {import('../../core/types.js').StorageAdapter}
 */
export function memory() {
  /** @type {Map<string, import('../../core/types.js').Event>} */
  const events = new Map();
  /** @type {Map<string, import('../../core/types.js').Preference>} */
  const preferences = new Map();
  /** @type {Map<string, string>} */
  const kv = new Map();
  /** @type {Map<string, import('../../core/types.js').SavedQuery>} */
  const savedQueries = new Map();
  // event_views junction: key `${city}|${queryText}|${eventId}` -> shownAt ISO.
  /** @type {Map<string, { eventId: string, city: string, queryText: string, shownAt: string }>} */
  const views = new Map();
  let initialized = false;

  /** @param {{ city: string, queryText: string }} ref */
  const savedKey = (ref) => `${ref.city}|${ref.queryText}`;
  /** @param {{ city: string, queryText: string, eventId: string }} v */
  const viewKey = (v) => `${v.city}|${v.queryText}|${v.eventId}`;

  function ensureOpen() {
    if (!initialized) throw new Error('storage not initialized: call init() first');
  }

  return {
    async init() {
      initialized = true;
    },

    async close() {
      events.clear();
      preferences.clear();
      kv.clear();
      savedQueries.clear();
      views.clear();
      initialized = false;
    },

    async upsertEvents(incoming) {
      ensureOpen();
      const now = new Date().toISOString();
      for (const e of incoming) {
        const existing = events.get(e.id);
        events.set(e.id, {
          ...e,
          firstSeenAt: existing?.firstSeenAt ?? e.firstSeenAt ?? now,
          lastSeenAt: now,
          lastShownAt: existing?.lastShownAt ?? e.lastShownAt,
        });
      }
    },

    async markShown(ids, ref) {
      ensureOpen();
      const now = new Date().toISOString();
      for (const id of ids) {
        views.set(viewKey({ city: ref.city, queryText: ref.queryText, eventId: id }), {
          eventId: id, city: ref.city, queryText: ref.queryText, shownAt: now,
        });
        const existing = events.get(id);
        if (existing) events.set(id, { ...existing, lastShownAt: now });
      }
    },

    async getShownIds(ids) {
      ensureOpen();
      const set = new Set();
      for (const v of views.values()) set.add(v.eventId);
      const out = new Set();
      for (const id of ids) if (set.has(id)) out.add(id);
      return out;
    },

    async listShown(ref, opts) {
      ensureOpen();
      const matches = [...views.values()]
        .filter((v) => v.city === ref.city && v.queryText === ref.queryText)
        .sort((a, b) => b.shownAt.localeCompare(a.shownAt));
      const limited = opts?.limit ? matches.slice(0, opts.limit) : matches;
      /** @type {import('../../core/types.js').Event[]} */
      const out = [];
      for (const v of limited) {
        const e = events.get(v.eventId);
        if (e) out.push(e);
      }
      return out;
    },

    async getEvents(ids) {
      ensureOpen();
      /** @type {import('../../core/types.js').Event[]} */
      const out = [];
      for (const id of ids) {
        const e = events.get(id);
        if (e) out.push(e);
      }
      return out;
    },

    async getPreference(scope) {
      ensureOpen();
      const keys = effectiveScopeKeys(scope);
      const rows = keys
        .map((k) => preferences.get(k))
        .filter(/** @returns {p is import('../../core/types.js').Preference} */ (p) => Boolean(p));
      return mergePreferences(rows.length ? rows : [emptyPreference()]);
    },

    async updatePreference(updater, scope) {
      ensureOpen();
      const key = scopeKey(scope);
      const current = preferences.get(key) ?? emptyPreference();
      const next = updater(current);
      next.updatedAt = new Date().toISOString();
      preferences.set(key, next);
      return next;
    },

    async clearPreference(scope) {
      ensureOpen();
      if (!scope || (!scope.city && !scope.queryText)) {
        preferences.clear();
        return;
      }
      preferences.delete(scopeKey(scope));
    },

    async listSavedQueries() {
      ensureOpen();
      return [...savedQueries.values()].sort((a, b) => {
        const al = a.lastSearchedAt;
        const bl = b.lastSearchedAt;
        if (al && bl) return bl.localeCompare(al);
        if (al && !bl) return -1;
        if (!al && bl) return 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
    },

    async getSavedQuery(ref) {
      ensureOpen();
      return savedQueries.get(savedKey(ref));
    },

    async upsertSavedQuery(q) {
      ensureOpen();
      const key = savedKey(q);
      const existing = savedQueries.get(key);
      const next = {
        ...q,
        excludeKeywords: q.excludeKeywords ?? [],
        createdAt: existing?.createdAt ?? q.createdAt ?? new Date().toISOString(),
        lastSearchedAt: q.lastSearchedAt ?? existing?.lastSearchedAt,
      };
      savedQueries.set(key, next);
      return next;
    },

    async deleteSavedQuery(ref) {
      ensureOpen();
      savedQueries.delete(savedKey(ref));
    },

    async touchSavedQuery(ref) {
      ensureOpen();
      const existing = savedQueries.get(savedKey(ref));
      if (!existing) return;
      savedQueries.set(savedKey(ref), { ...existing, lastSearchedAt: new Date().toISOString() });
    },

    async getKV(key) {
      ensureOpen();
      return kv.get(key);
    },

    async setKV(key, value) {
      ensureOpen();
      kv.set(key, value);
    },
  };
}
