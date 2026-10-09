import type { On, Timer, TurnUsage } from 'claude-code'

import { cacheFileOf } from './path'
import type { CacheFileEnv } from './path'
import { stateOf } from './state'
import { statusTextOf } from './text'
import { CacheWindow, ttlMsOf } from './window'

/**
 * The engine as `session.start` bound it from its `$`, each member spelled
 * `$.noun.event(...)` there; used by the helpers beneath, never `$` itself.
 */
export type CacheEngine = {
  now: () => Promise<number>
  writeFile: (path: string, text: string) => Promise<void>
  setStatus: (text: string | undefined) => void
  every: (ms: number, fn: () => void) => Timer
  sessionId: () => Promise<string>
}

/**
 * The cache-live mod: a live prompt-cache timer.
 *
 * Hooks the main thread's finished turns, where the API reports the cache
 * reads and writes the engine already holds, and arms the session's cache
 * window on any turn that touched the cache (the provider re-arms its TTL on
 * a read as well as a write). While the window is warm it ticks the remaining
 * time each second through the engine's own clock into a pinned line under
 * the prompt: live at one refresh per second, with no status line script
 * re-invoked and nothing parsed from transcripts. It also publishes the exact
 * window (the anchor, `expiresAt` and the turn's usage) to a JSON file under
 * the cache directory on every main-thread turn, so a status line script can
 * count it down from an exact anchor instead of best-effort guesswork.
 *
 * No noun is added; the mod's hooks and its file are the whole of it.
 *
 * @param on the engine's registrar
 */
export function register(on: On) {
  let engine: CacheEngine | null = null
  let fileEnv: CacheFileEnv = {}
  let window = new CacheWindow()
  let tick: Timer | undefined
  let sessionId: string | null = null
  let interactive = false

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

  const draw = (host: CacheEngine, atMs: number) => {
    host.setStatus(statusTextOf(window, atMs))

    if (interactive && window.warm && !window.expired(atMs)) {
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
    engine.setStatus(statusTextOf(window, await engine.now()))
    await writeState(engine, null).catch(() => undefined)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // The main conversation's cache is the status line's `prompt_cache`; a
    // subagent's turn is its own, not this window.
    if (engine !== null && e.agentId === undefined && e.usage !== undefined) {
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
      await writeState(engine, null).catch(() => undefined)
    }

    return next(e)
  })
}
