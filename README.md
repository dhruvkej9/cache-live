# cache-live

A Claude Code **mod** that makes the prompt-cache timer **live** — it draws
its own status line; no external status line tool needed.

Your status line's cache timer (say, ccstatusline's Cache Timer) only moves when
the status line script is re-run — on events and on its `refreshInterval`. Claude
Code does not stream cache state between those, so the countdown freezes, and
setting `refreshInterval` to 1s means re-invoking the whole status line every
second. This mod fixes both halves from inside the engine:

- **Live.** It hooks the finished turns — where the API reports the cache reads
  and writes the engine already holds — arms the session's cache window, and
  while the window is warm ticks the remaining time each second through the
  engine's own clock into a pinned line **under the prompt** (`$.ui.status`):
  `cache · 🟢 4:59`, the mod's own last line, beside ccstatusline or without it.
  Nothing heavy is re-run and nothing is parsed from transcripts.
- **Exact.** It publishes the exact window — the anchor, `expiresAt`, TTL and
  the last turn's token usage — to `~/.cache/ccstatusline/cache-live-<session_id>.json`
  on every finished turn, so a status line script can count the cache down from
  an exact anchor instead of best-effort transcript guesswork.

## Install

Add the marketplace and install at user scope (loads in every project):

```sh
claude plugin install cache-live --marketplace dhruvkej9/cache-live
```

To run a new build before installing it, or a session-only try-out from the
repo:

```sh
claude --plugin-dir ./cache-live
```

Environment: `CC_CACHE_LIVE_TTL=1h` for an hour TTL window (default 5m);
the engine's `CLAUDE_CODE_PROMPT_CACHE_TTL` setting is honored when the
override is unset; `CC_CACHE_LIVE_FILE=/path/to.json` to relocate the
published state file.

## What you see

The mod pins one compact line under the prompt, drawn by the mod itself —
`cache · 🟢 4:59`, ticking each second — and only that: nothing until a turn
has touched the cache, and nothing once the window has gone cold. It resumes
warm from the transcript, so the countdown is there again the moment a
reopened session starts, before any new turn. The line is beside (or instead
of) ccstatusline's bar; the mod does not depend on it.

## Project layout

- `cache-live/` — the plugin (`.claude-plugin/plugin.json`, `hooks/`)
- `.claude-plugin/marketplace.json` — the marketplace manifest

Details, the file schema, and the semantics (what re-arms the window, why the
anchor is best-effort) are in [`cache-live/README.md`](cache-live/README.md).

Verify it in real sessions instead: open Claude, watch the mod's timer under
the prompt, and it stays right when you `--resume`. No unit suite is kept.
