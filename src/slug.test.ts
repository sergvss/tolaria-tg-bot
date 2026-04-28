import { describe, it, expect } from 'vitest'
import { slug } from './slug'

describe('slug', () => {
  it('делает kebab-case из латинских слов', () => {
    expect(slug('hello world example')).toBe('hello-world-example')
  })

  it('берёт максимум 5 первых слов', () => {
    expect(slug('one two three four five six seven')).toBe('one-two-three-four-five')
  })

  it('транслитерирует обычную кириллицу', () => {
    expect(slug('Привет мир')).toBe('privet-mir')
  })

  it('обрабатывает специфичные кириллические буквы (ж, щ, ё)', () => {
    expect(slug('Жёлтая щука')).toBe('zheltaya-shchuka')
  })

  it('убирает мягкий и твёрдый знаки', () => {
    expect(slug('подъезд')).toBe('podezd')
  })

  it('обрабатывает ц, ч, ш, ъ, ю, я', () => {
    expect(slug('цапля чай шарик объявление юла яма')).toBe('tsaplya-chay-sharik-obyavlenie-yula')
  })

  it('возвращает note для пустой строки', () => {
    expect(slug('')).toBe('note')
  })

  it('возвращает note для строки только из пробелов', () => {
    expect(slug('   \n\t  ')).toBe('note')
  })

  it('возвращает note для эмодзи и пунктуации', () => {
    expect(slug('!!! 😀 ???')).toBe('note')
  })

  it('убирает пунктуацию по краям слов', () => {
    expect(slug('hello, world!')).toBe('hello-world')
  })

  it('сохраняет цифры', () => {
    expect(slug('test 123 abc')).toBe('test-123-abc')
  })

  it('опускает регистр', () => {
    expect(slug('HELLO WORLD')).toBe('hello-world')
  })

  it('свёртывает повторяющиеся разделители', () => {
    expect(slug('hello   world---example')).toBe('hello-world-example')
  })

  it('обрабатывает смесь кириллицы и латиницы', () => {
    expect(slug('Test тест 123')).toBe('test-test-123')
  })

  it('игнорирует эмодзи и сохраняет соседние слова', () => {
    expect(slug('идея 💡 для проекта')).toBe('ideya-dlya-proekta')
  })

  it('обрабатывает многострочный текст как один', () => {
    expect(slug('Заголовок\nПервая строка')).toBe('zagolovok-pervaya-stroka')
  })
})
