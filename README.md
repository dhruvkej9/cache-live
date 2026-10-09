# cache-live

A Claude Code plugin that makes the prompt-cache timer **live**.

Your status line's cache timer (say, ccstatusline's Cache Timer) only moves when
the status line script is re-run — on events and on its `refreshInterval`. Claude
Code does not stream cache state between those, so the countdown freezes, and
setting `refreshInterval` to 1s means re-invoking the whole status line every
second. This plugin fixes both halves from inside the engine:

- **Live.** While the main conversation's cache is warm, a per-second tick
  (the engine's own `$.clock`, no script re-invoked, nothing parsed) updates a
  pinned line under the prompt: `cache · HOT 4:59`, then `cache · COLD`.
- **Exact.** It publishes the exact window — the anchor, `expiresAt`, TTL and
  the last turn's token usage — to `~/.cache/ccstatusline/cache-live-<session_id>.json`
  on every finished turn, so a status line script can count the cache down
  from an exact anchor instead of best-effort transcript guesswork.

## Install

Add the marketplace and install at user scope (loads in every project):

```sh
claude plugin install cache-live --marketplace dhruvkej9/cache-live
```

Or for a session-only try-out straight from the repo:

```sh
claude --plugin-dir ./cache-live
```

Environment: `CC_CACHE_LIVE_TTL=1h` for an hour TTL window (default 5m);
the engine's `CLAUDE_CODE_PROMPT_CACHE_TTL` setting is honored when the
override is unset; `CC_CACHE_LIVE_FILE=/path/to.json` to relocate the
published state file.

## Project layout

- `cache-live/` — the plugin (`.claude-plugin/plugin.json`, `hooks/`, `tests/`)
- `.claude-plugin/marketplace.json` — the marketplace manifest

Details, the file schema, and the semantics (what re-arms the window, why the
anchor is best-effort) are in [`cache-live/README.md`](cache-live/README.md).

## Test

```sh
claude plugin test cache-live
```
