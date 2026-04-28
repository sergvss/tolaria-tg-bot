# Этап 0. Подготовка внешних сервисов

Четыре шага, всё руками вне репо. Цель — на руках 5 значений (`BOT_TOKEN`, `ALLOWED_USER_ID`, `GH_TOKEN`, `GH_REPO`, `GH_FOLDER`) и залогиненный аккаунт Cloudflare.

## Шаг 1. Создать бота через @BotFather

1. Telegram -> поиск `@BotFather` -> `/start`
2. Команда `/newbot`
3. **Display name** (как видно в чате): например `Inbox Bot`
4. **Username** (должен заканчиваться на `bot`): например `MyInboxBot`
5. BotFather пришлёт токен вида `123456789:ABCdef...` — это `BOT_TOKEN`, сохранить в надёжное место (менеджер паролей)

**Дополнительно:**
- `/setdescription` — описание для экрана «о боте»
- `/setuserpic` — аватарка
- `/setjoingroups` -> Disable (бот только для DM)
- `/setprivacy` -> можно оставить дефолт

**Критерий:** в Telegram нашёл своего бота по username, нажал Start (бот молчит — это нормально).

## Шаг 2. Узнать свой Telegram user_id

1. Telegram -> поиск `@userinfobot` -> `/start`
2. Бот пришлёт сообщение с `Id: 123456789`
3. Это `ALLOWED_USER_ID`, сохранить (целое число)

**Критерий:** число записано, формат — 9-10 цифр без кавычек.

## Шаг 3. Создать целевую приватную репу и fine-grained PAT

### 3.1 Репозиторий
1. GitHub -> **New repository**
2. Имя любое (например `my-notes`), **Private**
3. Init с README — чтобы появилась `main` ветка
4. Сохранить имя в формате `owner/repo` — это `GH_REPO`. `GH_FOLDER` — папка внутри репы (например `inbox`), создавать заранее не обязательно (бот создаст при первом коммите)

### 3.2 Personal Access Token
1. GitHub -> аватарка -> **Settings** -> внизу слева **Developer settings** -> **Personal access tokens** -> **Fine-grained tokens** -> **Generate new token**
2. **Token name:** `tolaria-tg-bot`
3. **Expiration:** 1 year
4. **Resource owner:** твой аккаунт
5. **Repository access:** **Only select repositories** -> выбрать **только** репу из шага 3.1
6. **Repository permissions:** найти **Contents** -> **Read and write**. Больше ничего не включать.
7. **Generate token** -> скопировать `github_pat_...` (показывается один раз) — это `GH_TOKEN`

**Критерий:** на странице токена `Repository access: 1 repository`, в Permissions только `Contents: Read and write`, ноль других прав.

## Шаг 4. Аккаунт Cloudflare и локальное окружение

1. https://dash.cloudflare.com/sign-up -> email + пароль -> подтвердить email
2. Бесплатный план, к карте не привязывать
3. В **My Profile -> Authentication** включить 2FA (важно)
4. Проверить локально:
   ```bash
   node -v   # должно быть >=18
   pnpm -v   # если нет — npm i -g pnpm
   ```
5. `wrangler login` — сделаем на этапе 1, когда будет проект. Если хочется проверить связь сейчас:
   ```bash
   pnpm dlx wrangler login
   ```
   Откроется браузер, подтвердить доступ.

**Критерий:** залогинен в `dash.cloudflare.com`, виден дашборд. `node -v` показывает 18+. `pnpm -v` работает.

## Итог

После всех 4 шагов на руках должно быть:

| Значение | Источник | Куда пойдёт |
|---|---|---|
| `BOT_TOKEN` | @BotFather | `wrangler secret put` (этап 3) |
| `ALLOWED_USER_ID` | @userinfobot | `wrangler secret put` (этап 3) |
| `GH_TOKEN` | GitHub fine-grained PAT | `wrangler secret put` (этап 3) |
| `GH_REPO` | имя приватной репы `owner/repo` | `wrangler secret put` (этап 3) |
| `GH_FOLDER` | папка внутри репы (например `inbox`) | `wrangler secret put` (этап 3) |

Секреты в чат и в коммиты не отправлять. Они пойдут только в `wrangler secret put`.

После этого — продолжай по [Quick start в README](../README.md#quick-start), начиная с шага 2 (`pnpm install`).
