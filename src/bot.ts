// Promise Bot — Telegram-бот с кнопками: валюты, погода, Promise.race, информация о странах.
// Работает как Cloudflare Worker: Telegram сам присылает обновления на адрес /telegram (webhook).
// Worker не помнит ничего между запросами, поэтому режим «жду название страны»
// держится на ответе (reply) на сообщение бота, а не на переменной в памяти.

// ---------- Типы ----------

interface Weather {
	current: {
		time: string;
		temperature_2m: number;
		wind_speed_10m: number;
	};
}

// Ответ open.er-api.com: сколько единиц валюты даёт 1 тенге
interface Rates {
	result: string;
	time_last_update_utc: string;
	rates: Record<string, number>;
}

// Ответ Википедии (краткая справка по статье)
interface WikiSummary {
	type: string;
	title: string;
	description?: string;
	extract: string;
	content_urls?: { desktop?: { page?: string } };
}

interface Button {
	text: string;
	callback_data: string;
}
type Keyboard = Button[][];

// Обновление от Telegram: обычное сообщение или нажатие на кнопку
export interface Update {
	update_id: number;
	message?: {
		chat: { id: number };
		text?: string;
		reply_to_message?: { text?: string };
	};
	callback_query?: {
		id: string;
		data?: string;
		message?: { chat: { id: number } };
	};
}

interface TelegramResponse<T> {
	ok: boolean;
	result: T;
	description?: string;
}

// ---------- Telegram ----------

// Вызов любого метода Telegram Bot API; токен приходит из секрета Worker (env.BOT_TOKEN)
async function telegram<T>(token: string, method: string, body: object): Promise<T> {
	const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const data = (await response.json()) as TelegramResponse<T>;
	if (!data.ok) {
		throw new Error(`Telegram ${method}: ${data.description ?? response.status}`);
	}
	return data.result;
}

// Отправляет сообщение с кнопками под текстом (inline-клавиатура)
async function send(
	token: string,
	chatId: number,
	text: string,
	keyboard: Keyboard,
): Promise<void> {
	await telegram(token, "sendMessage", {
		chat_id: chatId,
		text,
		parse_mode: "HTML",
		reply_markup: { inline_keyboard: keyboard },
	});
}

// В режиме HTML символы < > & нужно экранировать
function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- Кнопки ----------

// Главное меню: 2 ряда по 2 кнопки; callback_data приходит боту при нажатии
const menuKeyboard: Keyboard = [
	[
		{ text: "💱 Обмен валют", callback_data: "rates" },
		{ text: "🌤 Погода", callback_data: "weather" },
	],
	[
		{ text: "⚡ Promise Race", callback_data: "race" },
		{ text: "🌍 Информация о странах", callback_data: "country" },
	],
];

const backKeyboard: Keyboard = [[{ text: "🏠 Меню", callback_data: "menu" }]];

const countryKeyboard: Keyboard = [
	[
		{ text: "🌍 Другая страна", callback_data: "country" },
		{ text: "🏠 Меню", callback_data: "menu" },
	],
];

const greeting = "Привет! 👋\n\nЯ - Promise Bot!\n\nУ меня есть интересные функции. Что выберешь?";

// Этот текст бот просит ответить на него; по нему же узнаём, что пользователь прислал страну
const countryPrompt = "🌍 Напишите название страны, например: Казахстан";

// ---------- Данные из API ----------

// Погода в Алматы (ветер сразу в м/с)
async function getWeather(): Promise<Weather> {
	const url =
		"https://api.open-meteo.com/v1/forecast?latitude=43.24&longitude=76.89&current=temperature_2m,wind_speed_10m&wind_speed_unit=ms";
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Погода: сервер ответил ${response.status}`);
	}
	return (await response.json()) as Weather;
}

// Курсы валют: открытый API open.er-api.com (один рыночный курс, без покупки/продажи)
async function getRates(): Promise<Rates> {
	const response = await fetch("https://open.er-api.com/v6/latest/KZT");
	if (!response.ok) {
		throw new Error(`Курсы: сервер ответил ${response.status}`);
	}
	const data = (await response.json()) as Rates;
	if (data.result !== "success") {
		throw new Error("Курсы: неожиданный формат ответа");
	}
	return data;
}

// Краткая справка о стране из Русской Википедии (понимает русские названия)
async function getCountry(name: string): Promise<WikiSummary | undefined> {
	// в адресах Википедии пробелы заменяются на _ ("Южная Корея" -> "Южная_Корея")
	const title = encodeURIComponent(name.trim().replace(/\s+/g, "_"));
	const response = await fetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${title}`, {
		headers: { "User-Agent": "PromiseBot/1.0 (educational Telegram bot)" },
	});
	if (response.status === 404) {
		return undefined; // статьи с таким названием нет — это не ошибка, просто «не нашли»
	}
	if (!response.ok) {
		throw new Error(`Википедия: сервер ответил ${response.status}`);
	}
	return (await response.json()) as WikiSummary;
}

// ---------- Тексты ответов ----------

function weatherText(weather: Weather): string {
	return `🌤 В Алматы сейчас ${weather.current.temperature_2m} °C, ветер ${weather.current.wind_speed_10m} м/с`;
}

const currencies: Record<string, string> = {
	USD: "доллар",
	EUR: "евро",
	RUB: "рубль",
	CNY: "юань",
};

