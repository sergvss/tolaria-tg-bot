import { describe, it, expect } from 'vitest'
import { buildNote, withRandomSuffix } from './markdown'

const DATE_2026_04_28_18_45 = Date.UTC(2026, 3, 28, 18, 45, 0) / 1000

describe('buildNote', () => {
  it('строит путь folder/YYYY-MM-DD-HHMM-slug.md', () => {
    const note = buildNote('Привет мир', DATE_2026_04_28_18_45, 'inbox')
    expect(note.path).toBe('inbox/2026-04-28-1845-privet-mir.md')
  })

  it('паддит месяц/день/часы/минуты нулями', () => {
    const earlyDate = Date.UTC(2026, 0, 5, 3, 7, 0) / 1000
    const note = buildNote('test', earlyDate, 'inbox')
    expect(note.path).toBe('inbox/2026-01-05-0307-test.md')
  })

  it('срезает ведущий и конечный слеш в folder', () => {
    const note = buildNote('test', DATE_2026_04_28_18_45, '/inbox/')
    expect(note.path).toBe('inbox/2026-04-28-1845-test.md')
  })

  it('кладёт файл в корень репы при пустой папке', () => {
    const note = buildNote('test', DATE_2026_04_28_18_45, '')
    expect(note.path).toBe('2026-04-28-1845-test.md')
  })

  it('содержит frontmatter с captured_at в UTC и source telegram', () => {
    const note = buildNote('hello', DATE_2026_04_28_18_45, 'inbox')
    expect(note.content).toContain('captured_at: 2026-04-28T18:45:00Z')
    expect(note.content).toContain('source: telegram')
  })

  it('сохраняет тело сообщения как есть, после frontmatter', () => {
    const note = buildNote('hello world', DATE_2026_04_28_18_45, 'inbox')
    const body = note.content.split('---\n\n')[1]
    expect(body).toBe('hello world\n')
  })

  it('сохраняет многострочный текст', () => {
    const text = 'Заголовок\n\nАбзац 1\nАбзац 2'
    const note = buildNote(text, DATE_2026_04_28_18_45, 'inbox')
    expect(note.content.endsWith(`${text}\n`)).toBe(true)
  })

  it('frontmatter имеет ровно три поля и закрывается ---', () => {
    const note = buildNote('test', DATE_2026_04_28_18_45, 'inbox')
    const lines = note.content.split('\n')
    expect(lines[0]).toBe('---')
    expect(lines[1]).toBe('captured_at: 2026-04-28T18:45:00Z')
    expect(lines[2]).toBe('source: telegram')
    expect(lines[3]).toBe('---')
    expect(lines[4]).toBe('')
  })

  it('генерирует note вместо slug если текст без распознаваемых символов', () => {
    const note = buildNote('!!! 😀', DATE_2026_04_28_18_45, 'inbox')
    expect(note.path).toBe('inbox/2026-04-28-1845-note.md')
  })
})

describe('withRandomSuffix', () => {
  it('вставляет суффикс перед .md', () => {
    const result = withRandomSuffix('inbox/2026-04-28-1845-test.md', 'a3f9')
    expect(result).toBe('inbox/2026-04-28-1845-test-a3f9.md')
  })

  it('работает с файлом в корне', () => {
    expect(withRandomSuffix('test.md', 'b1c2')).toBe('test-b1c2.md')
  })
})
