import type { CacheWindow } from '../window'

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * The pinned status line for a window at a moment. The line is always drawn
 * in an interactive session so the mod is never silent: `cache · idle` until
 * a turn has touched the cache, a live countdown while the window is warm,
 * and COLD once it has passed its TTL.
 */
export function statusTextOf(
  window: CacheWindow,
  atMs: number,
): string {
  if (!window.warm) return 'cache · idle'
  if (window.expired(atMs)) return 'cache · COLD'

  return `cache · 🟢 ${countdownOf(window, atMs)}`
}

/**
 * The remaining time before the window goes cold as `m:ss`.
 */
export function countdownOf(window: CacheWindow, atMs: number): string {
  const total = Math.floor(window.remainingMs(atMs) / 1000)
  const minutes = Math.floor(total / 60)

  return `${minutes}:${pad2(total % 60)}`
}
