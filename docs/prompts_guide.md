# Prompts authoring guide

Authoring rules for every prompt under `src/prompts/`. The default model in [src/core/config.js](../src/core/config.js) is `gpt-5.5-mini`, but the LLM adapter is pluggable, so prompts must work well across:

- `openai-gpt-5.5-mini`
- `openai-gpt-5.5`
- `anthropic-sonnet-4.6`
- `anthropic-opus-4.7`

This guide consolidates the official guidance from [Anthropic's prompting best practices](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/claude-prompting-best-practices) and [OpenAI's GPT-5 prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide) into one ruleset. Read this before writing or editing any file under `src/prompts/`.

## The split: `system` vs `user`

Every prompt function returns `{ system, user }`.

- **`system`** carries the static contract: who the model is, what it does, the rules, the input shape, the output shape, and any examples. It does not contain per-call values.
- **`user`** carries only the per-call input — the data that varies between calls. No instructions, no role restatement, no schema reminders.

This separation is what makes prompts cacheable on the OpenAI side and lets Claude treat the system message as the authoritative role definition.

## Standard system-message structure

Use this order. Wrap each section in an XML tag — Claude parses XML tags substantially more reliably than prose section headers, and GPT-5 handles them fine. Tag names below are the project convention; keep them consistent across prompts.

In code, do not hand-build the XML wrapping. Use the `buildSystem` helper in [src/prompts/\_system.js](../src/prompts/_system.js), which owns the section order and tag names — pass each section's body as a string, omit the ones you don't need:

```js
import { buildSystem } from './_system.js';

const system = buildSystem({
  role: '...',
  task: '...',
  rules: '- ...\n- ...',
  inputFormat: '...',
  outputFormat: '...',
  // examples: '<example>...</example>',  // optional
});
```

```
<role>...</role>            # 1. Who the model is, in one sentence.
<task>...</task>            # 2. What it does, in one or two sentences.
<rules>...</rules>          # 3. Conditions, constraints, edge cases. Optional.
<input_format>...</input_format>   # 4. Shape of the user message.
<output_format>...</output_format> # 5. Shape of the response (JSON schema in prose).
<examples>...</examples>    # 6. Few-shot examples. Optional.
```

### 1. `<role>`

One sentence. Frame the model as a specialist for the specific task. Example: *"You extract structured upcoming events from web content."* Do not stack adjectives ("expert, careful, meticulous") — they add tokens without lifting quality.

### 2. `<task>`

One or two sentences naming the concrete deliverable and its purpose. Example: *"Read the supplied pages and return the events they describe as JSON. Skip past events and generic listings."*

### 3. `<rules>`

Bullet list. Closed-set conditions, edge cases, what to omit, what to copy verbatim, etc. Two principles:

- **Tell the model what to do, not what not to do.** "Omit any event without a precise date" beats "do not include vague dates". Negative rules are fine when there is no positive equivalent.
- **State scope explicitly.** Claude Opus 4.7 follows instructions literally and will not generalize "apply this to the title" to the description. If a rule applies to every field, say so.

### 4. `<input_format>`

Describe the shape of the `user` message. Name each section, say what's in it, and (when relevant) describe the delimiters used so the model can parse them. This section is what lets you keep `user` instruction-free.

### 5. `<output_format>`

The exact JSON shape the model must return. Use a prose schema — field names, types, optionality with `?`, nesting. Do not paste a JSON Schema document; the prose form is shorter and the models follow it reliably. Place this immediately before `<examples>` (or last, if no examples) so it is the freshest context before the model reads the user input.

### 6. `<examples>` (optional)

Wrap each example in its own `<example>` tag inside `<examples>`. Three to five examples covers most use cases; one or two is fine for shape-disambiguation tasks.

When to put examples here vs at the top:

- **Schema / structured-output tasks** (most of our prompts): examples last is fine — the schema spec is the primary signal.
- **Tone / style / classification tasks** where the rules are hard to articulate: put `<examples>` immediately after `<task>`, before `<rules>`. The pattern in the examples is the spec.

Skip examples entirely when the schema and rules already pin the output unambiguously.

## The `user` message

Per-call data only. No greetings, no task restatement, no "please return JSON".

Use labelled lines or XML tags depending on payload size:

- Small structured inputs (a handful of scalar fields): `Key: value` lines, mirroring the names declared in `<input_format>`.
- Larger or nested inputs (lists of events, multiple documents): XML tags matching `<input_format>`.

## The long-input exception

Anthropic documents up to a ~30% quality lift on multi-document tasks when long inputs sit *near the top of the prompt, above the query*. Apply this when a single call carries more than a few thousand tokens of variable data (e.g. `extractEvents` with full page text):

- Keep `system` instruction-only as usual.
- In `user`, place the bulk data block first, then a short trailing recap of the immediate ask (one or two lines, referencing the shape declared in `<output_format>`).

For small payloads (query expansion, dedupe judge on a list of titles, trait derivation), this exception does not apply — keep `user` as plain `Key: value` lines.

## Model-specific notes

These are tuning hints, not separate prompts. Write one prompt that works across all four; if a model misbehaves on a specific prompt, adjust the wording in place.

### Claude Opus 4.7 / Sonnet 4.6

- Follows instructions more literally than prior Claude versions, especially at lower effort. State scope per rule.
- Strongly prefers XML-tagged structure. The standard sections above are exactly the shape Claude expects.
- For Sonnet 4.6, the default effort is `high` — set effort explicitly in the LLM adapter when latency matters. Prompt content is unaffected.
- Examples wrapped in `<example>` / `<examples>` tags carry more signal than prose-introduced examples.

### OpenAI GPT-5.5 / GPT-5.5-mini

- "Extraordinarily receptive to instructions" — terse, direct phrasing wins over elaborate justification.
- Markdown headers also work, but XML tags work just as well and let one prompt serve both vendors. Stay on XML.
- For `gpt-5.5-mini` (our default), keep `<rules>` short and concrete; the smaller model degrades faster than Opus on rule-heavy prompts.

## Checklist before merging a prompt change

- [ ] `system` follows the section order above and uses XML tags.
- [ ] `user` contains only per-call data — no instructions, no schema reminders.
- [ ] Long-input exception applied where the variable payload is large.
- [ ] Output schema described as prose in `<output_format>`.
- [ ] Rules phrased positively where possible; scope stated explicitly.
- [ ] No closed-set string literals scattered across rules — use enums per [CLAUDE.md](../CLAUDE.md) rule 4.
- [ ] `npm run typecheck` and `npm test` pass.
