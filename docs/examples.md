# Examples

Two runnable entry points under `examples/`. Both wire up the curator with default adapters and read keys from env.

## Setup

```bash
cp .env.example .env
# fill in OPENAI_API_KEY and TAVILY_API_KEY
npm install
```

## Script — one-shot

`examples/script.js` reads parameters from argv/env, runs one curation, prints results, exits.

```bash
node examples/script.js --city Berlin --category comedy --days 14 --limit 5
```

Flags:

| Flag         | Default               | Notes                                  |
| ------------ | --------------------- | -------------------------------------- |
| `--city`     | required              |                                        |
| `--category` | required              | comedy, concert, theater, …            |
| `--days`     | `14`                  | rolling window from today              |
| `--from`     | —                     | ISO date; overrides `--days`           |
| `--to`       | —                     | ISO date; overrides `--days`           |
| `--limit`    | `10`                  | max events to return                   |
| `--db`       | `$EVENTS_DB_PATH`     | SQLite path                            |
| `--dry`      | `false`               | use stub adapters; no network calls    |

Use case: smoke testing, regression checks, quick demos.

## CLI — interactive

`examples/cli.js` is a small REPL exercising the full feedback loop.

```bash
node examples/cli.js
```

Session shape:

```
> city: Berlin
> category: comedy
> days: 14

[1] Open mic at Comedy Café — Fri 2 May, 20:00 — Comedy Café
[2] Anna Mateur live    — Sat 3 May, 21:00 — Roter Salon
[3] …

like (e.g., 1 3): 2 3
dislike: 1

saved. run again with same filters? (y/n): y
…
```

What it exercises:

- Full pipeline (`curate()`)
- Feedback capture (`recordFeedback()`)
- Preference scoping (you can change city mid-session)
- `clearPreferences()` via the `:clear` command

REPL commands:

| Command      | Effect                                                  |
| ------------ | ------------------------------------------------------- |
| `:clear`     | wipe all preferences                                    |
| `:clear Berlin` | wipe city-scoped prefs                              |
| `:show`      | print current preferences                               |
| `:exit`      | quit, closing the storage handle                        |

## Tuning workflow

1. Run the script with `--dry` to confirm the pipeline works without network/credit cost.
2. Run with real keys against a small `--limit`.
3. Use the CLI to mark likes/dislikes across a few sessions.
4. Inspect `events.db` directly with `sqlite3` if the curator behavior surprises you.
5. Adjust prompts in `src/prompts/` or strategies in `src/strategies/`. Re-run.
