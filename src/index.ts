export interface Env {
  // Секреты появятся на этапе 3 (wrangler secret put)
  // BOT_TOKEN, GH_TOKEN, GH_REPO, GH_FOLDER, GH_BRANCH, ALLOWED_USER_ID
  // KV: OFFSETS
}

export default {
  async scheduled(
    controller: ScheduledController,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    console.log(`cron tick at ${new Date(controller.scheduledTime).toISOString()}`)
  },
} satisfies ExportedHandler<Env>
