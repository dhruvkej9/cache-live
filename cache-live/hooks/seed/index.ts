import type { TurnUsage } from 'claude-code'

/**
 * The last cache-touching turn a session's transcript records, with the
 * moment it happened. This is how a resumed session learns its cache is still
 * warm before any new turn completes — `turn.complete` only reports turns
 * that finish after the plugin loaded, so without it a reopened session would
 * show nothing until the next prompt.
 */
export type CacheSeed = { usage: TurnUsage; atMs: number } | null

/**
 * The path of the session's transcript on disk: the projects directory names
 * a folder after the working directory (its absolute path with `/`→`-`) and
 * the file after the session id. Best effort — a version that encodes
 * differently just yields a missing file, and the seed falls back silently.
 */
export function transcriptPathOf(
  home: string | undefined,
  cwd: string,
  sessionId: string,
): string {
  if (home === undefined) return ''
  return `${home}/.claude/projects/${cwd.replaceAll('/', '-')}/${sessionId}.jsonl`
}

/**
 * The newest assistant-turn entry in the transcript whose API usage shows
 * real cache activity (a write or a read), and when it landed. Strict: a
 * line without usage, an API error or a sidechain is skipped, so a plain
 * user command like `/reload-plugins` is no news — unlike the loose status
 * line heuristics that flash HOT on it.
 */
export function lastCacheSeedOf(text: string): CacheSeed {
  let seed: CacheSeed = null
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      const entry = JSON.parse(line) as {
        isSidechain?: boolean
        isApiErrorMessage?: boolean
        timestamp?: string
        message?: { usage?: TurnUsage }
      }
      if (entry.isSidechain === true || entry.isApiErrorMessage === true) {
        continue
      }
      const usage = entry.message?.usage
      if (!usage) continue
      if (
        (usage.cache_creation_input_tokens ?? 0) <= 0 &&
        (usage.cache_read_input_tokens ?? 0) <= 0
      ) {
        continue
      }
      const atMs = entry.timestamp ? Date.parse(entry.timestamp) : Number.NaN
      if (Number.isNaN(atMs)) continue
      seed = { usage, atMs }
    } catch {
      continue
    }
  }

  return seed
}

/**
 * Reads the session's transcript and finds the last cache-touching turn.
 * Null when the transcript is missing or unreadable, has no cache activity,
 * or the session id is unknown.
 */
export async function readSeed(
  host: { readFile: (path: string) => Promise<string> },
  home: string | undefined,
  cwd: string,
  sessionId: string | null,
): Promise<CacheSeed> {
  if (sessionId === null) return null
  const path = transcriptPathOf(home, cwd, sessionId)
  if (path === '') return null

  return lastCacheSeedOf(await host.readFile(path))
}
