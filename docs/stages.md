# Этапы разработки

Проект разбит на 5 этапов от внешней подготовки до e2e-проверки. Каждый этап имеет критерий готовности — пока он не выполнен, к следующему этапу не переходим.

## Этап 0. Подготовка внешних сервисов

**Что делается:** руками вне репо — создание бота, получение user_id, GitHub PAT, аккаунт Cloudflare.

**Подробная инструкция:** [setup.md](setup.md)

**Критерий готовности:** на руках 5 значений — `BOT_TOKEN`, `ALLOWED_USER_ID`, `GH_TOKEN`, `GH_REPO`, `GH_FOLDER`. Залогинен в Cloudflare. Node.js >=18 установлен.

## Этап 1. Скелет проекта

**Что делается:**
- `pnpm dlx wrangler init` в корне репо
- Настроить TypeScript, vitest
- Создать пустые `src/index.ts`, `src/telegram.ts`, `src/github.ts`, `src/markdown.ts`
- В `wrangler.toml`:
  - `[triggers]` cron `* * * * *` (каждую минуту)
  - `main = "src/index.ts"`
  - `compatibility_date`
  - Биндинг KV namespace (id появится после `wrangler kv namespace create OFFSETS`)

**Критерий готовности:**
- `pnpm install` отрабатывает без ошибок
- `pnpm test` запускает vitest
- `pnpm exec wrangler dev` запускает Worker локально, scheduled handler можно дёрнуть через `pnpm exec wrangler dev --test-scheduled` и эндпоинт `/__scheduled`

## Этап 2. Логика по TDD

**Порядок написания (каждый шаг — тесты вперёд кода):**

1. **`markdown.ts`** — `buildNote(text, unixDate, folder)` собирает имя файла `YYYY-MM-DD-HHMMSS.md` (UTC) и тело с YAML frontmatter (`captured_at`, `source: telegram`); `withRandomSuffix(path, hex)` для retry на коллизии.
   _Тесты:_ паддинг времени нулями, нормализация слешей в folder, имя не зависит от текста.

2. **`telegram.ts`** — типы `Update`, `Message`; функция `getUpdates(token, offset)` через `fetch`; фильтр `isAllowedTextMessage(update, allowedUserId)`.
   _Тесты:_ парсинг типичного апдейта, фильтр по `from.id`, отсутствие `text`, сообщения из групп.

3. **`github.ts`** — `putFile(params)` с PUT в Contents API; `PathConflictError` на HTTP 422 для последующего retry с `withRandomSuffix` в оркестраторе (максимум 3 попытки).
   _Тесты:_ моки fetch для 201/422/401.

4. **`index.ts`** — оркестратор: read offset из KV → `getUpdates` → for-each (фильтр + buildNote + putFile с retry на 422) → write новый offset.
   _Тесты:_ пустой батч, allowed/не-allowed, retry, бросок после max попыток.

**Критерий готовности:**
- Все unit-тесты зелёные
- Нет ни одного хардкоженого секрета в исходниках
- Логика scheduled handler в `index.ts`: цикл readKV -> getUpdates -> for-each -> putFile -> writeKV

## Этап 3. Безопасность и секреты

**Что делается:**
- Создать KV namespace: `pnpm exec wrangler kv namespace create OFFSETS` -> вписать ID в `wrangler.toml`
- Залить секреты:
  ```bash
  pnpm exec wrangler secret put BOT_TOKEN
  pnpm exec wrangler secret put GH_TOKEN
  pnpm exec wrangler secret put GH_REPO
  pnpm exec wrangler secret put GH_FOLDER
  pnpm exec wrangler secret put ALLOWED_USER_ID
  # GH_BRANCH опционально, default 'main' в коде
  ```
- Чужие `from.id` -> пропуск без коммита, но offset двигается (чтобы Telegram забыл)
- В `.gitignore` добавить `.dev.vars`, `.wrangler/`, `node_modules/`, `dist/`

**Критерий готовности:**
- `pnpm exec wrangler secret list` показывает 5 секретов (или 6 с `GH_BRANCH`)
- В `wrangler.toml` нет ни одного значения секрета
- `.dev.vars` в `.gitignore`

## Этап 4. Деплой

**Что делается:**
- `pnpm exec wrangler deploy` -> Worker задеплоен, cron активирован
- Проверить в Cloudflare dashboard: Workers & Pages -> tolaria-tg-bot -> Triggers -> Cron Triggers стоит `* * * * *`
- Подождать 1-2 минуты, посмотреть логи: Workers -> Logs (или `pnpm exec wrangler tail`)
- При первом запуске KV пустой -> `getUpdates(offset=0)` подтягивает всё что лежит в очереди Telegram

**Критерий готовности:**
- Worker задеплоен
- В логах видно успешный invocation cron'а раз в минуту
- В KV появилось значение `last_offset`

## Этап 5. End-to-end проверка

**Позитивный сценарий:**
1. Отправить в DM боту: `Тестовое сообщение от 28 апреля`
2. Дождаться следующего тика cron'а (до 1 минуты)
3. Открыть `https://github.com/<GH_REPO>/tree/main/<GH_FOLDER>` — появился файл `2026-04-28-XXXX-testovoe-soobshchenie-ot-28-aprelya.md`
4. Файл содержит правильный frontmatter и текст

**Негативный сценарий:**
1. Кто-то с другим Telegram-аккаунтом пишет боту
2. Через минуту проверить — в репе ничего нового
3. В логах Worker'а видно, что апдейт пришёл и был отброшен по whitelist

**Критерий готовности проекта:** оба сценария проходят без ручного вмешательства.

## После v1

Возможные расширения, не входящие в текущий план:
- Поддержка фото с подписью (фото в `attachments/`, заметка ссылается)
- Голосовые с распознаванием через внешнее API
- Команда `/last` — показать ссылку на последнюю заметку
- Переход на webhook (если задержка до 1 минуты окажется некомфортной)

Любое из этих требует отдельного обсуждения и нового плана этапов.
