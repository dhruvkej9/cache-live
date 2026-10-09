import type { CacheWindow } from '../window'

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * The pinned status line for a window at a moment: a live countdown while
 * the window is warm, else nothing. The mod draws only a real countdown —
 * never a placeholder for waiting or a fake cold state — so the line just
 * isn't there until a turn has touched the cache, and it goes away the
 * moment the window is past its TTL.
 */
export function statusTextOf(
  window: CacheWindow,
  atMs: number,
): string | undefined {
  if (!window.warm || window.expired(atMs)) return undefined

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
