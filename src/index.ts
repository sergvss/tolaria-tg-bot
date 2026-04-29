import {
  getUpdates,
  getFile,
  downloadFile,
  isAllowedMessage,
  isAllowedPhotoMessage,
  pickLargestPhoto,
  getForwardChatTitle,
  extensionFromFilePath,
  type AllowedUpdate,
  type TelegramUpdate,
} from './telegram'
import {
  buildNote,
  buildAttachmentPath,
  withRandomSuffix,
  type NoteAttachment,
  type NoteFile,
} from './markdown'
import { putFile, putBinary, PathConflictError, randomHex } from './github'

export interface Env {
  BOT_TOKEN: string
  GH_TOKEN: string
  GH_REPO: string
  GH_FOLDER: string
  GH_BRANCH?: string
  ALLOWED_USER_ID: string
  OFFSETS: KVNamespace
}

const OFFSET_KEY = 'last_offset'
const MAX_PUT_ATTEMPTS = 3

export async function processUpdates(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const allowedUserId = Number(env.ALLOWED_USER_ID)
  if (!Number.isFinite(allowedUserId)) {
    throw new Error('ALLOWED_USER_ID is not a number')
  }
  const branch = env.GH_BRANCH ?? 'main'

  const stored = await env.OFFSETS.get(OFFSET_KEY)
  const offset = stored ? Number(stored) : 0

  const updates = await getUpdates(env.BOT_TOKEN, offset, fetchImpl)
  if (updates.length === 0) return

  let maxId = offset - 1
  for (const update of updates) {
    if (update.update_id > maxId) maxId = update.update_id
    if (!isAllowedMessage(update, allowedUserId)) continue

    await processSingleUpdate(update, env, branch, fetchImpl)
  }

  await env.OFFSETS.put(OFFSET_KEY, String(maxId + 1))
}

async function processSingleUpdate(
  update: AllowedUpdate,
  env: Env,
  branch: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const msg = update.message
  const attachments: NoteAttachment[] = []

  if (isAllowedPhotoMessage(update, Number(env.ALLOWED_USER_ID))) {
    const photo = pickLargestPhoto(msg.photo!)
    const file = await getFile(env.BOT_TOKEN, photo.file_id, fetchImpl)
    if (file.file_path) {
      const bytes = await downloadFile(env.BOT_TOKEN, file.file_path, fetchImpl)
      const ext = extensionFromFilePath(file.file_path)
      const attachmentPath = buildAttachmentPath(msg.date, photo.file_unique_id, ext)
      try {
        await putBinary(
          {
            token: env.GH_TOKEN,
            repo: env.GH_REPO,
            branch,
            path: attachmentPath,
            content: bytes,
            commitMessage: `Add ${attachmentPath}`,
          },
          fetchImpl,
        )
      } catch (e) {
        if (!(e instanceof PathConflictError)) throw e
      }
      attachments.push({ filename: `photo.${ext}`, path: attachmentPath })
    }
  }

  const note = buildNote({
    text: msg.text,
    caption: msg.caption,
    attachments,
    forwardedFrom: getForwardChatTitle(msg),
    unixDate: msg.date,
    folder: env.GH_FOLDER,
  })

  await commitNoteWithRetry(note, env, branch, fetchImpl)
}

async function commitNoteWithRetry(
  note: NoteFile,
  env: Env,
  branch: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  let path = note.path
  for (let attempt = 1; attempt <= MAX_PUT_ATTEMPTS; attempt++) {
    try {
      await putFile(
        {
          token: env.GH_TOKEN,
          repo: env.GH_REPO,
          branch,
          path,
          content: note.content,
          commitMessage: `Add ${path}`,
        },
        fetchImpl,
      )
      return
    } catch (e) {
      if (e instanceof PathConflictError && attempt < MAX_PUT_ATTEMPTS) {
        path = withRandomSuffix(note.path, randomHex(2))
        continue
      }
      throw e
    }
  }
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    console.log(`cron tick at ${new Date(controller.scheduledTime).toISOString()}`)
    await processUpdates(env)
  },
} satisfies ExportedHandler<Env>
