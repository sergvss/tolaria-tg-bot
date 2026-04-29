import { describe, it, expect, vi } from 'vitest'
import { putFile, putBinary, utf8ToBase64, bytesToBase64, randomHex, PathConflictError } from './github'

const VALID_PARAMS = {
  token: 'gh_pat_xxx',
  repo: 'sergvss/mynote',
  branch: 'main',
  path: 'inbox/2026-04-28-1845-test.md',
  content: 'hello world',
  commitMessage: 'Add note',
}

function mockSuccess(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        content: {
          path: 'inbox/2026-04-28-1845-test.md',
          sha: 'abc123',
          html_url: 'https://github.com/sergvss/mynote/blob/main/inbox/2026-04-28-1845-test.md',
        },
      }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    ),
  )
}

describe('bytesToBase64', () => {
  it('кодирует пустой массив', () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe('')
  })

  it('кодирует JPEG-сигнатуру', () => {
    expect(bytesToBase64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('/9j/4A==')
  })

  it('кодирует PNG-сигнатуру', () => {
    expect(bytesToBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
      .toBe('iVBORw0KGgo=')
  })
})

describe('putBinary', () => {
  it('возвращает path, sha, htmlUrl при успехе', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: {
            path: 'attachments/photo.jpg',
            sha: 'binsha',
            html_url: 'https://github.com/sergvss/mynote/blob/main/attachments/photo.jpg',
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    )
    const result = await putBinary(
      {
        token: 'gh_pat_xxx',
        repo: 'sergvss/mynote',
        branch: 'main',
        path: 'attachments/photo.jpg',
        content: new Uint8Array([0xff, 0xd8, 0xff]),
        commitMessage: 'Add attachment',
      },
      fetchMock as unknown as typeof fetch,
    )
    expect(result.path).toBe('attachments/photo.jpg')
    expect(result.sha).toBe('binsha')
  })

  it('кодирует Uint8Array в base64 без UTF-8 интерпретации', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: { path: 'x', sha: 'y', html_url: 'z' } }), {
        status: 201,
      }),
    )
    await putBinary(
      {
        token: 't',
        repo: 'r/r',
        branch: 'main',
        path: 'a.bin',
        content: new Uint8Array([0xff, 0xfe, 0xfd]),
        commitMessage: 'Add a.bin',
      },
      fetchMock as unknown as typeof fetch,
    )
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.content).toBe('//79')
  })

  it('бросает PathConflictError при HTTP 422', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid request' }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(
      putBinary(
        {
          token: 't',
          repo: 'r/r',
          branch: 'main',
          path: 'attachments/dup.jpg',
          content: new Uint8Array([1, 2, 3]),
          commitMessage: 'Add dup',
        },
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(PathConflictError)
  })
})

describe('utf8ToBase64', () => {
  it('кодирует ASCII', () => {
    expect(utf8ToBase64('hello')).toBe('aGVsbG8=')
  })

  it('кодирует кириллицу как UTF-8', () => {
    expect(utf8ToBase64('Привет')).toBe('0J/RgNC40LLQtdGC')
  })

  it('кодирует эмодзи', () => {
    expect(utf8ToBase64('💡')).toBe('8J+SoQ==')
  })
})

describe('randomHex', () => {
  it('возвращает строку длины 2*N для N байт', () => {
    expect(randomHex(2)).toMatch(/^[0-9a-f]{4}$/)
    expect(randomHex(8)).toMatch(/^[0-9a-f]{16}$/)
  })

  it('даёт разные значения при повторных вызовах', () => {
    const a = randomHex(8)
    const b = randomHex(8)
    expect(a).not.toBe(b)
  })
})

describe('putFile', () => {
  it('возвращает path, sha и htmlUrl при успехе', async () => {
    const fetchMock = mockSuccess()
    const result = await putFile(VALID_PARAMS, fetchMock as unknown as typeof fetch)
    expect(result).toEqual({
      path: 'inbox/2026-04-28-1845-test.md',
      sha: 'abc123',
      htmlUrl: 'https://github.com/sergvss/mynote/blob/main/inbox/2026-04-28-1845-test.md',
    })
  })

  it('бросает PathConflictError при HTTP 422', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid request' }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(
      putFile(VALID_PARAMS, fetchMock as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(PathConflictError)
  })

  it('бросает Error при HTTP 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Bad credentials' }), {
        status: 401,
      }),
    )
    await expect(
      putFile(VALID_PARAMS, fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/HTTP 401/)
  })

  it('бросает Error при HTTP 5xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 502 }))
    await expect(
      putFile(VALID_PARAMS, fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/HTTP 502/)
  })

  it('кидает PUT по правильному URL с энкодом пути', async () => {
    const fetchMock = mockSuccess()
    await putFile(
      { ...VALID_PARAMS, path: 'inbox/файл с пробелом.md' },
      fetchMock as unknown as typeof fetch,
    )
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('https://api.github.com/repos/sergvss/mynote/contents/')
    expect(url).toContain('%20')
    expect(url).not.toContain('inbox/файл с пробелом.md')
  })

  it('передаёт корректные заголовки авторизации и API version', async () => {
    const fetchMock = mockSuccess()
    await putFile(VALID_PARAMS, fetchMock as unknown as typeof fetch)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer gh_pat_xxx')
    expect(headers.Accept).toBe('application/vnd.github+json')
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28')
    expect(headers['User-Agent']).toBe('tolaria-tg-bot')
  })

  it('передаёт base64-encoded content, branch и commit message в теле', async () => {
    const fetchMock = mockSuccess()
    await putFile(VALID_PARAMS, fetchMock as unknown as typeof fetch)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.branch).toBe('main')
    expect(body.message).toBe('Add note')
    expect(body.content).toBe(utf8ToBase64('hello world'))
  })

  it('делает метод PUT', async () => {
    const fetchMock = mockSuccess()
    await putFile(VALID_PARAMS, fetchMock as unknown as typeof fetch)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('PUT')
  })
})
