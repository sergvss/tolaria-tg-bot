const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e',
  ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

const MAX_WORDS = 5
const FALLBACK = 'note'

export function slug(text: string): string {
  const firstWords = text.trim().split(/\s+/).slice(0, MAX_WORDS).join(' ')
  if (!firstWords) return FALLBACK

  const transliterated = firstWords
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')

  const kebab = transliterated.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return kebab || FALLBACK
}
