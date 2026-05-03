import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salvageTruncatedJson } from '../src/adapters/llm/openai.js';

test('salvageTruncatedJson: recovers complete objects when array element is cut mid-value', () => {
  const input = '{"events": [{"title": "A"}, {"title": "B';
  const result = salvageTruncatedJson(input);
  assert.deepEqual(result, { events: [{ title: 'A' }] });
});

test('salvageTruncatedJson: recovers when cut after a key with no value', () => {
  const input = '{"events": [{"title": "A"}, {"title":';
  const result = salvageTruncatedJson(input);
  assert.deepEqual(result, { events: [{ title: 'A' }] });
});

test('salvageTruncatedJson: recovers when cut after trailing comma', () => {
  const input = '{"events": [{"title": "A"},';
  const result = salvageTruncatedJson(input);
  assert.deepEqual(result, { events: [{ title: 'A' }] });
});

test('salvageTruncatedJson: recovers when only closing brackets are missing', () => {
  const input = '{"events": [{"title": "A"}';
  const result = salvageTruncatedJson(input);
  assert.deepEqual(result, { events: [{ title: 'A' }] });
});

test('salvageTruncatedJson: recovers when outer brace is missing', () => {
  const input = '{"events": [{"title": "A"}]';
  const result = salvageTruncatedJson(input);
  assert.deepEqual(result, { events: [{ title: 'A' }] });
});

test('salvageTruncatedJson: preserves multiple complete objects', () => {
  const input = '{"events": [{"title": "A"}, {"title": "B"}, {"title": "C';
  const result = salvageTruncatedJson(input);
  assert.deepEqual(result, { events: [{ title: 'A' }, { title: 'B' }] });
});

test('salvageTruncatedJson: handles nested objects (venue) cut mid-sibling', () => {
  const input = '{"events": [{"title": "A", "venue": {"name": "X", "city": "Y"}}, {"title": "B", "venue": {"na';
  const result = salvageTruncatedJson(input);
  assert.deepEqual(result, { events: [{ title: 'A', venue: { name: 'X', city: 'Y' } }] });
});

test('salvageTruncatedJson: strips code fences before salvaging', () => {
  const input = '```json\n{"events": [{"title": "A"}, {"tit\n```';
  const result = salvageTruncatedJson(input);
  assert.deepEqual(result, { events: [{ title: 'A' }] });
});

test('salvageTruncatedJson: returns undefined for empty input', () => {
  assert.equal(salvageTruncatedJson(''), undefined);
  assert.equal(salvageTruncatedJson('   '), undefined);
});

test('salvageTruncatedJson: returns undefined when no complete element exists', () => {
  assert.equal(salvageTruncatedJson('{"events": [{"tit'), undefined);
  assert.equal(salvageTruncatedJson('{'), undefined);
});

test('salvageTruncatedJson: handles escaped quotes inside strings', () => {
  const input = '{"events": [{"title": "say \\"hello\\""}, {"title": "cut';
  const result = salvageTruncatedJson(input);
  assert.deepEqual(result, { events: [{ title: 'say "hello"' }] });
});
