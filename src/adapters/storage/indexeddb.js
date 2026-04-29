/**
 * IndexedDB storage adapter for the browser.
 *
 * Mirrors the SQLite schema. Uses three object stores: `events`, `preferences`, `kv`.
 *
 * NOTE: keep this file dependency-free of `node:*` so it can be bundled for browsers.
 */

import { scopeKey, effectiveScopeKeys, emptyPreference, mergePreferences } from './scope.js';

const DB_VERSION = 2;

/** @param {{ city: string, queryText: string }} ref */
const savedKey = (ref) => `${ref.city}|${ref.queryText}`;

/**
 * @param {{ name?: string }} [opts]
 * @returns {import('../../core/types.js').StorageAdapter}
 */
export function indexeddb({ name = 'events-curator' } = {}) {
  /** @type {IDBDatabase | null} */
  let db = null;

  function ensureOpen() {
    if (!db) throw new Error('storage not initialized: call init() first');
    return db;
  }

  return {
    async init() {
      db = await openDb(name);
    },

    async close() {
      db?.close();
      db = null;
    },

    async upsertEvents(incoming) {
      const d = ensureOpen();
      const now = new Date().toISOString();
      const tx = d.transaction('events', 'readwrite');
      const store = tx.objectStore('events');
      for (const e of incoming) {
        const existing = await reqAsPromise(store.get(e.id));
        store.put({
          ...e,
          firstSeenAt: existing?.firstSeenAt ?? e.firstSeenAt ?? now,
          lastSeenAt: now,
          lastShownAt: existing?.lastShownAt ?? e.lastShownAt,
        });
      }
      await txDone(tx);
    },

    async markShown(ids, ref) {
      const d = ensureOpen();
      if (ids.length === 0) return;
      const now = new Date().toISOString();
      const tx = d.transaction(['eventViews', 'events'], 'readwrite');
      const views = tx.objectStore('eventViews');
      const events = tx.objectStore('events');
      for (const id of ids) {
        const _key = `${ref.city}|${ref.queryText}|${id}`;
        views.put({ _key, eventId: id, city: ref.city, queryText: ref.queryText, shownAt: now });
        const e = await reqAsPromise(events.get(id));
        if (e) events.put({ ...e, lastShownAt: now });
      }
      await txDone(tx);
    },

    async getShownIds(ids) {
      const d = ensureOpen();
      const tx = d.transaction('eventViews', 'readonly');
      const store = tx.objectStore('eventViews');
      const idx = store.index('eventId');
      const out = new Set();
      for (const id of ids) {
        const cursor = /** @type {IDBKeyRange} */ (IDBKeyRange.only(id));
        const got = await reqAsPromise(idx.openCursor(cursor));
        if (got) out.add(id);
      }
      await txDone(tx);
      return out;
    },

    async listShown(ref, opts) {
      const d = ensureOpen();
      const tx = d.transaction(['eventViews', 'events'], 'readonly');
      const views = tx.objectStore('eventViews');
      const idx = views.index('cityQueryShown');
      // Range over [city, queryText, '\u0000'] .. [city, queryText, '\uffff']
      const range = IDBKeyRange.bound(
        [ref.city, ref.queryText, '\u0000'],
        [ref.city, ref.queryText, '\uffff'],
      );
      /** @type {Array<{ eventId: string, shownAt: string }>} */
      const rows = [];
      await new Promise((resolve, reject) => {
        const req = idx.openCursor(range, 'prev');
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const v = cursor.value;
            rows.push({ eventId: v.eventId, shownAt: v.shownAt });
            if (opts?.limit && rows.length >= opts.limit) { resolve(undefined); return; }
            cursor.continue();
          } else {
            resolve(undefined);
          }
        };
        req.onerror = () => reject(req.error);
      });
      const events = tx.objectStore('events');
      /** @type {import('../../core/types.js').Event[]} */
      const out = [];
      for (const r of rows) {
        const e = await reqAsPromise(events.get(r.eventId));
        if (e) out.push(e);
      }
      await txDone(tx);
      return out;
    },

    async getEvents(ids) {
      const d = ensureOpen();
      const tx = d.transaction('events', 'readonly');
      const store = tx.objectStore('events');
      const out = [];
      for (const id of ids) {
        const row = await reqAsPromise(store.get(id));
        if (row) out.push(row);
      }
      await txDone(tx);
      return out;
    },

    async getPreference(scope) {
      const d = ensureOpen();
      const keys = effectiveScopeKeys(scope);
      const tx = d.transaction('preferences', 'readonly');
      const store = tx.objectStore('preferences');
      const rows = [];
      for (const k of keys) {
        const row = await reqAsPromise(store.get(k));
        if (row) rows.push(row);
      }
      await txDone(tx);
      return mergePreferences(rows.length ? rows : [emptyPreference()]);
    },

    async updatePreference(updater, scope) {
      const d = ensureOpen();
      const key = scopeKey(scope);
      const tx = d.transaction('preferences', 'readwrite');
      const store = tx.objectStore('preferences');
      const existing = await reqAsPromise(store.get(key));
      const current = existing ?? emptyPreference();
      const next = updater(current);
      next.updatedAt = new Date().toISOString();
      store.put({ ...next, scope: key });
      await txDone(tx);
      return next;
    },

    async clearPreference(scope) {
      const d = ensureOpen();
      const tx = d.transaction('preferences', 'readwrite');
      const store = tx.objectStore('preferences');
      if (!scope || (!scope.city && !scope.queryText)) {
        store.clear();
      } else {
        store.delete(scopeKey(scope));
      }
      await txDone(tx);
    },

    async listSavedQueries() {
      const d = ensureOpen();
      const tx = d.transaction('savedQueries', 'readonly');
      const all = /** @type {Array<import('../../core/types.js').SavedQuery & { _key: string }>} */ (
        await reqAsPromise(tx.objectStore('savedQueries').getAll())
      );
      await txDone(tx);
      return all
        .map(({ _key, ...q }) => q)
        .sort((a, b) => {
          const al = a.lastSearchedAt;
          const bl = b.lastSearchedAt;
          if (al && bl) return bl.localeCompare(al);
          if (al && !bl) return -1;
          if (!al && bl) return 1;
          return b.createdAt.localeCompare(a.createdAt);
        });
    },

    async getSavedQuery(ref) {
      const d = ensureOpen();
      const tx = d.transaction('savedQueries', 'readonly');
      const row = /** @type {(import('../../core/types.js').SavedQuery & { _key: string }) | undefined} */ (
        await reqAsPromise(tx.objectStore('savedQueries').get(savedKey(ref)))
      );
      await txDone(tx);
      if (!row) return undefined;
      const { _key, ...rest } = row;
      return rest;
    },

    async upsertSavedQuery(q) {
      const d = ensureOpen();
      const tx = d.transaction('savedQueries', 'readwrite');
      const store = tx.objectStore('savedQueries');
      const _key = savedKey(q);
      const existing = await reqAsPromise(store.get(_key));
      const next = {
        ...q,
        excludeKeywords: q.excludeKeywords ?? [],
        createdAt: existing?.createdAt ?? q.createdAt ?? new Date().toISOString(),
        lastSearchedAt: q.lastSearchedAt ?? existing?.lastSearchedAt,
      };
      store.put({ ...next, _key });
      await txDone(tx);
      return next;
    },

    async deleteSavedQuery(ref) {
      const d = ensureOpen();
      const tx = d.transaction('savedQueries', 'readwrite');
      tx.objectStore('savedQueries').delete(savedKey(ref));
      await txDone(tx);
    },

    async touchSavedQuery(ref) {
      const d = ensureOpen();
      const tx = d.transaction('savedQueries', 'readwrite');
      const store = tx.objectStore('savedQueries');
      const existing = await reqAsPromise(store.get(savedKey(ref)));
      if (existing) {
        store.put({ ...existing, lastSearchedAt: new Date().toISOString() });
      }
      await txDone(tx);
    },

    async getKV(key) {
      const d = ensureOpen();
      const tx = d.transaction('kv', 'readonly');
      const row = await reqAsPromise(tx.objectStore('kv').get(key));
      await txDone(tx);
      return row?.value;
    },

    async setKV(key, value) {
      const d = ensureOpen();
      const tx = d.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ key, value, updatedAt: new Date().toISOString() });
      await txDone(tx);
    },
  };
}

/**
 * @param {string} name
 * @returns {Promise<IDBDatabase>}
 */
function openDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      const keyPaths = {
        events: 'id',
        preferences: 'scope',
        kv: 'key',
        savedQueries: '_key',
        eventViews: '_key',
      };
      for (const [store, keyPath] of Object.entries(keyPaths)) {
        if (!d.objectStoreNames.contains(store)) {
          d.createObjectStore(store, { keyPath });
        }
      }
      const views = req.transaction?.objectStore('eventViews');
      if (views) {
        if (!views.indexNames.contains('eventId')) {
          views.createIndex('eventId', 'eventId', { unique: false });
        }
        if (!views.indexNames.contains('cityQueryShown')) {
          views.createIndex('cityQueryShown', ['city', 'queryText', 'shownAt'], { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {IDBTransaction} tx
 */
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
