import type { TurnUsage } from 'claude-code'

export const DEFAULT_TTL_MS = 5 * 60_000
export const HOUR_TTL_MS = 60 * 60_000

/**
 * The hot window of the session's prompt cache: the last moment a main-thread
 * turn wrote it or read it, and how long before it goes cold.
 *
 * The provider re-arms the TTL on a read as well as on a write, so any turn
 * that touched the cache resets the anchor; a turn with neither is no news
 * and leaves the window as it was.
 */
export class CacheWindow {
  warm = false
  lastWriteAtMs: number | null = null
  usage: TurnUsage | null = null

  constructor(readonly ttlMs: number = DEFAULT_TTL_MS) {}

  /**
   * Notes one main-thread turn's usage, re-arming the window when the turn
   * created cache entries or read any back.
   *
   * @returns true when the window's state moved (its anchor or its warmth),
   *   meaning the pinned line and the published file need a refresh
   */
  note(usage: TurnUsage, atMs: number): boolean {
    const touched =
      usage.cache_creation_input_tokens > 0 || usage.cache_read_input_tokens > 0
    const before =
      this.warm && this.lastWriteAtMs !== null ? this.lastWriteAtMs : null
    this.usage = usage
    if (touched) {
      this.warm = true
      this.lastWriteAtMs = atMs
    }
    const after =
      this.warm && this.lastWriteAtMs !== null ? this.lastWriteAtMs : null

    return before !== after
  }

  /**
   * Milliseconds until the window goes cold; 0 before the first cache touch
   * and once the window is past its TTL.
   */
  remainingMs(atMs: number): number {
    if (!this.warm || this.lastWriteAtMs === null) return 0
    const remaining = this.lastWriteAtMs + this.ttlMs - atMs

    return remaining > 0 ? remaining : 0
  }

  /**
   * Whether the armed window is past its TTL (and therefore cold).
   */
  expired(atMs: number): boolean {
    return this.warm && this.remainingMs(atMs) === 0
  }
}

/**
 * The `CC_CACHE_LIVE_TTL` env value (`"5m"` or `"1h"`) as milliseconds; an
 * unknown value falls back to the five-minute default.
 */
export function ttlMsOf(value: string | undefined): number {
  if (value === '1h') return HOUR_TTL_MS

  return DEFAULT_TTL_MS
}
