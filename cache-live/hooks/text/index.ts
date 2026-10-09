import type { CacheWindow } from '../window'

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * The pinned line's text for a window at a moment. Only a real countdown is
 * shown: `undefined` until the first cache touch, a live HOT countdown while
 * the window is warm, then `undefined` again once it passed its TTL. No
 * placeholder is ever rendered — the engine styles a plugin's status line as
 * a yellow warning, so an idle "waiting" line would be noise.
 */
export function statusTextOf(window: CacheWindow, atMs: number): string | undefined {
  if (!window.warm || window.expired(atMs)) return undefined

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
