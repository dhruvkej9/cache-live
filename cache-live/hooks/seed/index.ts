import type { TurnUsage } from 'claude-code'

import type { CacheLiveState } from '../state'

/**
 * A cache window read back at session start: a resume carries the exact
 * window the previous run published (anchor, TTL, warmth) with no transcript
 * scan at all — the state file is a few hundred bytes even for a session
 * whose transcript runs to hundreds of megabytes.
 */
export type StateSeed = {
  lastWriteAtMs: number
  ttlMs: number
  usage: TurnUsage | null
}

/**
 * The state file path carries the session's window with it, read at resume.
 */
export type StateSeedHost = {
  readFile: (path: string) => Promise<string>
}

/**
 * Reads the mod's published state file and returns the window it recorded:
 * null when the file is missing, unreadable, not ours, or the window was not
 * warm when it was last written.
 */
export async function readStateSeed(
  host: StateSeedHost,
  path: string,
): Promise<StateSeed | null> {
  let text: string
  try {
    text = await host.readFile(path)
  } catch {
    return null
  }

  try {
    const state = JSON.parse(text) as CacheLiveState
    if (state.schema !== 1) return null
    if (state.warm !== true || state.lastWriteAtMs == null) return null

    const cacheRead = state.tokens.cacheRead ?? 0
    const cacheCreated = state.tokens.cacheCreated ?? 0
    const usage: TurnUsage | null =
      cacheRead > 0 || cacheCreated > 0
        ? {
            input_tokens: state.tokens.input ?? 0,
            output_tokens: state.tokens.output ?? 0,
            cache_read_input_tokens: cacheRead,
            cache_creation_input_tokens: cacheCreated,
            model: state.model ?? '',
          }
        : null

    return { lastWriteAtMs: state.lastWriteAtMs, ttlMs: state.ttlMs, usage }
  } catch {
    return null
  }
}
