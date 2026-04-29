import { describe, it, expect, vi } from 'vitest'
import {
  getUpdates,
  getFile,
  downloadFile,
  isAllowedTextMessage,
  isAllowedPhotoMessage,
  isAllowedMessage,
  pickLargestPhoto,
  getForwardChatTitle,
  extensionFromFilePath,
  type TelegramUpdate,
  type TelegramMessage,
  type TelegramPhotoSize,
} from './telegram'

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('isAllowedTextMessage', () => {
  it('пропускает текст от разрешённого user_id', () => {
    expect(isAllowedTextMessage(makeUpdate(), ALLOWED)).toBe(true)
  })

  it('отвергает чужого', () => {
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

  it('отвергает update без message', () => {
    expect(isAllowedTextMessage({ update_id: 1 }, ALLOWED)).toBe(false)
  })

  it('отвергает сообщение без from', () => {
    expect(
      isAllowedTextMessage(
        {
          update_id: 1,
          message: {
            message_id: 1,
            date: 1,
            chat: { id: ALLOWED, type: 'private' },
            text: 'hi',
          },
        },
        ALLOWED,
      ),
    ).toBe(false)
  })

  it('отвергает фото без text', () => {
    const u = makeUpdate({
      message: {
        message_id: 100,
        date: 1,
        chat: { id: ALLOWED, type: 'private' },
        from: { id: ALLOWED, is_bot: false },
        photo: [{ file_id: 'a', file_unique_id: 'b', width: 100, height: 100 }],
      },
    })
    expect(isAllowedTextMessage(u, ALLOWED)).toBe(false)
  })

  it('отвергает пустой text', () => {
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

describe('isAllowedPhotoMessage', () => {
  it('пропускает фото от разрешённого user_id', () => {
    const u = makeUpdate({
      message: {
        message_id: 1,
        date: 1,
        chat: { id: ALLOWED, type: 'private' },
        from: { id: ALLOWED, is_bot: false },
        photo: [
          { file_id: 'a', file_unique_id: 'b', width: 100, height: 100 },
          { file_id: 'c', file_unique_id: 'd', width: 800, height: 600 },
        ],
        caption: 'caption text',
      },
    })
    expect(isAllowedPhotoMessage(u, ALLOWED)).toBe(true)
  })

  it('отвергает фото от чужого', () => {
    const u = makeUpdate({
      message: {
        message_id: 1,
        date: 1,
        chat: { id: 999, type: 'private' },
        from: { id: 999, is_bot: false },
        photo: [{ file_id: 'a', file_unique_id: 'b', width: 100, height: 100 }],
      },
    })
    expect(isAllowedPhotoMessage(u, ALLOWED)).toBe(false)
  })

  it('отвергает текст без photo', () => {
    expect(isAllowedPhotoMessage(makeUpdate(), ALLOWED)).toBe(false)
  })

  it('отвергает пустой массив photo', () => {
    const u = makeUpdate({
      message: {
        message_id: 1,
        date: 1,
        chat: { id: ALLOWED, type: 'private' },
        from: { id: ALLOWED, is_bot: false },
        photo: [],
      },
    })
    expect(isAllowedPhotoMessage(u, ALLOWED)).toBe(false)
  })
})

describe('isAllowedMessage', () => {
  it('пропускает текст', () => {
    expect(isAllowedMessage(makeUpdate(), ALLOWED)).toBe(true)
  })

  it('пропускает фото', () => {
    const u = makeUpdate({
      message: {
        message_id: 1,
        date: 1,
        chat: { id: ALLOWED, type: 'private' },
        from: { id: ALLOWED, is_bot: false },
        photo: [{ file_id: 'a', file_unique_id: 'b', width: 100, height: 100 }],
      },
    })
    expect(isAllowedMessage(u, ALLOWED)).toBe(true)
  })

  it('отвергает голосовое (нет text и photo)', () => {
    const u = makeUpdate({
      message: {
        message_id: 1,
        date: 1,
        chat: { id: ALLOWED, type: 'private' },
        from: { id: ALLOWED, is_bot: false },
      },
    })
    expect(isAllowedMessage(u, ALLOWED)).toBe(false)
  })
})

describe('pickLargestPhoto', () => {
  it('возвращает фото с наибольшей площадью', () => {
    const photos: TelegramPhotoSize[] = [
      { file_id: 'small', file_unique_id: 's', width: 100, height: 100 },
      { file_id: 'medium', file_unique_id: 'm', width: 320, height: 240 },
      { file_id: 'large', file_unique_id: 'l', width: 1280, height: 720 },
    ]
    expect(pickLargestPhoto(photos).file_id).toBe('large')
  })

  it('работает с одним элементом', () => {
    const photos: TelegramPhotoSize[] = [
      { file_id: 'only', file_unique_id: 'u', width: 50, height: 50 },
    ]
    expect(pickLargestPhoto(photos).file_id).toBe('only')
  })
})

describe('getForwardChatTitle', () => {
  it('берёт title из forward_origin.chat', () => {
    const msg: TelegramMessage = {
      message_id: 1,
      date: 1,
      chat: { id: 1, type: 'private' },
      forward_origin: {
        type: 'channel',
        date: 1,
        chat: { id: -100, type: 'channel', title: 'My Channel' },
      },
    }
    expect(getForwardChatTitle(msg)).toBe('My Channel')
  })

  it('берёт sender_user_name для скрытого пользователя', () => {
    const msg: TelegramMessage = {
      message_id: 1,
      date: 1,
      chat: { id: 1, type: 'private' },
      forward_origin: {
        type: 'hidden_user',
        date: 1,
        sender_user_name: 'Anonymous',
      },
    }
    expect(getForwardChatTitle(msg)).toBe('Anonymous')
  })

  it('падает на старое поле forward_from_chat если нет forward_origin', () => {
    const msg: TelegramMessage = {
      message_id: 1,
      date: 1,
      chat: { id: 1, type: 'private' },
      forward_from_chat: { id: -100, type: 'channel', title: 'Old Channel' },
    }
    expect(getForwardChatTitle(msg)).toBe('Old Channel')
  })

  it('возвращает undefined если нет ни одного поля forward', () => {
    const msg: TelegramMessage = {
      message_id: 1,
      date: 1,
      chat: { id: 1, type: 'private' },
    }
    expect(getForwardChatTitle(msg)).toBeUndefined()
  })
})

describe('extensionFromFilePath', () => {
  it('берёт jpg из photos/file_42.jpg', () => {
    expect(extensionFromFilePath('photos/file_42.jpg')).toBe('jpg')
  })

  it('возвращает в нижнем регистре', () => {
    expect(extensionFromFilePath('FILE.PNG')).toBe('png')
  })

  it('bin если расширения нет', () => {
    expect(extensionFromFilePath('photos/no-extension')).toBe('bin')
  })

  it('bin если расширение пустое (точка в конце)', () => {
    expect(extensionFromFilePath('file.')).toBe('bin')
  })
})

describe('getUpdates', () => {
  it('возвращает массив updates', async () => {
    const updates = [makeUpdate()]
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: updates }))
    const result = await getUpdates('TOKEN', 0, fetchMock as unknown as typeof fetch)
    expect(result).toEqual(updates)
  })

  it('возвращает пустой массив если result отсутствует', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    const result = await getUpdates('TOKEN', 0, fetchMock as unknown as typeof fetch)
    expect(result).toEqual([])
  })

  it('бросает на ok=false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ ok: false, description: 'Unauthorized' }),
    )
    await expect(getUpdates('TOKEN', 0, fetchMock as unknown as typeof fetch)).rejects.toThrow(
      /Unauthorized/,
    )
  })

  it('бросает на HTTP non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad', { status: 502 }))
    await expect(getUpdates('TOKEN', 0, fetchMock as unknown as typeof fetch)).rejects.toThrow(
      /HTTP 502/,
    )
  })

  it('передаёт offset, timeout=0 и allowed_updates в URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: [] }))
    await getUpdates('TOKEN', 42, fetchMock as unknown as typeof fetch)
    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toContain('https://api.telegram.org/botTOKEN/getUpdates')
    expect(url).toContain('offset=42')
    expect(url).toContain('timeout=0')
    expect(url).toContain(`allowed_updates=${encodeURIComponent('["message"]')}`)
  })
})

