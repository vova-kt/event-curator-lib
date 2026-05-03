#!/usr/bin/env node
/**
 * promote-golden.js
 *
 * Copies a reviewed run's events to `eval/fixtures/extract/<slug>.golden.json`. The
 * golden is human-curated truth, not the first run's raw output — promote
 * AFTER manually editing the run JSON to remove false positives, fix dates,
 * and add events the LLM missed.
 *
 * Prints a diff summary against any existing golden so the change is
 * reviewable in the commit.
 *
 * Configure in [eval/config.js](../config.js) → `promoteGolden`. Run:
 *   node eval/scripts/promote-golden.js
 */

import { loadGoldenFixture, writeGoldenFixture } from '../core/fixtures.js';
import { listRuns, loadRun } from '../core/runs.js';
import { RunKind } from '../core/runKind.js';
import { matchEvents } from '../core/metrics.js';
import { config } from '../config.js';

const { fixture: slug, runPath: explicitRun } = config.promoteGolden;

try {
  const runPath =
    explicitRun ??
    (() => {
      const runs = listRuns(slug);
      if (runs.length === 0) throw new Error(`no runs found for ${slug}`);
      return runs[0];
    })();

  const run = loadRun(runPath);
  if (run.kind !== RunKind.EXTRACT) {
    throw new Error(`run kind=${run.kind}; promote-golden currently supports extract only`);
  }
  const events = /** @type {import('../core/fixtures.js').GoldenEvent[]} */ (run.output);
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error(`run has no events: ${runPath}`);
  }

  const existing = loadGoldenFixture(slug);
  if (existing) {
    const m = matchEvents(existing.events, events);
    console.log(
      `existing golden: ${existing.events.length} events\n` +
        `new (from run):  ${events.length} events\n` +
        `  matched:    ${m.matched.length}\n` +
        `  removed:    ${m.unmatchedGolden.length}\n` +
        `  added:      ${m.unmatchedCandidate.length}`,
    );
  } else {
    console.log(`no existing golden — creating new with ${events.length} events`);
  }

  const path = writeGoldenFixture({ slug, events });
  console.log(`wrote ${path}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
