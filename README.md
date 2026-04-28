# tolaria-tg-bot

Telegram-бот в одном Cloudflare Worker. По расписанию опрашивает Telegram, забирает текстовые сообщения от одного разрешённого пользователя и коммитит каждое как отдельный markdown-файл в указанную папку приватного GitHub-репозитория.

## Зачем

Быстрая капча мыслей с телефона в свой git-репозиторий заметок. Никаких серверов, базы данных нет — только Cloudflare Worker и GitHub.

## Поток

```
[Cron каждую минуту]
    -> [Cloudflare Worker запускается]
    -> Telegram getUpdates(offset)
    -> для каждого нового сообщения:
         GitHub API PUT /<GH_REPO>/contents/<GH_FOLDER>/<file>.md
    -> сохранить новый offset в KV
```

## Стек

- **TypeScript** + **Cloudflare Workers** (бесплатный план)
- **Cloudflare KV** — единственное хранилище состояния, держит offset последнего обработанного апдейта
- **wrangler** для деплоя и секретов
- **pnpm** + **vitest** для тестов

## Текущий статус

**Этап 0 — подготовка.** См. [docs/stages.md](docs/stages.md) для полного плана и [docs/setup.md](docs/setup.md) для инструкций по созданию бота, GitHub PAT и аккаунта Cloudflare.

## Документация

- [docs/architecture.md](docs/architecture.md) — архитектура, формат файлов, безопасность
- [docs/stages.md](docs/stages.md) — этапы разработки 0-5
- [docs/setup.md](docs/setup.md) — подготовка внешних сервисов

## Quick start

_Появится после этапа 4 (деплой)._
