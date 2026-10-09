import type { On, TurnUsage } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { DEFAULT_TTL_MS, HOUR_TTL_MS } from '../hooks/window'

tier('user')

describe('register', () => {
  const NOW = 1_700_000_000_000
  const CACHE_DIR = '/home/u/.cache'

  const WRITING_TURN = {
    input_tokens: 12_000,
    output_tokens: 500,
    cache_read_input_tokens: 2_000,
    cache_creation_input_tokens: 10_000,
    model: 'claude-opus-5-5',
  } satisfies TurnUsage

  const turnOf = (usage: TurnUsage, agentId?: string) =>
    ({
      answer: 'done',
      durationMs: 1_000,
      isAborted: false,
      turnId: 'turn-1',
      agentId,
      reason: 'answer',
      usage,
    }) as const

  const onWorld = (
    on: On,
    writes: { path: string; text: string }[],
    statuses: (string | undefined)[],
    extra: Readonly<Record<string, string>> = {},
  ) => {
    mock.env(on, { HOME: '/home/u', XDG_CACHE_HOME: CACHE_DIR, ...extra })
    const clock = mock.clock(on, { now: NOW })
    on('session.id', () => ({ value: 'sess-1' }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.end', ($, e) => ({ sessionId: e.sessionId }))
    on('turn.complete', ($, e) => ({ text: e.answer }))
    on('ui.status', ($, e) => {
      statuses.push(e.text)
      return { value: undefined }
    })
    on('fs.write', ($, e) => {
      writes.push({ path: e.path, text: e.text })
      return { value: undefined }
    })

    return clock
  }

  const parsed = (text: string) => JSON.parse(text) as {
    sessionId: string | null
    warm: boolean
    expiresAtMs: number | null
    lastWriteAtMs: number | null
    ttl: string
    tokens: { cacheCreated: number }
    model: string | null
  }

  test('session start shows no pinned line yet and publishes an empty window', async ($, on) => {
    const writes: { path: string; text: string }[] = []
    const statuses: (string | undefined)[] = []
    onWorld(on, writes, statuses)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

    expect(statuses.at(-1), "no placeholder before the first cache touch").toBeUndefined()
    expect(writes).toHaveLength(1)
    const last = parsed(writes[0]!.text)
    expect(writes[0]!.path).toBe(`${CACHE_DIR}/ccstatusline/cache-live-sess-1.json`)
    expect(last.sessionId).toBe('sess-1')
    expect(last.warm).toBe(false)
    expect(last.lastWriteAtMs).toBeNull()
  })

  test('a cache-write turn arms a five-minute window and the line ticks live', async ($, on) => {
    const writes: { path: string; text: string }[] = []
    const statuses: (string | undefined)[] = []
    const clock = onWorld(on, writes, statuses)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.turn.complete(turnOf(WRITING_TURN))

    expect(statuses.at(-1)).toBe(`cache · HOT ${Math.floor(DEFAULT_TTL_MS / 60_000)}:00`)
    const armed = parsed(writes.at(-1)!.text)
    expect(armed.warm).toBe(true)
    expect(armed.lastWriteAtMs).toBe(NOW)
    expect(armed.expiresAtMs).toBe(NOW + DEFAULT_TTL_MS)

    await clock.advance(60_000)
    expect(statuses.at(-1)).toBe('cache · HOT 4:00')

    await clock.advance(DEFAULT_TTL_MS - 60_000)
    expect(statuses.at(-1), "the line clears once the window went cold").toBeUndefined()

    const before = statuses.length
    await clock.advance(120_000)
    expect(statuses.length, 'the tick stopped once cold').toBe(before)
    expect(parsed(writes.at(-1)!.text).expiresAtMs).toBe(NOW + DEFAULT_TTL_MS)
  })

  test('a cache-read turn re-arms the window instead of going cold', async ($, on) => {
    const writes: { path: string; text: string }[] = []
    const statuses: (string | undefined)[] = []
    const clock = onWorld(on, writes, statuses)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.turn.complete(turnOf(WRITING_TURN))
    await clock.advance(DEFAULT_TTL_MS - 1_000)

    const read = await $.turn.complete(
      turnOf({
        input_tokens: 9_000,
        output_tokens: 300,
        cache_read_input_tokens: 8_000,
        cache_creation_input_tokens: 0,
        model: 'claude-opus-5-5',
      }),
    )

    expect(read.text).toBe('done')
    expect(statuses.at(-1)).toBe(`cache · HOT ${Math.floor(DEFAULT_TTL_MS / 60_000)}:00`)
    expect(parsed(writes.at(-1)!.text).lastWriteAtMs).toBe(NOW + DEFAULT_TTL_MS - 1_000)
  })

  test('a cache read past five minutes past the anchor promotes the window to the hour tier', async ($, on) => {
    const writes: { path: string; text: string }[] = []
    const statuses: (string | undefined)[] = []
    const clock = onWorld(on, writes, statuses)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.turn.complete(turnOf(WRITING_TURN))
    await clock.advance(DEFAULT_TTL_MS + 1_000)

    const read = await $.turn.complete(
      turnOf({
        input_tokens: 9_000,
        output_tokens: 300,
        cache_read_input_tokens: 8_000,
        cache_creation_input_tokens: 0,
        model: 'claude-opus-5-5',
      }),
    )

    const armed = parsed(writes.at(-1)!.text)
    expect(armed.ttl, "only an hour cache could still be read now").toBe('1h')
    expect(armed.expiresAtMs).toBe(NOW + DEFAULT_TTL_MS + 1_000 + HOUR_TTL_MS)
    expect(statuses.at(-1)).toBe(`cache · HOT ${Math.floor(HOUR_TTL_MS / 60_000)}:00`)
  })

  test('a subagent turn shares the session cache and arms the window', async ($, on) => {
    const writes: { path: string; text: string }[] = []
    const statuses: (string | undefined)[] = []
    onWorld(on, writes, statuses)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const before = writes.length

    await $.turn.complete(turnOf(WRITING_TURN, 'agent-1'))

    expect(statuses.at(-1)).toBe(`cache · HOT ${Math.floor(DEFAULT_TTL_MS / 60_000)}:00`)
    expect(parsed(writes.at(-1)!.text).warm, "the subagent's cache activity armed the window").toBe(true)
    expect(writes.length).toBe(before + 1)
  })

  test('a turn with no cache activity leaves the window where it was', async ($, on) => {
    const writes: { path: string; text: string }[] = []
    const statuses: (string | undefined)[] = []
    const clock = onWorld(on, writes, statuses)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.turn.complete(turnOf(WRITING_TURN))
    await clock.advance(30_000)
    const seen = statuses.length

    await $.turn.complete(
      turnOf({
        input_tokens: 8_000,
        output_tokens: 200,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        model: 'claude-opus-5-5',
      }),
    )

    expect(statuses.length, 'no cache activity does not redraw the line').toBe(seen)
    expect(parsed(writes.at(-1)!.text).lastWriteAtMs).toBe(NOW)
  })

  test('CC_CACHE_LIVE_TTL=1h arms an hour window and the env names the file', async ($, on) => {
    const writes: { path: string; text: string }[] = []
    const statuses: (string | undefined)[] = []
    onWorld(on, writes, statuses, {
      CC_CACHE_LIVE_TTL: '1h',
      CC_CACHE_LIVE_FILE: '/tmp/cache-live.json',
    })

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.turn.complete(turnOf(WRITING_TURN))

    expect(writes.at(-1)!.path).toBe('/tmp/cache-live.json')
    const armed = parsed(writes.at(-1)!.text)
    expect(armed.ttl).toBe('1h')
    expect(armed.expiresAtMs).toBe(NOW + HOUR_TTL_MS)
  })

  test('the engine CLAUDE_CODE_PROMPT_CACHE_TTL arms the window when no override is set', async ($, on) => {
    const writes: { path: string; text: string }[] = []
    const statuses: (string | undefined)[] = []
    onWorld(on, writes, statuses, { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' })

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.turn.complete(turnOf(WRITING_TURN))

    const armed = parsed(writes.at(-1)!.text)
    expect(armed.ttl).toBe('1h')
    expect(armed.expiresAtMs).toBe(NOW + HOUR_TTL_MS)
  })

  test('session end stops the tick and clears the pinned line', async ($, on) => {
    const writes: { path: string; text: string }[] = []
    const statuses: (string | undefined)[] = []
    onWorld(on, writes, statuses)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.turn.complete(turnOf(WRITING_TURN))
    await $.session.end({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })

    expect(statuses.at(-1)).toBeUndefined()
    const last = parsed(writes.at(-1)!.text)
    expect(last.sessionId).toBe('sess-1')
    expect(last.warm, "the ending session's window is still the API's").toBe(true)
    expect(last.expiresAtMs).toBe(NOW + DEFAULT_TTL_MS)
    expect(last.tokens.cacheCreated, "the final file keeps the last turn's usage").toBe(10_000)
    expect(last.model).toBe('claude-opus-5-5')
  })
})
