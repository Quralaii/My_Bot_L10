// Регистрирует адрес Worker как webhook Telegram-бота.
// Запуск: BOT_TOKEN и WEBHOOK_SECRET берутся из переменных окружения (не из аргументов,
// чтобы токен не попадал в историю команд):
//   node scripts/set-webhook.mjs https://my-bot.kuralaiadilbek1.workers.dev/telegram

const { BOT_TOKEN, WEBHOOK_SECRET } = process.env;
const url = process.argv[2];

if (!BOT_TOKEN || !WEBHOOK_SECRET || !url) {
	console.error(
		"Нужны BOT_TOKEN, WEBHOOK_SECRET (переменные окружения) и адрес webhook (аргумент).",
	);
	process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({
		url,
		secret_token: WEBHOOK_SECRET,
		allowed_updates: ["message", "callback_query"],
		drop_pending_updates: true,
	}),
});
const data = await response.json();
console.log(data.ok ? `Webhook установлен: ${url}` : `Ошибка: ${data.description}`);
process.exit(data.ok ? 0 : 1);
