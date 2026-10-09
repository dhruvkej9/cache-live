/**
 * The environment the published state file is placed under; each value as
 * `$.env.get` answers it (absent when unset).
 */
export type CacheFileEnv = {
  override?: string
  xdgCacheHome?: string
  home?: string
  userProfile?: string
  sessionId?: string
}

/**
 * The JSON file the cache window is published to: `CC_CACHE_LIVE_FILE` when
 * set, else under the cache directory's `ccstatusline/` (the directory
 * ccstatusline already caches its slow reads into), named by session so a
 * status line script that knows `session_id` can pick its own. `/` as the
 * separator works on every host a plugin reaches, Windows included.
 */
export function cacheFileOf(env: CacheFileEnv): string {
  if (env.override !== undefined) return env.override

  const base =
    env.xdgCacheHome ?? `${env.home ?? env.userProfile ?? '.'}/.cache`

  const name = env.sessionId
    ? `cache-live-${env.sessionId}.json`
    : 'cache-live.json'

  return `${base}/ccstatusline/${name}`
}
