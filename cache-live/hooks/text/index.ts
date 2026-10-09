import type { CacheWindow } from '../window'

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * The pinned line's text for a window at a moment: waiting until the first
 * cache touch, a live HOT countdown while the window is warm, COLD once it
 * passed its TTL.
 */
export function statusTextOf(window: CacheWindow, atMs: number): string {
  if (!window.warm) return 'cache · waiting'

  if (window.expired(atMs)) return 'cache · COLD'

  return `cache · HOT ${countdownOf(window, atMs)}`
}

/**
 * The remaining time before the window goes cold as `m:ss`.
 */
export function countdownOf(window: CacheWindow, atMs: number): string {
  const total = Math.floor(window.remainingMs(atMs) / 1000)
  const minutes = Math.floor(total / 60)

  return `${minutes}:${pad2(total % 60)}`
}
