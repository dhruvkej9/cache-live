import type { TurnUsage } from 'claude-code'

export const DEFAULT_TTL_MS = 5 * 60_000
export const HOUR_TTL_MS = 60 * 60_000

/**
 * The hot window of the session's prompt cache: the last moment a turn wrote
 * it or read it, and how long before it goes cold.
 *
 * The provider re-arms the TTL on a read as well as on a write, so any turn
 * that touched the cache resets the anchor; a turn with neither is no news
 * and leaves the window as it was. A turn that reports a cache read more
 * than five minutes after the previous anchor proves the one-hour tier
 * (a five-minute cache could not still be readable then) and promotes the
 * window to it.
 */
export class CacheWindow {
  warm = false
  lastWriteAtMs: number | null = null
  usage: TurnUsage | null = null
  ttlMs: number

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs
  }

  /**
   * Notes one turn's usage, re-arming the window when the turn created cache
   * entries or read any back.
   *
   * @returns true when the window's state moved (its anchor, warmth or TTL),
   *   meaning the pinned line and the published file need a refresh
   */
  note(usage: TurnUsage, atMs: number): boolean {
    const touched =
      usage.cache_creation_input_tokens > 0 || usage.cache_read_input_tokens > 0
    const before =
      this.warm && this.lastWriteAtMs !== null ? this.lastWriteAtMs : null
    const ttlBefore = this.ttlMs
    this.usage = usage
    if (touched) {
      if (
        usage.cache_read_input_tokens > 0 &&
        this.lastWriteAtMs !== null &&
        atMs - this.lastWriteAtMs > DEFAULT_TTL_MS
      ) {
        this.ttlMs = HOUR_TTL_MS
      }
      this.warm = true
      this.lastWriteAtMs = atMs
    }
    const after =
      this.warm && this.lastWriteAtMs !== null ? this.lastWriteAtMs : null

    return before !== after || ttlBefore !== this.ttlMs
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
 * The window's TTL in milliseconds: the mod's own `CC_CACHE_LIVE_TTL` when
 * set, else the engine's `CLAUDE_CODE_PROMPT_CACHE_TTL`, else the default.
 * Each takes `"5m"` or `"1h"`; anything else falls back to five minutes.
 */
export function ttlMsOf(
  override: string | undefined,
  engineValue: string | undefined,
): number {
  if (override === '1h' || (override === undefined && engineValue === '1h')) {
    return HOUR_TTL_MS
  }

  return DEFAULT_TTL_MS
}
