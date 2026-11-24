import { env } from "cloudflare:workers";
import { handleUpdate, type Update } from "./bot.ts";

// Worker только для Telegram-бота: Telegram сам присылает сообщения на /telegram (webhook).
export default {
	async fetch(request, _env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === "/telegram") {
			if (request.method !== "POST") {
				return new Response("Method Not Allowed", { status: 405 });
			}
			// Telegram подписывает webhook секретом, который мы задали в setWebhook
			if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
				return new Response("Forbidden", { status: 403 });
			}
			const update = (await request.json()) as Update;
			// отвечаем Telegram сразу (200), а обновление обрабатываем в фоне
			ctx.waitUntil(handleUpdate(env.BOT_TOKEN, update));
			return new Response("ok");
		}

		return new Response("Promise Bot работает. Напишите ему в Telegram.");
	},
} satisfies ExportedHandler;
