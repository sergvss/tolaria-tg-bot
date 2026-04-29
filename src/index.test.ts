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

interface MockFetchOpts {
  telegram?: TelegramUpdate[]
  telegramFile?: { file_id?: string; file_unique_id?: string; file_path?: string }
  fileBytes?: Uint8Array
  github?: MockResponse[]
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function makeFetch(opts: MockFetchOpts) {
  let ghIdx = 0
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)

    if (url.includes('/getFile')) {
      const file = opts.telegramFile ?? {
        file_id: 'AGADxxx',
        file_unique_id: 'AQADxxx',
        file_path: 'photos/file_42.jpg',
      }
      return jsonResponse({ ok: true, result: file })
    }

    if (url.includes('/file/bot')) {
      const bytes = opts.fileBytes ?? new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
      return new Response(bytes, { status: 200 })
    }

    if (url.includes('api.telegram.org')) {
      return jsonResponse({ ok: true, result: opts.telegram ?? [] })
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

describe('processUpdates — текстовые сценарии', () => {
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

  it('делает retry с суффиксом при 422 от GitHub для заметки', async () => {
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

describe('processUpdates — фото-сценарии', () => {
  function tgPhotoUpdate(overrides: Partial<TelegramUpdate> = {}): TelegramUpdate {
    return {
      update_id: 200,
      message: {
        message_id: 5,
        date: Date.UTC(2026, 3, 29, 10, 5, 30) / 1000,
        chat: { id: ALLOWED, type: 'private' },
        from: { id: ALLOWED, is_bot: false },
        photo: [
          { file_id: 'small', file_unique_id: 'us', width: 100, height: 100 },
          { file_id: 'large', file_unique_id: 'AQADAg', width: 1280, height: 720 },
        ],
      },
      ...overrides,
    }
  }

  it('фото без caption — заливает картинку в attachments/ и заметку в inbox/', async () => {
    const env = makeEnv()
    const fetchMock = makeFetch({
      telegram: [tgPhotoUpdate()],
      telegramFile: {
        file_id: 'large',
        file_unique_id: 'AQADAg',
        file_path: 'photos/file_42.jpg',
      },
      fileBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    })
    await processUpdates(env, fetchMock as unknown as typeof fetch)

    const ghCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('api.github.com'),
    )
    expect(ghCalls).toHaveLength(2)

    const attachmentUrl = String(ghCalls[0]![0])
    const noteUrl = String(ghCalls[1]![0])
    expect(attachmentUrl).toContain('contents/attachments/2026-04-29-100530-AQADAg.jpg')
    expect(noteUrl).toContain('contents/inbox/2026-04-29-100530.md')

    const noteInit = ghCalls[1]![1] as RequestInit
    const noteBody = JSON.parse(noteInit.body as string)
    const noteContent = decodeBase64Utf8(noteBody.content)
    expect(noteContent).toContain('![photo.jpg](attachments/2026-04-29-100530-AQADAg.jpg)')
    expect(noteContent).toContain('type: Note')
  })

  it('фото с caption — caption становится H1', async () => {
    const env = makeEnv()
    const upd = {
      update_id: 201,
      message: {
        message_id: 5,
        date: Date.UTC(2026, 3, 29, 10, 5, 30) / 1000,
        chat: { id: ALLOWED, type: 'private' as const },
        from: { id: ALLOWED, is_bot: false },
        photo: [{ file_id: 'one', file_unique_id: 'OneId', width: 800, height: 600 }],
        caption: 'Заголовок\nОстальное',
      },
    }
    const fetchMock = makeFetch({
      telegram: [upd],
      telegramFile: { file_path: 'photos/file_1.png', file_unique_id: 'OneId' },
    })
    await processUpdates(env, fetchMock as unknown as typeof fetch)

    const ghCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('api.github.com'),
    )
    const noteInit = ghCalls[1]![1] as RequestInit
    const content = decodeBase64Utf8(JSON.parse(noteInit.body as string).content)
    expect(content).toContain('# Заголовок')
    expect(content).toContain('![photo.png](attachments/2026-04-29-100530-OneId.png)')
  })

  it('PathConflictError на attachment — silent skip, заметка всё равно коммитится', async () => {
    const env = makeEnv()
    const fetchMock = makeFetch({
      telegram: [tgPhotoUpdate()],
      telegramFile: { file_path: 'photos/dup.jpg', file_unique_id: 'AQADAg' },
      github: [
        { status: 422, body: { message: 'attachment already exists' } },
        { status: 201, body: { content: { path: 'x', sha: 'y', html_url: 'z' } } },
      ],
    })
    await processUpdates(env, fetchMock as unknown as typeof fetch)

    const ghCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('api.github.com'),
    )
    expect(ghCalls).toHaveLength(2)
    expect(env.OFFSETS.put).toHaveBeenCalled()
  })

  it('forward из канала с фото — frontmatter содержит forwarded_from', async () => {
    const env = makeEnv()
    const upd: TelegramUpdate = {
      update_id: 300,
      message: {
        message_id: 9,
        date: Date.UTC(2026, 3, 29, 10, 5, 30) / 1000,
        chat: { id: ALLOWED, type: 'private' },
        from: { id: ALLOWED, is_bot: false },
        photo: [{ file_id: 'pf', file_unique_id: 'FwdId', width: 800, height: 600 }],
        caption: 'Подпись',
        forward_origin: {
          type: 'channel',
          date: 1,
          chat: { id: -100, type: 'channel', title: 'Some Channel' },
        },
      },
    }
    const fetchMock = makeFetch({
      telegram: [upd],
      telegramFile: { file_path: 'photos/fwd.jpg', file_unique_id: 'FwdId' },
    })
    await processUpdates(env, fetchMock as unknown as typeof fetch)

    const ghCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('api.github.com'),
    )
    const noteInit = ghCalls[1]![1] as RequestInit
    const content = decodeBase64Utf8(JSON.parse(noteInit.body as string).content)
    expect(content).toContain('forwarded_from: Some Channel')
  })

  it('сначала attachment, потом заметка (порядок коммитов важен)', async () => {
    const env = makeEnv()
    const fetchMock = makeFetch({ telegram: [tgPhotoUpdate()] })
    await processUpdates(env, fetchMock as unknown as typeof fetch)

    const ghCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('api.github.com'),
    )
    const firstUrl = String(ghCalls[0]![0])
    const secondUrl = String(ghCalls[1]![0])
    expect(firstUrl).toContain('attachments/')
    expect(secondUrl).toContain('inbox/')
  })
})
