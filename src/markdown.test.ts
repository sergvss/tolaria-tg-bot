import { describe, it, expect } from 'vitest'
import { buildNote, withRandomSuffix } from './markdown'

const DATE_2026_04_28_18_45 = Date.UTC(2026, 3, 28, 18, 45, 0) / 1000
const DATE_2026_04_28_18_45_15 = Date.UTC(2026, 3, 28, 18, 45, 15) / 1000

describe('buildNote', () => {
  it('строит путь folder/YYYY-MM-DD-HHMMSS.md без slug', () => {
    const note = buildNote('Привет мир', DATE_2026_04_28_18_45_15, 'inbox')
    expect(note.path).toBe('inbox/2026-04-28-184515.md')
  })

  it('паддит часы/минуты/секунды нулями', () => {
    const earlyDate = Date.UTC(2026, 0, 5, 3, 7, 4) / 1000
    const note = buildNote('test', earlyDate, 'inbox')
    expect(note.path).toBe('inbox/2026-01-05-030704.md')
  })

  it('секунды по умолчанию 00 если они не заданы', () => {
    const note = buildNote('test', DATE_2026_04_28_18_45, 'inbox')
    expect(note.path).toBe('inbox/2026-04-28-184500.md')
  })

  it('срезает ведущий и конечный слеш в folder', () => {
    const note = buildNote('test', DATE_2026_04_28_18_45_15, '/inbox/')
    expect(note.path).toBe('inbox/2026-04-28-184515.md')
  })

  it('кладёт файл в корень репы при пустой папке', () => {
    const note = buildNote('test', DATE_2026_04_28_18_45_15, '')
    expect(note.path).toBe('2026-04-28-184515.md')
  })

  it('содержит frontmatter с captured_at в UTC и source telegram', () => {
    const note = buildNote('hello', DATE_2026_04_28_18_45_15, 'inbox')
    expect(note.content).toContain('captured_at: 2026-04-28T18:45:15Z')
    expect(note.content).toContain('source: telegram')
  })

  it('сохраняет тело сообщения как есть, после frontmatter', () => {
    const note = buildNote('hello world', DATE_2026_04_28_18_45_15, 'inbox')
    const body = note.content.split('---\n\n')[1]
    expect(body).toBe('hello world\n')
  })

  it('сохраняет многострочный текст', () => {
    const text = 'Заголовок\n\nАбзац 1\nАбзац 2'
    const note = buildNote(text, DATE_2026_04_28_18_45_15, 'inbox')
    expect(note.content.endsWith(`${text}\n`)).toBe(true)
  })

  it('frontmatter имеет ровно три поля и закрывается ---', () => {
    const note = buildNote('test', DATE_2026_04_28_18_45_15, 'inbox')
    const lines = note.content.split('\n')
    expect(lines[0]).toBe('---')
    expect(lines[1]).toBe('captured_at: 2026-04-28T18:45:15Z')
    expect(lines[2]).toBe('source: telegram')
    expect(lines[3]).toBe('---')
    expect(lines[4]).toBe('')
  })

  it('не зависит от текста сообщения - имя одинаковое для разных текстов в одну секунду', () => {
    const a = buildNote('первое', DATE_2026_04_28_18_45_15, 'inbox')
    const b = buildNote('!!! 😀', DATE_2026_04_28_18_45_15, 'inbox')
    expect(a.path).toBe(b.path)
  })
})

describe('withRandomSuffix', () => {
  it('вставляет суффикс перед .md', () => {
    const result = withRandomSuffix('inbox/2026-04-28-184515.md', 'a3f9')
    expect(result).toBe('inbox/2026-04-28-184515-a3f9.md')
  })

  it('работает с файлом в корне', () => {
    expect(withRandomSuffix('test.md', 'b1c2')).toBe('test-b1c2.md')
  })
})
