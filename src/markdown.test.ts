import { describe, it, expect } from 'vitest'
import { buildNote, withRandomSuffix, buildAttachmentPath } from './markdown'

const DATE_2026_04_29_10_05_30 = Date.UTC(2026, 3, 29, 10, 5, 30) / 1000
const DATE_2026_04_29_10_05_00 = Date.UTC(2026, 3, 29, 10, 5, 0) / 1000

describe('buildNote — путь и базовая структура', () => {
  it('строит путь folder/YYYY-MM-DD-HHMMSS.md', () => {
    const note = buildNote({
      text: 'Hello',
      unixDate: DATE_2026_04_29_10_05_30,
      folder: 'inbox',
    })
    expect(note.path).toBe('inbox/2026-04-29-100530.md')
  })

  it('паддит часы/минуты/секунды нулями', () => {
    const earlyDate = Date.UTC(2026, 0, 5, 3, 7, 4) / 1000
    const note = buildNote({ text: 'x', unixDate: earlyDate, folder: 'inbox' })
    expect(note.path).toBe('inbox/2026-01-05-030704.md')
  })

  it('срезает слеши в folder', () => {
    const note = buildNote({
      text: 'x',
      unixDate: DATE_2026_04_29_10_05_30,
      folder: '/inbox/',
    })
    expect(note.path).toBe('inbox/2026-04-29-100530.md')
  })

  it('кладёт в корень при пустой folder', () => {
    const note = buildNote({
      text: 'x',
      unixDate: DATE_2026_04_29_10_05_30,
      folder: '',
    })
    expect(note.path).toBe('2026-04-29-100530.md')
  })
})

describe('buildNote — frontmatter', () => {
  it('всегда содержит captured_at, source: telegram, type: Note', () => {
    const note = buildNote({
      text: 'hi',
      unixDate: DATE_2026_04_29_10_05_30,
      folder: 'inbox',
    })
    expect(note.content).toContain('captured_at: 2026-04-29T10:05:30Z')
    expect(note.content).toContain('source: telegram')
    expect(note.content).toContain('type: Note')
  })

  it('добавляет forwarded_from, если указан', () => {
    const note = buildNote({
      text: 'hi',
      forwardedFrom: 'My Channel',
      unixDate: DATE_2026_04_29_10_05_30,
      folder: 'inbox',
    })
    expect(note.content).toContain('forwarded_from: My Channel')
  })

  it('экранирует forwarded_from если содержит спецсимволы', () => {
    const note = buildNote({
      text: 'hi',
      forwardedFrom: 'Channel: special "name"',
      unixDate: DATE_2026_04_29_10_05_30,
      folder: 'inbox',
    })
    expect(note.content).toContain('forwarded_from: "Channel: special \\"name\\""')
  })
})

describe('buildNote — текст и H1', () => {
  it('первая строка text становится H1, остальные — body', () => {
    const note = buildNote({
      text: 'Заголовок\nПервая строка тела\nВторая строка тела',
      unixDate: DATE_2026_04_29_10_05_30,
      folder: 'inbox',
    })
    expect(note.content).toContain('# Заголовок\n\nПервая строка тела\nВторая строка тела')
  })

  it('однострочный текст — только H1, без body', () => {
    const note = buildNote({
      text: 'Только заголовок',
      unixDate: DATE_2026_04_29_10_05_30,
      folder: 'inbox',
    })
    expect(note.content.trimEnd().endsWith('# Только заголовок')).toBe(true)
  })

  it('caption используется как fallback если нет text', () => {
    const note = buildNote({
      caption: 'Это подпись',
      unixDate: DATE_2026_04_29_10_05_30,
      folder: 'inbox',
    })
    expect(note.content).toContain('# Это подпись')
  })

  it('без text и без caption и без attachments — только frontmatter', () => {
    const note = buildNote({
      unixDate: DATE_2026_04_29_10_05_30,
      folder: 'inbox',
    })
    const body = note.content.split('---\n')[2]
    expect(body?.trim() ?? '').toBe('')
  })

  it('пропускает ведущие пустые строки в text', () => {
    const note = buildNote({
      text: '\n\n  \nReal heading\nbody',
      unixDate: DATE_2026_04_29_10_05_30,
      folder: 'inbox',
    })
    expect(note.content).toContain('# Real heading\n\nbody')
  })
})

