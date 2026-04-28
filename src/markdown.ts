import { slug } from './slug'

export interface NoteFile {
  path: string
  content: string
}

export function buildNote(text: string, unixDate: number, folder: string): NoteFile {
  const date = new Date(unixDate * 1000)
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const min = String(date.getUTCMinutes()).padStart(2, '0')
  const ts = `${yyyy}-${mm}-${dd}-${hh}${min}`

  const filename = `${ts}-${slug(text)}.md`
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '')
  const path = cleanFolder ? `${cleanFolder}/${filename}` : filename

  const iso = date.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const content = `---\ncaptured_at: ${iso}\nsource: telegram\n---\n\n${text}\n`

  return { path, content }
}

export function withRandomSuffix(path: string, randHex: string): string {
  return path.replace(/\.md$/, `-${randHex}.md`)
}
