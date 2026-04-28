import { describe, it, expect, vi } from 'vitest'
import { getUpdates, isAllowedTextMessage, type TelegramUpdate } from './telegram'

const ALLOWED = 12345

function makeUpdate(overrides: Partial<TelegramUpdate> = {}): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 100,
      date: 1714312345,
      chat: { id: ALLOWED, type: 'private' },
      from: { id: ALLOWED, is_bot: false },
      text: 'hello',
    },
    ...overrides,
  }
}

describe('isAllowedTextMessage', () => {
  it('пропускает текст от разрешённого user_id', () => {
    expect(isAllowedTextMessage(makeUpdate(), ALLOWED)).toBe(true)
  })

  it('отвергает сообщение от чужого user_id', () => {
    const u = makeUpdate({
      message: {
        message_id: 100,
        date: 1,
        chat: { id: 999, type: 'private' },
        from: { id: 999, is_bot: false },
        text: 'hello',
      },
    })
    expect(isAllowedTextMessage(u, ALLOWED)).toBe(false)
  })

  it('отвергает update без message (например, edited_message)', () => {
    expect(isAllowedTextMessage({ update_id: 1 }, ALLOWED)).toBe(false)
  })

  it('отвергает сообщение без from', () => {
    const u = makeUpdate({
      message: {
        message_id: 100,
        date: 1,
        chat: { id: ALLOWED, type: 'private' },
        text: 'hello',
      },
    })
    expect(isAllowedTextMessage(u, ALLOWED)).toBe(false)
  })

  it('отвергает сообщение без text (фото, голос и т.п.)', () => {
    const u = makeUpdate({
      message: {
        message_id: 100,
        date: 1,
        chat: { id: ALLOWED, type: 'private' },
        from: { id: ALLOWED, is_bot: false },
      },
    })
    expect(isAllowedTextMessage(u, ALLOWED)).toBe(false)
  })

  it('отвергает сообщение с пустым text', () => {
    const u = makeUpdate({
      message: {
        message_id: 100,
        date: 1,
        chat: { id: ALLOWED, type: 'private' },
        from: { id: ALLOWED, is_bot: false },
        text: '',
      },
    })
    expect(isAllowedTextMessage(u, ALLOWED)).toBe(false)
  })
})

function mockFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('getUpdates', () => {
  it('возвращает массив updates при успешном ответе', async () => {
    const updates = [makeUpdate()]
    const fetchMock = mockFetch({ ok: true, result: updates })
    const result = await getUpdates('TOKEN', 0, fetchMock as unknown as typeof fetch)
    expect(result).toEqual(updates)
  })

  it('возвращает пустой массив, если result отсутствует', async () => {
    const fetchMock = mockFetch({ ok: true })
    const result = await getUpdates('TOKEN', 0, fetchMock as unknown as typeof fetch)
    expect(result).toEqual([])
  })

  it('бросает ошибку, если ok=false', async () => {
    const fetchMock = mockFetch({ ok: false, description: 'Unauthorized', error_code: 401 })
    await expect(getUpdates('TOKEN', 0, fetchMock as unknown as typeof fetch)).rejects.toThrow(
      /Unauthorized/,
    )
  })

  it('бросает ошибку при HTTP non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('bad gateway', { status: 502 }),
    )
    await expect(getUpdates('TOKEN', 0, fetchMock as unknown as typeof fetch)).rejects.toThrow(
      /HTTP 502/,
    )
  })

  it('передаёт offset, timeout=0 и allowed_updates=["message"] в URL', async () => {
    const fetchMock = mockFetch({ ok: true, result: [] })
    await getUpdates('TOKEN', 42, fetchMock as unknown as typeof fetch)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('https://api.telegram.org/botTOKEN/getUpdates')
    expect(url).toContain('offset=42')
    expect(url).toContain('timeout=0')
    expect(url).toContain(`allowed_updates=${encodeURIComponent('["message"]')}`)
  })
})
