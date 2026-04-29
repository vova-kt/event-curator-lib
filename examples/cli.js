#!/usr/bin/env node
/**
 * Interactive REPL. See docs/examples.md.
 */

import readline from 'node:readline';
import { createCurator } from '../src/index.js';
import { sqlite } from '../src/adapters/storage/sqlite.js';
import { openai } from '../src/adapters/llm/openai.js';
import { tavily } from '../src/adapters/search/tavily.js';

const llm = openai({
  apiKey: requireEnv('OPENAI_API_KEY'),
  model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
});
const search = [tavily({ apiKey: requireEnv('TAVILY_API_KEY') })];
const storage = sqlite({ path: process.env.EVENTS_DB_PATH ?? './events.db' });

const curator = await createCurator({ llm, search, storage });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('events-curator REPL. Commands: :clear [city] | :show | :exit');

let session = { city: '', category: '', days: 14 };

while (true) {
  const cmd = await ask('\n> ');
  if (cmd === ':exit') break;

  if (cmd === ':show') {
    const pref = await storage.getPreference({ city: session.city, category: session.category });
    console.log(JSON.stringify(pref, null, 2));
    continue;
  }

  if (cmd.startsWith(':clear')) {
    const arg = cmd.slice(':clear'.length).trim();
    if (!arg) {
      await curator.clearPreferences();
      console.log('cleared all preferences');
    } else {
      await curator.clearPreferences({ city: arg });
      console.log(`cleared preferences for city: ${arg}`);
    }
    continue;
  }

  // Otherwise, treat as a new run.
  session.city = await ask(`city [${session.city}]: `, session.city);
  session.category = await ask(`category [${session.category}]: `, session.category);
  session.days = Number(await ask(`days [${session.days}]: `, String(session.days))) || session.days;

  const { events } = await curator.curate({
    city: session.city,
    category: session.category,
    timeframe: { rolling: { days: session.days } },
    limit: 10,
  });

  if (events.length === 0) {
    console.log('(no events found)');
    continue;
  }

  for (const [i, e] of events.entries()) {
    const date = e.startsAt.slice(0, 16).replace('T', ' ');
    console.log(`[${i + 1}] ${date}  ${e.title}  —  ${e.venue.name}`);
    if (e.rationale) console.log(`     ↳ ${e.rationale}`);
  }

  const liked = parsePicks(await ask('like (e.g., 1 3): '));
  const disliked = parsePicks(await ask('dislike: '));

  /**
   * @param {number[]} idxList
   * @returns {string[]}
   */
  const ids = (idxList) => idxList
    .map((i) => events[i - 1]?.id)
    .filter(/** @returns {x is string} */ (x) => Boolean(x));

  await curator.recordFeedback({ liked: ids(liked), disliked: ids(disliked) });
  console.log('saved.');
}

await curator.close();
rl.close();

/**
 * @param {string} prompt
 * @param {string} [fallback]
 * @returns {Promise<string>}
 */
function ask(prompt, fallback) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || (fallback ?? ''));
    });
  });
}

/**
 * @param {string} s
 * @returns {number[]}
 */
function parsePicks(s) {
  return s
    .split(/[\s,]+/)
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * @param {string} name
 */
function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}
