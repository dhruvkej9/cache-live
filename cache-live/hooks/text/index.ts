import type { CacheWindow } from '../window'

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * The pinned status line for a window at a moment: a live countdown while
 * the window is warm, COLD once it has passed its TTL, and nothing before
 * the first cache touch. The line is always there once a window exists, so a
 * cold cache reads plainly — the next turn will rebuild it.
 */
export function statusTextOf(
  window: CacheWindow,
  atMs: number,
): string | undefined {
  if (!window.warm) return undefined
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
