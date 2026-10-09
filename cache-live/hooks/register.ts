import type { On, TurnUsage } from 'claude-code'

import { cacheFileOf } from './path'
import type { CacheFileEnv } from './path'
import { readSeed } from './seed'
import { stateOf } from './state'
import { CacheWindow, ttlMsOf } from './window'

/**
 * The engine as `session.start` bound it from its `$`, each member spelled
 * `$.noun.event(...)` there; used by the helpers beneath, never `$` itself.
 */
export type CacheEngine = {
  now: () => Promise<number>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, text: string) => Promise<void>
  sessionId: () => Promise<string>
}

/**
 * The cache-live mod: feeds a prompt-cache timer.
 *
 * Hooks the finished turns, where the API reports the cache reads and writes
 * the engine already holds, and arms the session's cache window on any turn
 * that touched the cache — the provider re-arms its TTL on a read as well as
 * a write, and every turn in the session runs against its shared cache
 * prefix, subagent turns included. It publishes the exact window (the anchor,
 * `expiresAt` and the turn's usage) to a JSON file under the cache directory
 * on every turn, so a status line script can count it down from an exact
 * anchor instead of best-effort guesswork. A reopened session is seeded from
 * its own transcript, so the window is right again before the first new turn.
 *
 * The mod draws nothing itself; the status line draws the timer.
 *
 * @param on the engine's registrar
 */
export function register(on: On) {
  let engine: CacheEngine | null = null
  let fileEnv: CacheFileEnv = {}
  let window = new CacheWindow()
  let sessionId: string | null = null

  const writeState = async (host: CacheEngine, usage: TurnUsage | null) => {
    const atMs = await host.now()
    const state = stateOf(window, usage, sessionId, atMs)

    await host.writeFile(
      cacheFileOf({ ...fileEnv, sessionId: sessionId ?? undefined }),
      JSON.stringify(state, null, 2),
    )
  }

  on('session.start', async ($, e, next) => {
    engine = {
      now: () => $.clock.now(),
      readFile: path => $.fs.read(path),
      writeFile: (path, text) => $.fs.write(path, text),
      sessionId: () => $.session.id(),
    }
    fileEnv = {
      override: await $.env.get('CC_CACHE_LIVE_FILE'),
      xdgCacheHome: await $.env.get('XDG_CACHE_HOME'),
      home: await $.env.get('HOME'),
      userProfile: await $.env.get('USERPROFILE'),
    }
    window = new CacheWindow(
      ttlMsOf(
        await $.env.get('CC_CACHE_LIVE_TTL'),
        await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL'),
      ),
    )
    sessionId = await engine.sessionId().catch(() => null)
    const seed = await readSeed(
      engine,
      fileEnv.home ?? fileEnv.userProfile,
      e.cwd,
      sessionId,
    ).catch(() => null)
    if (seed !== null) window.note(seed.usage, seed.atMs)
    await writeState(engine, window.usage).catch(() => undefined)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // Any turn that touched the cache re-arms the provider's TTL: every turn
    // in the session reads the same cache prefix, so a subagent's turn counts
    // too (and newer engines may not tag the main loop's turn at all).
    if (engine !== null && e.usage !== undefined) {
      const atMs = await engine.now()
      window.note(e.usage, atMs)
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