describe('getFile', () => {
  it('возвращает file info при успехе', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        result: { file_id: 'AGADAg', file_unique_id: 'AQADxx', file_size: 12345, file_path: 'photos/file_42.jpg' },
      }),
    )
    const result = await getFile('TOKEN', 'AGADAg', fetchMock as unknown as typeof fetch)
    expect(result.file_path).toBe('photos/file_42.jpg')
    expect(result.file_unique_id).toBe('AQADxx')
  })

  it('энкодит file_id в URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, result: { file_id: 'a/b', file_unique_id: 'u', file_path: 'p' } }),
    )
    await getFile('TOKEN', 'a/b', fetchMock as unknown as typeof fetch)
    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toContain('file_id=a%2Fb')
  })

  it('бросает при ok=false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ ok: false, description: 'file not found' }),
    )
    await expect(
      getFile('TOKEN', 'x', fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/file not found/)
  })
})

describe('downloadFile', () => {
  it('возвращает Uint8Array из тела ответа', async () => {
    const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(data.buffer, { status: 200 }),
    )
    const result = await downloadFile(
      'TOKEN',
      'photos/file_1.jpg',
      fetchMock as unknown as typeof fetch,
    )
    expect(result).toBeInstanceOf(Uint8Array)
    expect(Array.from(result)).toEqual([0xff, 0xd8, 0xff, 0xe0])
  })

  it('строит правильный URL для bin endpoint Telegram', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new ArrayBuffer(0), { status: 200 }))
    await downloadFile('TOKEN', 'photos/file.jpg', fetchMock as unknown as typeof fetch)
    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toBe('https://api.telegram.org/file/botTOKEN/photos/file.jpg')
  })

  it('бросает на HTTP non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }))
    await expect(
      downloadFile('TOKEN', 'photos/x.jpg', fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/HTTP 404/)
  })
})
