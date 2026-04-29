# tolaria-tg-bot

Минималистичный Telegram-бот в одном Cloudflare Worker. Запускается по cron каждую минуту, забирает текст и фото из личного чата с тобой и коммитит каждое как markdown-файл (а фото — в `attachments/`) в указанный приватный GitHub-репозиторий.

Никаких серверов, БД, Docker — только Cloudflare Workers + Cloudflare KV (бесплатный план). Совместим с приложением [Tolaria](https://github.com/sergvss/tolaria-vss) (заметки автоматически попадают в его раздел Inbox), но работает с любой markdown-vault системой.

## Как работает

```
[Cron каждую минуту]
    -> [Cloudflare Worker]
    -> Telegram getUpdates(offset)
    -> для каждого allowed message:
         если фото:
           Telegram getFile + downloadFile (binary)
           GitHub PUT /<GH_REPO>/attachments/YYYY-MM-DD-HHMMSS-<id>.<ext>
         GitHub PUT /<GH_REPO>/<GH_FOLDER>/YYYY-MM-DD-HHMMSS.md (заметка с markdown-ссылкой на фото)
    -> сохранить новый offset в Cloudflare KV
```

**Один авторизованный пользователь.** Сообщения от любого другого Telegram-аккаунта игнорируются (offset двигается, но коммита нет — Telegram забывает апдейт).

## Поддерживаемые типы сообщений (v1.1)

| Тип | Поведение |
|---|---|
| **Текст** | Заметка с frontmatter + H1 (первая строка) + body (остальное) |
| **Фото** | Картинка в `attachments/`, заметка с markdown-ссылкой `![photo.jpg](attachments/...)` |
| **Фото + подпись** | Caption становится заголовком и body заметки, картинка ссылкой в конце |
| **Forward из канала/чата** | Добавляется поле `forwarded_from: "<source>"` в frontmatter |
| Голосовые, видео, документы | **Пока пропускаются.** Запланированы в v1.2 (видео) и v1.3 (голосовые с авто-транскрипцией через OpenRouter) |

**Имя файла:** `YYYY-MM-DD-HHMMSS.md` по UTC. Коллизия (если два сообщения в одну секунду) решается суффиксом `-{rand4hex}`.

**Имя картинки:** `YYYY-MM-DD-HHMMSS-<file_unique_id>.<ext>`. Дубликаты идемпотентны (PUT с тем же `file_unique_id` молча игнорируется).

**Frontmatter:**
```yaml
---
captured_at: 2026-04-29T01:23:45Z
source: telegram
type: Note
forwarded_from: "Channel Name"  # только для forward'ов
---
```

`type: Note` нужен для совместимости с категоризацией заметок в Tolaria. Поле `organized` намеренно НЕ ставится — заметка автоматически попадает в виртуальный Inbox.

## Стек

- **TypeScript** + **Cloudflare Workers** (бесплатный план: 100k invocations/день, нам хватает 1440)
- **Cloudflare KV** — единственное состояние (`last_offset`)
- **wrangler** для деплоя и секретов
- **pnpm** + **vitest** для тестов

Cloudflare account ID, KV namespace ID и subdomain настраиваются под твой аккаунт при первом деплое.

## Quick start

### 1. Подготовка внешних сервисов

Подробно расписано в [docs/setup.md](docs/setup.md). Кратко:

| Что | Где взять |
|---|---|
| `BOT_TOKEN` | `@BotFather` → `/newbot` |
| `ALLOWED_USER_ID` | `@userinfobot` → `/start` (твой Telegram ID) |
| `GH_TOKEN` | github.com → Settings → Developer settings → Fine-grained tokens, scope: **только целевая репа**, permissions: **Contents read+write** |
| `GH_REPO`, `GH_FOLDER` | твоя приватная репа для заметок (создай заранее с README, чтобы появилась `main`) и папка внутри неё |
| Cloudflare аккаунт | https://dash.cloudflare.com/sign-up (бесплатный план) |

### 2. Установить локально

Требования: Node.js >=18 и pnpm.

```bash
git clone https://github.com/sergvss/tolaria-tg-bot.git
cd tolaria-tg-bot
pnpm install
```

### 3. Залогиниться в Cloudflare через wrangler

```bash
pnpm wrangler login
```

Откроется браузер, нажми Allow.

### 4. Создать свой KV namespace

KV namespace ID в `wrangler.toml` относится к моему аккаунту — у тебя должен быть свой.

```bash
pnpm wrangler kv namespace create OFFSETS
```

Команда выведет блок:
```toml
[[kv_namespaces]]
binding = "OFFSETS"
id = "<твой-новый-id>"
```

Замени `id` в [wrangler.toml](wrangler.toml) на свой.

### 5. Залить секреты

```bash
echo "<твой-bot-token>"        | pnpm wrangler secret put BOT_TOKEN
echo "<твой-telegram-user-id>" | pnpm wrangler secret put ALLOWED_USER_ID
echo "<твой-github-pat>"       | pnpm wrangler secret put GH_TOKEN
echo "owner/repo"              | pnpm wrangler secret put GH_REPO
echo "inbox"                   | pnpm wrangler secret put GH_FOLDER
# Опционально, если ветка не main:
echo "master"                  | pnpm wrangler secret put GH_BRANCH
```

В Windows PowerShell вместо `echo "..."` лучше запустить интерактивно — `pnpm wrangler secret put BOT_TOKEN` без пайпа, wrangler сам спросит значение и не покажет его в истории.

### 6. Задеплоить

```bash
pnpm wrangler deploy
```

Через минуту Worker запустится по cron и начнёт обрабатывать сообщения. Если в Cloudflare Dashboard видишь ошибку про workers.dev subdomain — пройди одноразовый onboarding по ссылке из ошибки (требуется один раз для нового аккаунта).

### 7. Проверить

Отправь любой текст своему боту в Telegram. Через до 60 секунд проверь репу:
```
https://github.com/<GH_REPO>/tree/main/<GH_FOLDER>
```
Должен появиться файл `YYYY-MM-DD-HHMMSS.md` с твоим сообщением.

## Конфигурация

| Имя | Тип | Описание |
|---|---|---|
| `BOT_TOKEN` | secret | Telegram Bot HTTP API token |
| `ALLOWED_USER_ID` | secret | единственный разрешённый Telegram `from.id` (число) |
| `GH_TOKEN` | secret | GitHub fine-grained PAT, Contents read+write на целевую репу |
| `GH_REPO` | secret | целевая репа в формате `owner/repo` |
| `GH_FOLDER` | secret | папка внутри репы (без слешей по краям) |
| `GH_BRANCH` | secret (optional) | целевая ветка, default `main` |

Хранятся через `wrangler secret put`, шифруются на стороне Cloudflare. В коде/репе их нет.

## Структура проекта

```
src/
  index.ts        // scheduled-handler + processUpdates оркестратор
                  // (фильтр, скачивание фото, retry заметки)
  index.test.ts
  telegram.ts     // типы Bot API, getUpdates, getFile, downloadFile,
                  // фильтры isAllowedTextMessage / isAllowedPhotoMessage
  telegram.test.ts
  github.ts       // putFile (текст), putBinary (картинки), retry helpers
  github.test.ts
  markdown.ts     // buildNote (Variant 2 с type:Note + H1 + attachments),
                  // buildAttachmentPath, withRandomSuffix
  markdown.test.ts
docs/
  architecture.md // подробная архитектура и решения
  setup.md        // пошаговая подготовка внешних сервисов
  stages.md       // история разработки v1
.dev.vars.example // шаблон env vars для wrangler dev
wrangler.toml     // конфигурация Worker'а: cron, KV binding, observability
```

## Локальная разработка

```bash
pnpm test          # vitest, 88 тестов
pnpm test:watch    # vitest в watch-режиме
pnpm typecheck     # tsc --noEmit
pnpm dev           # wrangler dev (для smoke-проверки, требует .dev.vars)
```

Для `wrangler dev` скопируй `.dev.vars.example` в `.dev.vars` и заполни значениями. `.dev.vars` в `.gitignore`, в репу не попадёт.

## Деплой

```bash
pnpm deploy        # wrangler deploy
pnpm wrangler tail # потоковые логи (требует wrangler 4+)
```

Альтернатива — настроить GitHub Actions для авто-деплоя на push в `main` (см. https://github.com/cloudflare/wrangler-action).

## Что вне скоупа v1.1

- Multi-user / OAuth flow / GitHub App
- Голосовые и аудио — запланированы в v1.3 с авто-транскрипцией через OpenRouter
- Видео и видео-сообщения (кружочки) — запланированы в v1.2
- Документы (`message.document`)
- Команды бота (`/start`, `/help`)
- Настройка целевой репы через чат
- Webhook (выбран cron polling сознательно — единственный invocation point у serverless)
- Объединение альбомов (несколько фото с одним `media_group_id`) в одну заметку — пока каждое фото = отдельная заметка

## Документация

- [docs/architecture.md](docs/architecture.md) — детали архитектуры, формат файлов, безопасность
- [docs/setup.md](docs/setup.md) — пошаговая подготовка Telegram, GitHub, Cloudflare
- [docs/stages.md](docs/stages.md) — история разработки

## Notes

- **Коммиты от Worker** в целевую репу — на английском (`Add inbox/...`). Это автоматизация, стандарт для машинного контента.
- **Совместимость с Tolaria.** Бот не ставит в frontmatter поля `archived`, `isA`, `organized` — заметка автоматически попадает в виртуальный Inbox в Tolaria. Когда заметка «разобрана» в Tolaria, она ставит `organized: true` и заметка уходит из Inbox. Бот в этом не участвует.
- **Single-user.** В secrets лежит ровно один `ALLOWED_USER_ID`. Любые попытки использования другими игнорируются (но offset двигается, чтобы Telegram забыл).

## License

[Apache License 2.0](LICENSE) — свободное использование, модификация и распространение, в том числе в коммерческих целях. Включает явный grant патентных прав.
