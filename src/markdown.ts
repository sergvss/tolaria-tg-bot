export interface NoteFile {
  path: string
  content: string
}

export interface NoteAttachment {
  filename: string
  path: string
}

export interface BuildNoteParams {
  text?: string
  caption?: string
  attachments?: NoteAttachment[]
  forwardedFrom?: string
  unixDate: number
  folder: string
}

export function buildNote(params: BuildNoteParams): NoteFile {
  const { unixDate, folder, attachments, forwardedFrom } = params
  const date = new Date(unixDate * 1000)
  const ts = formatTimestamp(date)
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '')
  const filename = `${ts}.md`
  const path = cleanFolder ? `${cleanFolder}/${filename}` : filename

  const iso = date.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const sourceText = (params.text ?? params.caption ?? '').replace(/\r\n/g, '\n')
  const { heading, body } = splitHeadingAndBody(sourceText)

  const lines: string[] = ['---', `captured_at: ${iso}`, 'source: telegram', 'type: Note']
  if (forwardedFrom) {
    lines.push(`forwarded_from: ${yamlString(forwardedFrom)}`)
  }
  lines.push('---')

  if (heading) lines.push(`# ${heading}`)

  if (body) {
    if (heading) lines.push('')
    lines.push(body)
  }

  if (attachments?.length) {
    if (heading || body) lines.push('')
    for (const att of attachments) {
      lines.push(`![${att.filename}](${att.path})`)
    }
  }

  return { path, content: lines.join('\n') + '\n' }
}

export function withRandomSuffix(path: string, randHex: string): string {
  return path.replace(/\.md$/, `-${randHex}.md`)
}

export function buildAttachmentPath(unixDate: number, fileUniqueId: string, ext: string): string {
  const date = new Date(unixDate * 1000)
  const ts = formatTimestamp(date)
  const safeId = fileUniqueId.replace(/[^A-Za-z0-9_-]/g, '')
  const safeExt = ext.replace(/[^A-Za-z0-9]/g, '').toLowerCase() || 'bin'
  return `attachments/${ts}-${safeId}.${safeExt}`
}

function formatTimestamp(date: Date): string {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const min = String(date.getUTCMinutes()).padStart(2, '0')
  const ss = String(date.getUTCSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}-${hh}${min}${ss}`
}

function splitHeadingAndBody(text: string): { heading?: string; body?: string } {
  if (!text) return {}
  const trimmed = text.replace(/\s+$/, '')
  if (!trimmed) return {}

  const allLines = trimmed.split('\n')
  let firstNonEmpty = 0
  while (firstNonEmpty < allLines.length && allLines[firstNonEmpty]!.trim() === '') {
    firstNonEmpty++
  }
  if (firstNonEmpty >= allLines.length) return {}

  const heading = allLines[firstNonEmpty]!.trim()
  const restLines = allLines.slice(firstNonEmpty + 1)
  while (restLines.length > 0 && restLines[0]!.trim() === '') {
    restLines.shift()
  }

  const body = restLines.join('\n').replace(/\s+$/, '')
  return {
    heading: heading || undefined,
    body: body || undefined,
  }
}

function yamlString(s: string): string {
  if (/^[A-Za-z0-9_][A-Za-z0-9_ \-.,!]*$/.test(s) && !s.includes(': ')) {
    return s
  }
  const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}"`
}
