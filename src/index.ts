import { getUpdates, isAllowedTextMessage } from './telegram'
import { buildNote, withRandomSuffix, type NoteFile } from './markdown'
import { putFile, PathConflictError, randomHex } from './github'

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
    if (!isAllowedTextMessage(update, allowedUserId)) continue

    const note = buildNote(update.message.text, update.message.date, env.GH_FOLDER)
    await commitWithRetry(note, env, branch, fetchImpl)
  }

  await env.OFFSETS.put(OFFSET_KEY, String(maxId + 1))
}

async function commitWithRetry(
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
          commitMessage: `Добавить ${path}`,
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
