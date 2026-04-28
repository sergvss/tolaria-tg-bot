export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name?: string
  username?: string
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

interface GetUpdatesResponse {
  ok: boolean
  result?: TelegramUpdate[]
  description?: string
  error_code?: number
}

export type AllowedTextUpdate = TelegramUpdate & {
  message: TelegramMessage & { text: string; from: TelegramUser }
}

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

  const data = (await response.json()) as GetUpdatesResponse
  if (!data.ok) {
    throw new Error(`Telegram getUpdates error: ${data.description ?? 'unknown'}`)
  }

  return data.result ?? []
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