describe('buildNote — attachments', () => {
  it('добавляет картинки после body', () => {
    const note = buildNote({
      text: 'Заголовок\n\nТекст подписи',
      attachments: [
        { filename: 'photo.jpg', path: 'attachments/2026-04-29-100530-AgADxxx.jpg' },
      ],
      unixDate: DATE_2026_04_29_10_05_30,
      folder: 'inbox',
    })
    expect(note.content).toContain('![photo.jpg](attachments/2026-04-29-100530-AgADxxx.jpg)')
    const ix = note.content.indexOf('![photo.jpg]')
    const bodyIx = note.content.indexOf('Текст подписи')
    expect(ix).toBeGreaterThan(bodyIx)
  })

  it('заметка только с фото и без текста — без H1, только ссылка', () => {
    const note = buildNote({
      attachments: [
        { filename: 'photo.png', path: 'attachments/2026-04-29-100530-AgADxxx.png' },
      ],
      unixDate: DATE_2026_04_29_10_05_30,
      folder: 'inbox',
    })
    expect(note.content).not.toContain('# ')
    expect(note.content).toContain('![photo.png](attachments/2026-04-29-100530-AgADxxx.png)')
  })

  it('несколько attachments каждое на своей строке', () => {
    const note = buildNote({
      text: 'two photos',
      attachments: [
        { filename: 'a.jpg', path: 'attachments/a.jpg' },
        { filename: 'b.jpg', path: 'attachments/b.jpg' },
      ],
      unixDate: DATE_2026_04_29_10_05_30,
      folder: 'inbox',
    })
    expect(note.content).toContain('![a.jpg](attachments/a.jpg)\n![b.jpg](attachments/b.jpg)')
  })
})

describe('buildNote — формат полностью совпадает с примером пользователя', () => {
  it('text + photo дают ожидаемый layout', () => {
    const note = buildNote({
      text: '123\n\n123',
      attachments: [
        { filename: 'my-photo.png', path: 'attachments/1777420861867-my-photo.png' },
      ],
      unixDate: DATE_2026_04_29_10_05_00,
      folder: 'inbox',
    })
    expect(note.content).toBe(
      `---\n` +
        `captured_at: 2026-04-29T10:05:00Z\n` +
        `source: telegram\n` +
        `type: Note\n` +
        `---\n` +
        `# 123\n` +
        `\n` +
        `123\n` +
        `\n` +
        `![my-photo.png](attachments/1777420861867-my-photo.png)\n`,
    )
  })
})

describe('withRandomSuffix', () => {
  it('вставляет суффикс перед .md', () => {
    expect(withRandomSuffix('inbox/2026-04-29-100530.md', 'a3f9'))
      .toBe('inbox/2026-04-29-100530-a3f9.md')
  })

  it('работает с файлом в корне', () => {
    expect(withRandomSuffix('test.md', 'b1c2')).toBe('test-b1c2.md')
  })
})

describe('buildAttachmentPath', () => {
  it('строит attachments/YYYY-MM-DD-HHMMSS-<id>.<ext>', () => {
    expect(buildAttachmentPath(DATE_2026_04_29_10_05_30, 'AQADAg', 'jpg'))
      .toBe('attachments/2026-04-29-100530-AQADAg.jpg')
  })

  it('переводит расширение в нижний регистр и чистит мусор', () => {
    expect(buildAttachmentPath(DATE_2026_04_29_10_05_30, 'X', 'JPG'))
      .toBe('attachments/2026-04-29-100530-X.jpg')
  })

  it('fallback bin если расширение пустое', () => {
    expect(buildAttachmentPath(DATE_2026_04_29_10_05_30, 'X', ''))
      .toBe('attachments/2026-04-29-100530-X.bin')
  })

  it('убирает спецсимволы из file_unique_id', () => {
    expect(buildAttachmentPath(DATE_2026_04_29_10_05_30, 'X/y\\z', 'png'))
      .toBe('attachments/2026-04-29-100530-Xyz.png')
  })
})
