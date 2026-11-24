# my-bot

Telegram-бот «Promise Bot» на Cloudflare Worker. Telegram присылает сообщения на `/telegram` (webhook).

Токен в репозитории не хранится: `BOT_TOKEN` и `WEBHOOK_SECRET` добавляются секретами в
dash.cloudflare.com (Workers → my-bot → Settings → Variables and Secrets).

Подключить webhook (переменные окружения `BOT_TOKEN` и `WEBHOOK_SECRET` должны быть заданы):

    npm run webhook
