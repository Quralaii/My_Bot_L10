# my-bot

Telegram-бот «Promise Bot» на Cloudflare Worker. Telegram присылает сообщения на `/telegram` (webhook).

Команды: `/city Астана` запоминает город, `/weather` (или кнопка «🌤 Погода») показывает в нём погоду.
Профиль: `/name Аружан`, `/language ru` (`ru`, `kk` или `en`), `/age 20`, `/country Япония`.
`/mycountry` показывает справку о сохранённой стране, `/profile` — всё сохранённое.
То же самое есть в меню кнопками «Имя», «Язык», «Возраст», «Моя страна» и «Профиль».
Бот отвечает на выбранном языке (по умолчанию на русском). Все тексты лежат в `src/texts.ts`.
Город при любом языке ищется как для русского: с `kk` сервис находит не те места, а с `en` не находит русские названия.

Настройки хранятся в Workers KV `my-bot-memory` (привязка `CITY_KV`): ключ — id чата,
значение — JSON по `interface ChatSettings`, например `{"city":"Астана","age":20}`.
Все поля необязательные.

Токен в репозитории не хранится: `BOT_TOKEN` и `WEBHOOK_SECRET` добавляются секретами в
dash.cloudflare.com (Workers → my-bot → Settings → Variables and Secrets).

Подключить webhook (переменные окружения `BOT_TOKEN` и `WEBHOOK_SECRET` должны быть заданы):

    npm run webhook
