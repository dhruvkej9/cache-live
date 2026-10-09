# cache-live

A live prompt-cache timer for Claude Code, as a hooks-module mod in the style
of the built-ins in this repository.

Your status line's cache timer (say, ccstatusline's Cache Timer) only moves
when the status line script is re-run: on events and on its `refreshInterval`.
Claude Code does not stream cache state between those, so the countdown is
frozen for seconds at a time, and making it tick by setting `refreshInterval`
to 1s means re-invoking the whole status line (git probes, transcript reads)
every second.

This mod solves both halves from inside the engine:

- **Live.** It hooks the finished turns — where the API reports the cache
  reads and writes the engine already holds — arms the session's cache
  window, and while the window is warm ticks the remaining time each second
  through the engine's own clock into a pinned line under the prompt:
  `cache · HOT 4:59`, clearing again once the window goes cold. One per-second
  call to `$.ui.status`; nothing heavy is re-run, nothing is parsed from
  transcripts.
- **Exact.** It publishes the window it saw to a small JSON file on every
  finished turn, so a status line script can count the cache down from the
  *exact* anchor and `expires_at` instead of estimating both from transcripts.

No noun is added; the mod is three hooks and a file.

## Install

From the repo, install at user scope (loads in every project):

    claude plugin install cache-live --marketplace dhruvkej9/cache-live

For a session-only try-out, load the folder directly:

    claude --plugin-dir ./cache-live

The hooks module is typed against the `claude-code` declarations `claude
plugin` generates.

## What it shows

A pinned line under the prompt (beside the engine's own pinned notices):

| State | Line |
| --- | --- |
| Before the first cache touch | *nothing* |
| Window warm | `cache · HOT m:ss` (the seconds tick live) |
| TTL passed with no cache activity | *nothing* (the line clears) |

Only a real countdown is rendered — the engine styles a plugin's status line
as a yellow warning, so an idle "waiting"/"COLD" placeholder would be noise
until the next turn re-arms it.

A cache read or a cache write on any finished turn re-arms the window: the
provider re-arms its TTL on a read as well as a write, so both reset the
anchor, and every turn in the session — subagent turns included — reads the
same shared cache prefix. A turn with no cache activity leaves the window
where it was; the countdown runs on until it goes cold.

Default TTL is 5 minutes; `CC_CACHE_LIVE_TTL=1h` switches to an hour. When
`CC_CACHE_LIVE_TTL` is unset, the engine's `CLAUDE_CODE_PROMPT_CACHE_TTL`
setting is honored, then the 5-minute default.

## The published file

Every finished turn with usage (and at session start and end) writes the
exact window to

    ~/.cache/ccstatusline/cache-live-<session_id>.json

set `CC_CACHE_LIVE_FILE=/path/to/file.json` to relocate it. The file names the
session so a status line script that sees `session_id` in its stdin JSON can
pick its own. Schema:

```json
{
  "schema": 1,
  "sessionId": "abc123…",
  "updatedAt": "2026-10-09T16:31:00.000Z",
  "updatedAtMs": 1760063460000,
  "warm": true,
  "ttl": "5m",
  "ttlMs": 300000,
  "lastWriteAt": "2026-10-09T16:31:00.000Z",
  "lastWriteAtMs": 1760063460000,
  "expiresAt": "2026-10-09T16:36:00.000Z",
  "expiresAtMs": 1760063760000,
  "tokens": { "input": 12000, "output": 500, "cacheRead": 2000, "cacheCreated": 10000 },
  "model": "claude-opus-5-5"
}
```

A status line script can render a second-accurate countdown by computing
`expiresAtMs - now` at render time — no per-second refresh, no transcript
parsing, and the value is right at the moment it is drawn.

## Best effort

The anchor is the finished turn's *completion* time, so during one very
long turn the fresh window is stamped up to a turn-duration late. That is the
same best-effort the transcript-based status lines already ship, and per-session
reads and writes re-arm often enough to keep the countdown honest.

## Tests

    claude plugin test cache-live

The suite drives the mod through the engine's own test kit: a cache-write
turn arms a five-minute window, the clock ticks the countdown live, a
cache-read turn re-arms it, a subagent turn shares the session's cache and
arms it too, a turn without cache activity leaves the window alone, the
`CC_CACHE_LIVE_TTL` / `CLAUDE_CODE_PROMPT_CACHE_TTL` / `CC_CACHE_LIVE_FILE`
env honors, and session end stops the tick and clears the line.

## ccstatusline

ccstatusline's built-in Cache Timer derives the window from the transcript
heuristic, which can flash a false "HOT" on a command like `/reload-plugins`
(an un-answered user line looks like work in progress). To make it render the
exact window instead — the plugin's published file for the current session —
apply the bundled patch:

    ~/.local/bin/ccstatusline-cachelive-patch

It is idempotent and re-runnable after `npm update ccstatusline` overwrites
the bundle. With the file present the Cache Timer shows the exact
`expiresAtMs` countdown; with no window it shows `n/a` instead of guessing.
