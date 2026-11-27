# my-bot

Telegram-бот «Promise Bot» на Cloudflare Worker. Telegram присылает сообщения на `/telegram` (webhook).

Команды: `/city Астана` запоминает город, `/weather` (или кнопка «🌤 Погода») показывает в нём погоду.
Город хранится в Workers KV `my-bot-memory` (привязка `CITY_KV`): ключ — id чата,
значение — JSON `{"city":"Астана"}`.

Токен в репозитории не хранится: `BOT_TOKEN` и `WEBHOOK_SECRET` добавляются секретами в
dash.cloudflare.com (Workers → my-bot → Settings → Variables and Secrets).

Подключить webhook (переменные окружения `BOT_TOKEN` и `WEBHOOK_SECRET` должны быть заданы):

    npm run webhook
