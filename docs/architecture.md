# Архитектура

## Контекст

`tolaria-tg-bot` — это Cloudflare Worker, запускаемый по расписанию (cron trigger). При каждом запуске он опрашивает Telegram через `getUpdates`, забирает накопившиеся сообщения от единственного разрешённого пользователя и коммитит каждое как отдельный `.md` файл в указанную папку приватного GitHub-репозитория через Contents API.

Бот не имеет webhook'а, не держит постоянного соединения, не имеет своей базы данных. Единственное состояние — `last_offset` в Cloudflare KV (один ключ, одна запись на цикл).

## Поток обработки цикла

1. Cloudflare cron trigger срабатывает (каждую минуту)
2. Worker читает `last_offset` из KV (если нет — `0`)
3. Worker делает `GET https://api.telegram.org/bot<BOT_TOKEN>/getUpdates?offset=<last_offset>&timeout=0&allowed_updates=["message"]`
4. Telegram возвращает массив новых апдейтов (или пустой массив)
5. Для каждого `update`:
   - Если нет `message.text` -> пропуск (фото, голос, документы игнорируются)
   - Если `message.from.id != ALLOWED_USER_ID` -> пропуск (молча)
   - Иначе: формирование имени файла и тела, `PUT` в GitHub Contents API
6. После обработки всех — `PUT` в KV: `last_offset = max(update_id) + 1`
7. Worker завершается

## Стек

- **TypeScript** — типы для Telegram update и GitHub API
- **Cloudflare Workers** — hosting, бесплатный план (100k invocations/day)
- **Cloudflare KV** — одно значение `last_offset`, free tier (100k reads, 1k writes /day)
- **wrangler** — деплой, секреты, KV namespaces
- **pnpm** — пакетный менеджер
- **vitest** — TDD на этапе 2

## Структура проекта

```
src/
  index.ts      // entry, scheduled handler, оркестрация цикла
  telegram.ts   // getUpdates, парсинг update, валидация from.id
  github.ts     // PUT в Contents API, retry на 422
  slug.ts      // транслит кириллицы, kebab-case первых 5 слов
```

## Формат файла

**Имя:** `<GH_FOLDER>/2026-04-28-1845-my-first-thought.md`

- `YYYY-MM-DD-HHMM` берётся из `message.date` (UTC -> в timezone из конфига или UTC)
- `<slug>` — первые 5 слов сообщения, транслит кириллицы в латиницу, kebab-case

**Тело:**

```markdown
---
captured_at: 2026-04-28T18:45:00Z
source: telegram
---

Текст сообщения как есть.
```

**Коллизия имени файла** (HTTP 422 от GitHub) — retry с суффиксом `-{rand4hex}` в имени.

## Скоуп v1

- **Только текст.** `message.text`. Голос, фото, видео, документы — пропускаются.
- **Личный чат.** Не группа, не канал.
- **Один пользователь.** Whitelist по `ALLOWED_USER_ID`.
- **Одна целевая репа и папка.** Зашиты в секреты при деплое.

## Конфигурация

Все значения хранятся через `wrangler secret put`, не в `wrangler.toml` и не в репо:

| Секрет | Описание | Пример |
|---|---|---|
| `BOT_TOKEN` | Telegram Bot HTTP API token от @BotFather | `123456:ABC...` |
| `GH_TOKEN` | GitHub fine-grained PAT, scope: только целевая репа, permission: Contents read+write | `github_pat_...` |
| `GH_REPO` | Целевая репа в формате `owner/repo` | `sergvss/my-notes` |
| `GH_FOLDER` | Папка внутри репы, без ведущего/конечного слеша | `inbox` |
| `GH_BRANCH` | Опционально, ветка для коммита (default: `main`) | `main` |
| `ALLOWED_USER_ID` | Единственный разрешённый Telegram `from.id` | `123456789` |

KV namespace биндится в `wrangler.toml` (это публичный ID, не секрет).

## Безопасность

### Секреты
Все через `wrangler secret put`. В репо ни одного значения. `.env` не используется (на проде нет процесса, в дев — `.dev.vars` локально и в `.gitignore`).

### Защита от чужих пользователей
- Сравнение `update.message.from.id == ALLOWED_USER_ID`
- Не совпадает -> пропускаем апдейт молча, offset всё равно сдвигается (чтобы Telegram забыл)

### GitHub PAT
- **Fine-grained**, не classic
- **Resource owner:** твой аккаунт
- **Repository access:** только одна репа из `GH_REPO`
- **Permissions:** только `Contents: Read and write`
- **Expiration:** 1 год, ротация руками

### Bot Token
Если PAT или BOT_TOKEN утёк — отозвать в @BotFather (`/revoke`) или GitHub соответственно, перезаписать через `wrangler secret put`.

## Что вне скоупа v1

- Webhook (выбрали cron polling сознательно — единственный invocation point)
- Multi-user / OAuth flow / GitHub App
- Голосовые сообщения, фото, документы
- Команды бота (`/start`, `/help`, `/status`)
- Настройка целевой репы через чат (всё в секретах)
- Любое состояние кроме `last_offset` в KV
