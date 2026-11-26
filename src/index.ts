import { env } from "cloudflare:workers"; //импортировать .env файл из claudflare
import { handleUpdate, type Update } from "./bot.ts"; //импортировать функцию из bot.ts


export default {
	async fetch(request, _env, ctx) { 
		const url = new URL(request.url); //получаем URL запроса

		if (url.pathname === "/telegram") { //если путь запроса телеграмм, то обрабатываем webhook
			if (request.method !== "POST") { //если метод запроса не POST,
				return new Response("Method Not Allowed", { status: 405 });  //возвращаем ошибку 405
			}
		
			if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) { //если секрет не совпадает,
				return new Response("Forbidden", { status: 403 });     //возвращаем ошибку 403
			}
			const update = (await request.json()) as Update; //ожидаем пока получаем обновление 
	
			ctx.waitUntil(handleUpdate(env.BOT_TOKEN, update)); //вызываем функцию handleUpdate с токеном бота и обновлением
			return new Response("ok");    //возвращаем ответ "ok"
		}

		return new Response("Promise Bot работает. Напишите ему в Telegram."); //возвращаем ответ что бот работает
	},
} satisfies ExportedHandler; //экспортируем объект, который обрабатывает входящие запросы и возвращает ответы.
