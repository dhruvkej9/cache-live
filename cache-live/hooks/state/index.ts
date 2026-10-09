import type { TurnUsage } from 'claude-code'

import { HOUR_TTL_MS } from '../window'
import type { CacheWindow } from '../window'

/**
 * The JSON a status line script reads to render the cache window exactly:
 * the anchor (last read or write) the provider re-arms its TTL on, when the
 * window expires, and the turn's token counts as the API reported them.
 */
export type CacheLiveState = {
  schema: 1
  sessionId: string | null
  updatedAt: string
  updatedAtMs: number
  warm: boolean
  ttl: '5m' | '1h'
  ttlMs: number
  lastWriteAt: string | null
  lastWriteAtMs: number | null
  expiresAt: string | null
  expiresAtMs: number | null
  tokens: {
    input: number
    output: number
    cacheRead: number
    cacheCreated: number
  }
  model: string | null
}

export function stateOf(
  window: CacheWindow,
  usage: TurnUsage | null,
  sessionId: string | null,
  atMs: number,
): CacheLiveState {
  const last = window.lastWriteAtMs
  const expiresAtMs = last === null ? null : last + window.ttlMs

  return {
    schema: 1,
    sessionId,
    updatedAt: new Date(atMs).toISOString(),
    updatedAtMs: atMs,
    warm: window.warm,
    ttl: window.ttlMs >= HOUR_TTL_MS ? '1h' : '5m',
    ttlMs: window.ttlMs,
    lastWriteAt: last === null ? null : new Date(last).toISOString(),
    lastWriteAtMs: last,
    expiresAt:
      expiresAtMs === null ? null : new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    tokens: {
      input: usage?.input_tokens ?? 0,
      output: usage?.output_tokens ?? 0,
      cacheRead: usage?.cache_read_input_tokens ?? 0,
      cacheCreated: usage?.cache_creation_input_tokens ?? 0,
    },
    model: usage?.model ?? null,
  }
}
