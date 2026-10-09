import type { On, Timer, TurnUsage } from 'claude-code'

import { cacheFileOf } from './path'
import type { CacheFileEnv } from './path'
import { readSeed } from './seed'
import { stateOf } from './state'
import { statusTextOf } from './text'
import { CacheWindow, ttlMsOf } from './window'

/**
 * The engine as `session.start` bound it from its `$`, each member spelled
 * `$.noun.event(...)` there; used by the helpers beneath, never `$` itself.
 */
export type CacheEngine = {
  now: () => Promise<number>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, text: string) => Promise<void>
  setStatus: (text: string | undefined) => void
  every: (ms: number, fn: () => void) => Timer
  sessionId: () => Promise<string>
}

/**
 * The cache-live mod: a live prompt-cache timer and status line.
 *
 * Hooks the finished turns, where the API reports the cache reads and writes
 * the engine already holds, and arms the session's cache window on any turn
 * that touched the cache — the provider re-arms its TTL on a read as well as
 * a write, and every turn in the session runs against its shared cache
 * prefix, subagent turns included. A reopened session is seeded from its own
 * transcript, so the window is warm again before any new turn completes.
 *
 * While the window is warm in an interactive session, the mod pins its own
 * status line under the prompt (`$.ui.status`) and ticks the remaining time
 * each second through `$.clock.every`: a live countdown drawn by the mod
 * itself, with no status line script re-invoked and nothing parsed from
 * transcripts. The line is only ever a real countdown: nothing until a turn
 * has touched the cache, and nothing once the window has gone cold. It also
 * publishes the exact window (the anchor, `expiresAt` and the turn's usage)
 * to a JSON file under the cache directory on every turn, for scripts that
 * want the same anchor outside the session.
 *
 * The mod draws nothing in non-interactive runs; the hooks still arm and
 * publish there, so a status line script can count the window down from the
 * published anchor.
 *
 * @param on the engine's registrar
 */
export function register(on: On) {
  let engine: CacheEngine | null = null
  let fileEnv: CacheFileEnv = {}
  let window = new CacheWindow()
  let sessionId: string | null = null
  let interactive = false
  let tick: Timer | undefined

  const stopTick = () => {
    tick?.cancel()
    tick = undefined
  }

  const writeState = async (host: CacheEngine, usage: TurnUsage | null) => {
    const atMs = await host.now()
    const state = stateOf(window, usage, sessionId, atMs)

    await host.writeFile(
      cacheFileOf({ ...fileEnv, sessionId: sessionId ?? undefined }),
      JSON.stringify(state, null, 2),
    )
  }

  /**
   * Redraws the pinned line and keeps (or stops) the one-second tick that
   * makes the countdown live. Nothing is pinned and no tick runs when the
   * session isn't interactive or the window is cold or not yet touched.
   *
   * @param host the engine to draw through
   * @param atMs the moment the window's state was last noted
   */
  const draw = (host: CacheEngine, atMs: number) => {
    if (!interactive) return stopTick()

    host.setStatus(statusTextOf(window, atMs))

    if (window.warm && !window.expired(atMs)) {
      if (tick === undefined) {
        tick = host.every(1000, async () => {
          const now = await host.now()
          host.setStatus(statusTextOf(window, now))
          if (!window.warm || window.expired(now)) stopTick()
        })
      }
    } else {
      stopTick()
    }
  }

  on('session.start', async ($, e, next) => {
    engine = {
      now: () => $.clock.now(),
      readFile: path => $.fs.read(path),
      writeFile: (path, text) => $.fs.write(path, text),
      setStatus: text => $.ui.status(text),
      every: (ms, fn) => $.clock.every(ms, fn),
      sessionId: () => $.session.id(),
    }
    fileEnv = {
      override: await $.env.get('CC_CACHE_LIVE_FILE'),
      xdgCacheHome: await $.env.get('XDG_CACHE_HOME'),
      home: await $.env.get('HOME'),
      userProfile: await $.env.get('USERPROFILE'),
    }
    interactive = e.isInteractive
    window = new CacheWindow(
      ttlMsOf(
        await $.env.get('CC_CACHE_LIVE_TTL'),
        await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL'),
      ),
    )
    stopTick()
    sessionId = await engine.sessionId().catch(() => null)
    const seed = await readSeed(
      engine,
      fileEnv.home ?? fileEnv.userProfile,
      e.cwd,
      sessionId,
    ).catch(() => null)
    if (seed !== null) window.note(seed.usage, seed.atMs)
    draw(engine, await engine.now())
    await writeState(engine, window.usage).catch(() => undefined)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // Any turn that touched the cache re-arms the provider's TTL: every turn
    // in the session reads the same cache prefix, so a subagent's turn counts
    // too (and newer engines may not tag the main loop's turn at all).
    if (engine !== null && e.usage !== undefined) {
      const atMs = await engine.now()
      const moved = window.note(e.usage, atMs)
      if (moved) draw(engine, atMs)
      await writeState(engine, e.usage).catch(() => undefined)
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    stopTick()
    if (engine !== null) {
      engine.setStatus(undefined)
      await writeState(engine, window.usage).catch(() => undefined)
    }

    return next(e)
  })
}
