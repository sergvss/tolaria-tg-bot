import { describe, it, expect, vi } from 'vitest'
import { processUpdates, type Env } from './index'
import type { TelegramUpdate } from './telegram'

const ALLOWED = 12345

function makeKV(initial: Record<string, string> = {}): KVNamespace {
  const store: Record<string, string> = { ...initial }
  return {
    get: vi.fn(async (k: string) => store[k] ?? null),
    put: vi.fn(async (k: string, v: string) => {
      store[k] = v
    }),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    BOT_TOKEN: 'BOT_TOKEN',
    GH_TOKEN: 'GH_TOKEN',
    GH_REPO: 'sergvss/mynote',
    GH_FOLDER: 'inbox',
    GH_BRANCH: 'main',
    ALLOWED_USER_ID: String(ALLOWED),
    OFFSETS: makeKV(),
    ...overrides,
  }
}

function tgUpdate(overrides: Partial<TelegramUpdate> = {}): TelegramUpdate {
  return {
    update_id: 100,
    message: {
      message_id: 1,
      date: Date.UTC(2026, 3, 28, 18, 45) / 1000,
      chat: { id: ALLOWED, type: 'private' },
      from: { id: ALLOWED, is_bot: false },
      text: 'hello',
    },
    ...overrides,
  }
}

interface MockResponse {
  status?: number
  body?: unknown
}

function makeFetch(opts: {
  telegram?: TelegramUpdate[]
  github?: MockResponse[]
}) {
  let ghIdx = 0
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)
    if (url.includes('api.telegram.org')) {
      return new Response(JSON.stringify({ ok: true, result: opts.telegram ?? [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('api.github.com')) {
      const r = opts.github?.[ghIdx++] ?? {
        status: 201,
        body: { content: { path: 'x', sha: 'y', html_url: 'z' } },
      }
      return new Response(r.body ? JSON.stringify(r.body) : '', {
        status: r.status ?? 201,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('unexpected', { status: 404 })
  })
}

describe('processUpdates', () => {
  it('не пишет в KV, если апдейтов нет', async () => {
    const env = makeEnv()
    const fetchMock = makeFetch({ telegram: [] })
    await processUpdates(env, fetchMock as unknown as typeof fetch)
    expect((env.OFFSETS.put as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
  })

  it('коммитит файл в GitHub для allowed text update и обновляет offset', async () => {
    const env = makeEnv()
    const fetchMock = makeFetch({ telegram: [tgUpdate({ update_id: 42 })] })
    await processUpdates(env, fetchMock as unknown as typeof fetch)

    const ghCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('api.github.com'),
    )
    expect(ghCall).toBeDefined()
    expect(env.OFFSETS.put).toHaveBeenCalledWith('last_offset', '43')
  })

  it('пропускает чужого пользователя, но всё равно двигает offset', async () => {
    const env = makeEnv()
    const stranger = tgUpdate({
      update_id: 50,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 999, type: 'private' },
        from: { id: 999, is_bot: false },
        text: 'spam',
      },
    })
    const fetchMock = makeFetch({ telegram: [stranger] })
    await processUpdates(env, fetchMock as unknown as typeof fetch)

    const ghCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('api.github.com'),
    )
    expect(ghCall).toBeUndefined()
    expect(env.OFFSETS.put).toHaveBeenCalledWith('last_offset', '51')
  })

  it('читает существующий offset из KV и передаёт его в getUpdates', async () => {
    const env = makeEnv({ OFFSETS: makeKV({ last_offset: '99' }) })
    const fetchMock = makeFetch({ telegram: [] })
    await processUpdates(env, fetchMock as unknown as typeof fetch)

    const tgUrl = String(fetchMock.mock.calls[0]![0])
    expect(tgUrl).toContain('offset=99')
  })

  it('делает retry с суффиксом при 422 от GitHub', async () => {
    const env = makeEnv()
    const fetchMock = makeFetch({
      telegram: [tgUpdate()],
      github: [
        { status: 422, body: { message: 'path exists' } },
        { status: 201, body: { content: { path: 'x', sha: 'y', html_url: 'z' } } },
      ],
    })
    await processUpdates(env, fetchMock as unknown as typeof fetch)

    const ghCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('api.github.com'),
    )
    expect(ghCalls).toHaveLength(2)
    const firstUrl = String(ghCalls[0]![0])
    const secondUrl = String(ghCalls[1]![0])
    expect(firstUrl).not.toBe(secondUrl)
  })

  it('бросает после 3 неудачных попыток подряд', async () => {
    const env = makeEnv()
    const fetchMock = makeFetch({
      telegram: [tgUpdate()],
      github: [
        { status: 422, body: { message: 'path exists' } },
        { status: 422, body: { message: 'path exists' } },
        { status: 422, body: { message: 'path exists' } },
      ],
    })
    await expect(
      processUpdates(env, fetchMock as unknown as typeof fetch),
    ).rejects.toThrow()
  })

  it('бросает понятную ошибку при невалидном ALLOWED_USER_ID', async () => {
    const env = makeEnv({ ALLOWED_USER_ID: 'not-a-number' })
    const fetchMock = makeFetch({ telegram: [] })
    await expect(
      processUpdates(env, fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/ALLOWED_USER_ID/)
  })

  it('использует GH_BRANCH=main по умолчанию, если не задан', async () => {
    const env = makeEnv()
    delete env.GH_BRANCH
    const fetchMock = makeFetch({ telegram: [tgUpdate()] })
    await processUpdates(env, fetchMock as unknown as typeof fetch)

    const ghCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('api.github.com'),
    )!
    const init = ghCall[1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.branch).toBe('main')
  })
})
