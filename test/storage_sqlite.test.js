import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqlite } from '../src/adapters/storage/sqlite.js';
import { makeEvent } from './_helpers.js';
import { CURRENT_SCHEMA_VERSION } from '../src/adapters/storage/migrations.js';

function tmpDb() {
  return join(tmpdir(), `events-curator-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

test('sqlite: init runs migrations to current version', async () => {
  const path = tmpDb();
  try {
    const s = sqlite({ path });
    await s.init();
    assert.equal(await s.schemaVersion(), CURRENT_SCHEMA_VERSION);
    await s.close();
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
});

test('sqlite: re-init is idempotent (no double-apply of migrations)', async () => {
  const path = tmpDb();
  try {
    const s1 = sqlite({ path });
    await s1.init();
    await s1.close();

    const s2 = sqlite({ path });
    await s2.init();
    assert.equal(await s2.schemaVersion(), CURRENT_SCHEMA_VERSION);
    await s2.close();
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
});

test('sqlite: upsert + getSeenIds round-trip', async () => {
  const path = tmpDb();
  try {
    const s = sqlite({ path });
    await s.init();
    const e = makeEvent({ title: 'Roundtrip' });
    await s.upsertEvents([e]);
    const seen = await s.getSeenIds([e.id, 'evt_missing']);
    assert.deepEqual([...seen], [e.id]);
    const fetched = await s.getEvents([e.id]);
    assert.equal(fetched[0]?.title, 'Roundtrip');
    await s.close();
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
});

test('sqlite: scoped preferences override global', async () => {
  const path = tmpDb();
  try {
    const s = sqlite({ path });
    await s.init();
    await s.updatePreference((p) => ({ ...p, explicitFilters: { excludeKeywords: ['global'] } }));
    await s.updatePreference(
      (p) => ({ ...p, explicitFilters: { excludeKeywords: ['scoped'] } }),
      { city: 'Berlin' },
    );
    const merged = await s.getPreference({ city: 'Berlin' });
    assert.deepEqual(merged.explicitFilters.excludeKeywords, ['scoped']);
    await s.close();
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
});
