# Env vars

The lib core never reads `process.env` — env vars are a surface-level concern of the examples and adapter factories. Runtime tunables (model defaults, batch caps, thresholds, log level, etc.) live in [src/core/config.js](../src/core/config.js) and are passed in via `createCurator({ config })` rather than env.

| Env var          | Used by                                              | Purpose                       |
| ---------------- | ---------------------------------------------------- | ----------------------------- |
| `OPENAI_API_KEY` | `adapters/llm/openai` (factory)                      | OpenAI auth                   |
| `OPENAI_MODEL`   | `examples/*`                                         | Convenient model override     |
| `TAVILY_API_KEY` | `adapters/search/tavily` (factory)                   | Tavily auth                   |
| `EVENTS_DB_PATH` | `examples/*`                                         | SQLite file path              |

See `.env.example`.
