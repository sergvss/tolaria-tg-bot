export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name?: string
  username?: string
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
}

export interface TelegramPhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

export interface TelegramForwardOrigin {
  type: 'user' | 'hidden_user' | 'chat' | 'channel'
  date: number
  sender_user?: TelegramUser
  sender_user_name?: string
  sender_chat?: TelegramChat
  chat?: TelegramChat
  author_signature?: string
  message_id?: number
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
  caption?: string
  photo?: TelegramPhotoSize[]
  forward_origin?: TelegramForwardOrigin
  forward_from?: TelegramUser
  forward_from_chat?: TelegramChat
  media_group_id?: string
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

interface TelegramApiResponse<T> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
}

export interface TelegramFile {
  file_id: string
  file_unique_id: string
  file_size?: number
  file_path?: string
}

export type AllowedTextUpdate = TelegramUpdate & {
  message: TelegramMessage & { text: string; from: TelegramUser }
}

export type AllowedPhotoUpdate = TelegramUpdate & {
  message: TelegramMessage & { photo: TelegramPhotoSize[]; from: TelegramUser }
}

export type AllowedUpdate = AllowedTextUpdate | AllowedPhotoUpdate

export async function getUpdates(
  botToken: string,
  offset: number,
  fetchImpl: typeof fetch = fetch,
): Promise<TelegramUpdate[]> {
  const params = new URLSearchParams({
    offset: String(offset),
    timeout: '0',
    allowed_updates: JSON.stringify(['message']),
  })
  const url = `https://api.telegram.org/bot${botToken}/getUpdates?${params.toString()}`

  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Telegram getUpdates HTTP ${response.status}`)
  }

  const data = (await response.json()) as TelegramApiResponse<TelegramUpdate[]>
  if (!data.ok) {
    throw new Error(`Telegram getUpdates error: ${data.description ?? 'unknown'}`)
  }

  return data.result ?? []
}

export async function getFile(
  botToken: string,
  fileId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TelegramFile> {
  const url = `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Telegram getFile HTTP ${response.status}`)
  }

  const data = (await response.json()) as TelegramApiResponse<TelegramFile>
  if (!data.ok || !data.result) {
    throw new Error(`Telegram getFile error: ${data.description ?? 'unknown'}`)
  }
  return data.result
}

export async function downloadFile(
  botToken: string,
  filePath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Telegram downloadFile HTTP ${response.status}`)
  }
  const buffer = await response.arrayBuffer()
  return new Uint8Array(buffer)
}

export function isAllowedTextMessage(
  update: TelegramUpdate,
  allowedUserId: number,
): update is AllowedTextUpdate {
  const msg = update.message
  if (!msg) return false
  if (!msg.from) return false
  if (msg.from.id !== allowedUserId) return false
  if (typeof msg.text !== 'string') return false
  if (msg.text.length === 0) return false
  return true
}

export function isAllowedPhotoMessage(
  update: TelegramUpdate,
  allowedUserId: number,
): update is AllowedPhotoUpdate {
  const msg = update.message
  if (!msg) return false
  if (!msg.from) return false
  if (msg.from.id !== allowedUserId) return false
  if (!Array.isArray(msg.photo) || msg.photo.length === 0) return false
  return true
}

export function isAllowedMessage(
  update: TelegramUpdate,
  allowedUserId: number,
): update is AllowedUpdate {
  return isAllowedTextMessage(update, allowedUserId) || isAllowedPhotoMessage(update, allowedUserId)
}

export function pickLargestPhoto(photos: TelegramPhotoSize[]): TelegramPhotoSize {
  return photos.reduce((largest, current) =>
    (current.width * current.height) > (largest.width * largest.height) ? current : largest
  )
}

export function getForwardChatTitle(message: TelegramMessage): string | undefined {
  if (message.forward_origin) {
    const origin = message.forward_origin
    if (origin.chat?.title) return origin.chat.title
    if (origin.sender_chat?.title) return origin.sender_chat.title
    if (origin.sender_user_name) return origin.sender_user_name
    if (origin.sender_user) {
      const u = origin.sender_user
      return u.username ?? u.first_name ?? `user-${u.id}`
    }
  }
  if (message.forward_from_chat?.title) return message.forward_from_chat.title
  if (message.forward_from) {
    const u = message.forward_from
    return u.username ?? u.first_name ?? `user-${u.id}`
  }
  return undefined
}

export function extensionFromFilePath(filePath: string): string {
  const dotIndex = filePath.lastIndexOf('.')
  if (dotIndex === -1 || dotIndex === filePath.length - 1) return 'bin'
  return filePath.slice(dotIndex + 1).toLowerCase()
}