function ratesText(rates: Rates): string {
	const lines = [`Курс на ${rates.time_last_update_utc}`, "(тенге за 1 единицу):", ""];
	for (const code in currencies) {
		const name = `${currencies[code]} (${code})`;
		const perTenge = rates.rates[code];
		if (perTenge === undefined) {
			lines.push(`${name.padEnd(16)}курса нет`);
			continue;
		}
		lines.push(`${name.padEnd(16)}${(1 / perTenge).toFixed(2)} ₸`);
	}
	return `💱 <pre>${escapeHtml(lines.join("\n"))}</pre>`; // <pre> — моноширинный шрифт, таблица ровная
}

function countryText(country: WikiSummary): string {
	if (country.type === "disambiguation") {
		return "Таких статей несколько, уточните название страны.";
	}
	const maxLength = 700;
	const extract =
		country.extract.length > maxLength
			? `${country.extract.slice(0, maxLength)}…`
			: country.extract;
	const link = country.content_urls?.desktop?.page;
	const head = `🌍 <b>${escapeHtml(country.title)}</b>`;
	const description = country.description ? `\n<i>${escapeHtml(country.description)}</i>` : "";
	const more = link ? `\n\n<a href="${escapeHtml(link)}">Читать в Википедии</a>` : "";
	return `${head}${description}\n\n${escapeHtml(extract)}${more}`;
}

// Результат одного замера скорости запроса
interface Timing {
	name: string;
	ms: number;
	ok: boolean;
}

// Выполняет запрос и замеряет время; сам никогда не отклоняется (ошибка попадает в ok: false)
async function timed(name: string, request: () => Promise<unknown>): Promise<Timing> {
	const start = performance.now();
	try {
		await request();
		return { name, ms: Math.round(performance.now() - start), ok: true };
	} catch {
		return { name, ms: Math.round(performance.now() - start), ok: false };
	}
}

// Promise.race: запускаем три запроса одновременно, смотрим, кто финиширует первым
async function raceText(): Promise<string> {
	const runners = [
		timed("open-meteo.com (погода)", getWeather),
		timed("open.er-api.com (курсы)", getRates),
		timed("ru.wikipedia.org (страны)", () => getCountry("Казахстан")),
	];

	const winner = await Promise.race(runners); // первый завершившийся
	const all = await Promise.allSettled(runners); // дожидаемся остальных для таблицы

	const lines = [`🏆 Победитель: ${winner.name} — ${winner.ms} мс`, "", "Все участники:"];
	for (const result of all) {
		if (result.status === "fulfilled") {
			const t = result.value;
			lines.push(`${t.ok ? "✅" : "❌"} ${t.name} — ${t.ms} мс`);
		}
	}
	return `⚡ <b>Promise.race</b> — кто ответит быстрее?\n\n${escapeHtml(lines.join("\n"))}`;
}

// ---------- Обработка нажатий и сообщений ----------

// Реакция на нажатие кнопки: data — это callback_data нажатой кнопки
async function handleButton(token: string, chatId: number, data: string): Promise<void> {
	switch (data) {
		case "menu":
			await send(token, chatId, greeting, menuKeyboard);
			break;
		case "weather":
			await send(token, chatId, weatherText(await getWeather()), backKeyboard);
			break;
		case "rates":
			await send(token, chatId, ratesText(await getRates()), backKeyboard);
			break;
		case "race":
			await send(token, chatId, await raceText(), backKeyboard);
			break;
		case "country":
			// force_reply открывает у пользователя ответ на это сообщение; ответ узнаём по тексту
			await telegram(token, "sendMessage", {
				chat_id: chatId,
				text: countryPrompt,
				reply_markup: { force_reply: true, input_field_placeholder: "Название страны" },
			});
			break;
		default:
			await send(token, chatId, "Не знаю такую кнопку.", backKeyboard);
	}
}

// Реакция на обычное текстовое сообщение
async function handleText(
	token: string,
	chatId: number,
	text: string,
	repliedTo: string | undefined,
): Promise<void> {
	if (text.startsWith("/")) {
		await send(token, chatId, greeting, menuKeyboard); // /start, /menu и любая другая команда
		return;
	}
	if (repliedTo === countryPrompt) {
		const country = await getCountry(text);
		const answer =
			country === undefined
				? "Такую страну не нашёл. Проверьте название и попробуйте ещё раз."
				: countryText(country);
		await send(token, chatId, answer, countryKeyboard);
		return;
	}
	await send(token, chatId, greeting, menuKeyboard);
}

// Выполняет действие; при ошибке сообщает о ней в чат, а бот продолжает работать
async function run(token: string, chatId: number, action: () => Promise<void>): Promise<void> {
	try {
		await action();
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		console.error(reason);
		await send(token, chatId, `Не получилось: ${escapeHtml(reason)}`, backKeyboard);
	}
}

// Разбирает одно обновление от Telegram: нажатие кнопки или текст
export async function handleUpdate(token: string, update: Update): Promise<void> {
	const query = update.callback_query;
	if (query !== undefined) {
		const chatId = query.message?.chat.id;
		// убирает «часики» на кнопке
		await telegram(token, "answerCallbackQuery", { callback_query_id: query.id });
		if (chatId !== undefined && query.data !== undefined) {
			const data = query.data;
			await run(token, chatId, () => handleButton(token, chatId, data));
		}
		return;
	}

	const message = update.message;
	if (message?.text !== undefined) {
		const text = message.text;
		const repliedTo = message.reply_to_message?.text;
		await run(token, message.chat.id, () => handleText(token, message.chat.id, text, repliedTo));
	}
}
