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
   - Если `message.from.id != ALLOWED_USER_ID` -> пропуск (молча, но offset двигается)
   - Если `isAllowedMessage` (текст или фото от разрешённого юзера):
     - **Если есть `message.photo`:**
       1. Берём самый большой `photoSize` через `pickLargestPhoto`
       2. `getFile(file_id)` → `file_path`
       3. `downloadFile(file_path)` → `Uint8Array`
       4. `putBinary` в `attachments/<YYYY-MM-DD-HHMMSS>-<file_unique_id>.<ext>` (idempotent на 422 — дубликаты skip)
       5. Запоминаем `attachment` для заметки
     - `buildNote({text, caption, attachments, forwardedFrom, ...})` собирает markdown
     - `putFile` в `<GH_FOLDER>/<YYYY-MM-DD-HHMMSS>.md` (с retry на 422 — суффикс `-{rand4hex}`, до 3 попыток)
   - Иначе (видео, голос, документ) -> пропуск (offset двигается)
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
  index.ts      // entry, scheduled handler, оркестрация цикла, обработка фото
  telegram.ts   // типы Bot API, getUpdates/getFile/downloadFile,
                // фильтры isAllowedTextMessage/isAllowedPhotoMessage,
                // pickLargestPhoto, getForwardChatTitle
  github.ts     // putFile (текст) и putBinary (картинки) через Contents API,
                // retry helpers, утилиты utf8ToBase64/bytesToBase64
  markdown.ts   // buildNote (Variant 2: type:Note + H1 + attachments),
                // buildAttachmentPath, withRandomSuffix
```

## Формат файла

**Имя заметки:** `<GH_FOLDER>/2026-04-28-184515.md`

- `YYYY-MM-DD-HHMMSS` берётся из `message.date` (UTC)
- Имя не зависит от текста сообщения — однозначно по моменту получения

**Имя картинки:** `attachments/2026-04-28-184515-<file_unique_id>.<ext>`

- `file_unique_id` — короткий уникальный ID Telegram, защищает от случайных дубликатов
- `<ext>` определяется из `file_path` ответа Telegram getFile (`.jpg`/`.png`/`.webp`)
- Идемпотентно: если такая картинка уже есть в репе — PUT 422 silent skip, заметка всё равно создаётся

**Тело (Variant 2):**

```markdown
---
captured_at: 2026-04-28T18:45:15Z
source: telegram
type: Note
forwarded_from: "Channel Name"
---
# Первая строка текста (или caption)

Остальные строки

![photo.jpg](attachments/2026-04-28-184515-AgADxxx.jpg)
```

- `type: Note` — для категоризации в Tolaria
- `forwarded_from` — только при forward из канала/чата, иначе отсутствует
- H1 — первая непустая строка text/caption. Если ни text ни caption — H1 не добавляется.
- Body — остальные строки text/caption
- Attachments — после body, в формате `![filename](attachments/...)` с относительным путём от корня vault

**Коллизия имени файла** заметки (HTTP 422 от GitHub) — retry с суффиксом `-{rand4hex}` в имени, до 3 попыток.
**Коллизия имени attachment** — silent skip (идемпотентность по `file_unique_id`).

## Скоуп v1.1

- **Текст и фото.** `message.text`, `message.photo` (с опциональным `message.caption`). Голос, видео, документы — пропускаются (запланированы в v1.2/v1.3).
- **Forward'ы из каналов/чатов** распознаются и помечаются в frontmatter.
- **Личный чат.** Не группа, не канал.
- **Один пользователь.** Whitelist по `ALLOWED_USER_ID`.
- **Одна целевая репа и папка.** Зашиты в секреты при деплое.
- **Альбомы (media groups)** — каждое фото = отдельная заметка (объединение в v1.x не делаем).

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

## Что вне скоупа v1.1

- Webhook (выбрали cron polling сознательно — единственный invocation point)
- Multi-user / OAuth flow / GitHub App
- Голосовые/аудио (v1.3 с транскрипцией через OpenRouter)
- Видео (v1.2)
- Документы (`message.document`)
- Команды бота (`/start`, `/help`, `/status`)
- Настройка целевой репы через чат (всё в секретах)
- Любое состояние кроме `last_offset` в KV
