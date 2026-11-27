// Promise Bot — Telegram-бот с кнопками: валюты, погода, Promise.race, информация о странах.
// Работает как Cloudflare Worker: Telegram сам присылает обновления на адрес /telegram (webhook).
// Worker не помнит ничего между запросами, поэтому режим «жду название страны»
// держится на ответе (reply) на сообщение бота, а не на переменной в памяти.
// Настройки пользователя (город, имя и другие) хранятся в Workers KV (привязка CITY_KV).

import { type Language, type Texts, texts } from "./texts.ts";

// ---------- Типы ----------

// Настройки чата; в KV лежат как JSON, ключ — id чата.
// «?» — поля может не быть: пользователь задаёт их по одному
export interface ChatSettings {
	city?: string;
	name?: string;
	language?: Language;
	age?: number;
	country?: string;
}

// Ответ поиска городов Open-Meteo; если ничего не найдено, поля results нет
interface Place {
	name: string;
	latitude: number;
	longitude: number;
}
interface GeocodingResponse {
	results?: Place[];
}

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
function menuKeyboard(t: Texts): Keyboard {
	return [
		[
			{ text: t.ratesButton, callback_data: "rates" },
			{ text: t.weatherButton, callback_data: "weather" },
		],
		[
			{ text: "⚡ Promise Race", callback_data: "race" },
			{ text: t.countryButton, callback_data: "country" },
		],
	];
}

function backKeyboard(t: Texts): Keyboard {
	return [[{ text: t.menuButton, callback_data: "menu" }]];
}

function countryKeyboard(t: Texts): Keyboard {
	return [
		[
			{ text: t.otherCountryButton, callback_data: "country" },
			{ text: t.menuButton, callback_data: "menu" },
		],
	];
}

// ---------- Проверка значений ----------

// Непустой текст не длиннее maxLength
function isText(value: unknown, maxLength = 100): value is string {
	return typeof value === "string" && value.trim() !== "" && value.length <= maxLength;
}

function isName(value: unknown): value is string {
	return isText(value, 50);
}

function isLanguage(value: unknown): value is Language {
	return typeof value === "string" && Object.hasOwn(texts, value);
}

function isAge(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 120;
}

// ---------- Память (KV) ----------

async function saveSettings(
	kv: KVNamespace,
	chatId: number,
	settings: ChatSettings,
): Promise<void> {
	await kv.put(String(chatId), JSON.stringify(settings));
}

// Пустой объект — настроек нет: чат их ещё не задавал или в KV лежит не ChatSettings
async function loadSettings(kv: KVNamespace, chatId: number): Promise<ChatSettings> {
	// читаем как текст: ошибка самого KV уйдёт дальше, а не превратится в «настроек нет»
	const raw = await kv.get(String(chatId));
	return raw === null ? {} : parseSettings(raw);
}

// interface проверяется только до запуска, поэтому данные из KV проверяем сами.
// Каждое поле отдельно: плохое пропускаем, остальные оставляем
function parseSettings(raw: string): ChatSettings {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return {}; // не JSON
	}
	if (typeof value !== "object" || value === null) {
		return {};
	}
	const stored = value as Record<string, unknown>;
	const settings: ChatSettings = {};
	if (isText(stored.city)) settings.city = stored.city;
	if (isName(stored.name)) settings.name = stored.name;
	if (isLanguage(stored.language)) settings.language = stored.language;
	if (isAge(stored.age)) settings.age = stored.age;
	if (isText(stored.country)) settings.country = stored.country;
	return settings;
}

// Меняет только переданные поля, остальные сохраняет
async function updateSettings(
	kv: KVNamespace,
	chatId: number,
	changes: ChatSettings,
): Promise<void> {
	const settings = await loadSettings(kv, chatId);
	await saveSettings(kv, chatId, { ...settings, ...changes });
}

// Язык ответов; если не выбран или KV не отвечает — русский
async function loadLanguage(kv: KVNamespace, chatId: number): Promise<Language> {
	try {
		return (await loadSettings(kv, chatId)).language ?? "ru";
	} catch (error) {
		console.error(error);
		return "ru";
	}
}

// ---------- Данные из API ----------

// Ищет город по названию и возвращает его координаты.
// language=ru при любом языке бота: с kk находятся не те места, а с en не ищутся русские названия
async function findCity(name: string): Promise<Place | undefined> {
	const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=ru`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`geocoding-api.open-meteo.com: HTTP ${response.status}`);
	}
	const data = (await response.json()) as GeocodingResponse;
	return data.results?.[0];
}

// Погода по координатам (ветер сразу в м/с)
async function getWeather(latitude: number, longitude: number): Promise<Weather> {
	const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m&wind_speed_unit=ms`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`api.open-meteo.com: HTTP ${response.status}`);
	}
	return (await response.json()) as Weather;
}

// Курсы валют: открытый API open.er-api.com (один рыночный курс, без покупки/продажи)
async function getRates(): Promise<Rates> {
	const response = await fetch("https://open.er-api.com/v6/latest/KZT");
	if (!response.ok) {
		throw new Error(`open.er-api.com: HTTP ${response.status}`);
	}
	const data = (await response.json()) as Rates;
	if (data.result !== "success") {
		throw new Error("open.er-api.com: bad response");
	}
	return data;
}

// Краткая справка о стране из Википедии на выбранном языке
async function getCountry(name: string, language: Language): Promise<WikiSummary | undefined> {
	// в адресах Википедии пробелы заменяются на _ ("Южная Корея" -> "Южная_Корея")
	const title = encodeURIComponent(name.trim().replace(/\s+/g, "_"));
	const response = await fetch(
		`https://${language}.wikipedia.org/api/rest_v1/page/summary/${title}`,
		{
			headers: { "User-Agent": "PromiseBot/1.0 (educational Telegram bot)" },
		},
	);
	if (response.status === 404) {
		return undefined; // статьи с таким названием нет — это не ошибка, просто «не нашли»
	}
	if (!response.ok) {
		throw new Error(`${language}.wikipedia.org: HTTP ${response.status}`);
	}
	return (await response.json()) as WikiSummary;
}

// Названия на разных языках разные ("Япония", "Жапония", "Japan"), поэтому если в разделе
// выбранного языка статьи нет, ищем в остальных
async function findCountry(name: string, language: Language): Promise<WikiSummary | undefined> {
	const others: Language[] = ["ru", "en", "kk"];
	for (const wiki of new Set([language, ...others])) {
		const summary = await getCountry(name, wiki);
		if (summary !== undefined) {
			return summary;
		}
	}
	return undefined;
}

// ---------- Тексты ответов ----------

function ratesText(t: Texts, rates: Rates): string {
	const lines = [t.ratesDate(rates.time_last_update_utc), t.ratesUnit, ""];
	for (const [code, title] of Object.entries(t.currencies)) {
		const name = `${title} (${code})`;
		const perTenge = rates.rates[code];
		if (perTenge === undefined) {
			lines.push(`${name.padEnd(16)}${t.noRate}`);
			continue;
		}
		lines.push(`${name.padEnd(16)}${(1 / perTenge).toFixed(2)} ₸`);
	}
	return `💱 <pre>${escapeHtml(lines.join("\n"))}</pre>`; // <pre> — моноширинный шрифт, таблица ровная
}

function countryText(t: Texts, country: WikiSummary): string {
	if (country.type === "disambiguation") {
		return t.countryAmbiguous;
	}
	const maxLength = 700;
	const extract =
		country.extract.length > maxLength
			? `${country.extract.slice(0, maxLength)}…`
			: country.extract;
	const link = country.content_urls?.desktop?.page;
	const head = `🌍 <b>${escapeHtml(country.title)}</b>`;
	const description = country.description ? `\n<i>${escapeHtml(country.description)}</i>` : "";
	const more = link ? `\n\n<a href="${escapeHtml(link)}">${t.readMore}</a>` : "";
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
async function raceText(t: Texts): Promise<string> {
	const runners = [
		timed(`open-meteo.com (${t.raceWeather})`, () => getWeather(43.24, 76.89)), // для замера — Алматы
		timed(`open.er-api.com (${t.raceRates})`, getRates),
		timed(`ru.wikipedia.org (${t.raceCountries})`, () => getCountry("Казахстан", "ru")),
	];

	const winner = await Promise.race(runners); // первый завершившийся
	const all = await Promise.allSettled(runners); // дожидаемся остальных для таблицы

	const lines = [t.raceWinner(winner.name, winner.ms), "", t.raceAll];
	for (const result of all) {
		if (result.status === "fulfilled") {
			const timing = result.value;
			lines.push(`${timing.ok ? "✅" : "❌"} ${timing.name} — ${timing.ms} ${t.ms}`);
		}
	}
	return `⚡ <b>Promise.race</b> — ${t.raceTitle}\n\n${escapeHtml(lines.join("\n"))}`;
}

// ---------- Команды города и погоды ----------

// /city Астана — проверяет, что такой город есть, и запоминает его
async function setCity(
	token: string,
	kv: KVNamespace,
	chatId: number,
	language: Language,
	city: string,
): Promise<void> {
	const t = texts[language];
	if (city === "") {
		await send(token, chatId, t.cityPrompt, backKeyboard(t));
		return;
	}
	if ((await findCity(city)) === undefined) {
		await send(token, chatId, t.cityNotFound, backKeyboard(t));
		return;
	}
	await updateSettings(kv, chatId, { city });
	await send(token, chatId, t.citySaved(escapeHtml(city)), backKeyboard(t));
}

// Погода в городе, который этот чат сохранил через /city
async function sendWeather(
	token: string,
	kv: KVNamespace,
	chatId: number,
	language: Language,
): Promise<void> {
	const t = texts[language];
	const { city } = await loadSettings(kv, chatId);
	if (city === undefined) {
		await send(token, chatId, t.cityPrompt, backKeyboard(t));
		return;
	}
	const place = await findCity(city);
	if (place === undefined) {
		await send(token, chatId, t.cityNotFound, backKeyboard(t));
		return;
	}
	const weather = await getWeather(place.latitude, place.longitude);
	// поиск возвращает русское название; на других языках показываем так, как написал пользователь
	const title = escapeHtml(language === "ru" ? place.name : city);
	const { temperature_2m, wind_speed_10m } = weather.current;
	await send(token, chatId, t.weather(title, temperature_2m, wind_speed_10m), backKeyboard(t));
}

// ---------- Команды профиля ----------

// /name Аружан
async function setName(
	token: string,
	kv: KVNamespace,
	chatId: number,
	language: Language,
	name: string,
): Promise<void> {
	const t = texts[language];
	if (!isName(name)) {
		await send(token, chatId, t.namePrompt, backKeyboard(t));
		return;
	}
	await updateSettings(kv, chatId, { name });
	await send(token, chatId, t.nameSaved(escapeHtml(name)), backKeyboard(t));
}

// /language kk
async function setLanguage(
	token: string,
	kv: KVNamespace,
	chatId: number,
	current: Language,
	value: string,
): Promise<void> {
	const language = value.toLowerCase();
	if (!isLanguage(language)) {
		const t = texts[current];
		await send(token, chatId, t.languagePrompt, backKeyboard(t));
		return;
	}
	await updateSettings(kv, chatId, { language });
	// отвечаем уже на новом языке
	const t = texts[language];
	await send(token, chatId, t.languageSaved, backKeyboard(t));
}

// /age 20
async function setAge(
	token: string,
	kv: KVNamespace,
	chatId: number,
	language: Language,
	value: string,
): Promise<void> {
	const t = texts[language];
	// только цифры: Number() принял бы и "2e1", и "0x14"
	const age = /^\d+$/.test(value) ? Number(value) : undefined;
	if (!isAge(age)) {
		await send(token, chatId, t.agePrompt, backKeyboard(t));
		return;
	}
	await updateSettings(kv, chatId, { age });
	await send(token, chatId, t.ageSaved(age), backKeyboard(t));
}

// /country Япония — проверяет, что в Википедии есть такая статья, и запоминает
async function setCountry(
	token: string,
	kv: KVNamespace,
	chatId: number,
	language: Language,
	country: string,
): Promise<void> {
	const t = texts[language];
	if (!isText(country)) {
		await send(token, chatId, t.myCountryPrompt, backKeyboard(t));
		return;
	}
	const summary = await findCountry(country, language);
	if (summary === undefined || summary.type === "disambiguation") {
		await send(token, chatId, t.countryNotFound, backKeyboard(t));
		return;
	}
	await updateSettings(kv, chatId, { country });
	await send(token, chatId, t.countrySaved(escapeHtml(country)), backKeyboard(t));
}

// /mycountry — справка о сохранённой стране
async function sendMyCountry(
	token: string,
	kv: KVNamespace,
	chatId: number,
	language: Language,
): Promise<void> {
	const t = texts[language];
	const { country } = await loadSettings(kv, chatId);
	if (country === undefined) {
		await send(token, chatId, t.myCountryPrompt, backKeyboard(t));
		return;
	}
	const summary = await findCountry(country, language);
	const answer = summary === undefined ? t.countryNotFound : countryText(t, summary);
	await send(token, chatId, answer, backKeyboard(t));
}

// /profile — всё, что бот запомнил об этом чате
async function sendProfile(
	token: string,
	kv: KVNamespace,
	chatId: number,
	language: Language,
): Promise<void> {
	const t = texts[language];
	const settings = await loadSettings(kv, chatId);
	const line = (title: string, value: string | number | undefined, command: string) =>
		`${title}: ${value === undefined ? t.notSet(command) : escapeHtml(String(value))}`;
	const savedLanguage = settings.language && texts[settings.language].languageName;
	const text = [
		`<b>${t.profileTitle}</b>`,
		line(t.profileName, settings.name, "/name"),
		line(t.profileLanguage, savedLanguage, "/language"),
		line(t.profileAge, settings.age, "/age"),
		line(t.profileCountry, settings.country, "/country"),
		line(t.profileCity, settings.city, "/city"),
	].join("\n");
	await send(token, chatId, text, backKeyboard(t));
}

// Главное меню с приветствием
async function sendMenu(
	token: string,
	kv: KVNamespace,
	chatId: number,
	language: Language,
): Promise<void> {
	const t = texts[language];
	// если KV не отвечает, меню всё равно открывается, только без имени
	const { name } = await loadSettings(kv, chatId).catch((error: unknown): ChatSettings => {
		console.error(error);
		return {};
	});
	const hello = t.greeting(name === undefined ? undefined : escapeHtml(name));
	await send(token, chatId, hello, menuKeyboard(t));
}

// ---------- Обработка нажатий и сообщений ----------

// Реакция на нажатие кнопки: data — это callback_data нажатой кнопки
async function handleButton(
	token: string,
	kv: KVNamespace,
	chatId: number,
	language: Language,
	data: string,
): Promise<void> {
	const t = texts[language];
	switch (data) {
		case "menu":
			await sendMenu(token, kv, chatId, language);
			break;
		case "weather":
			await sendWeather(token, kv, chatId, language);
			break;
		case "rates":
			await send(token, chatId, ratesText(t, await getRates()), backKeyboard(t));
			break;
		case "race":
			await send(token, chatId, await raceText(t), backKeyboard(t));
			break;
		case "country":
			// force_reply открывает у пользователя ответ на это сообщение; ответ узнаём по тексту
			await telegram(token, "sendMessage", {
				chat_id: chatId,
				text: t.countryQuestion,
				reply_markup: { force_reply: true, input_field_placeholder: t.countryPlaceholder },
			});
			break;
		default:
			await send(token, chatId, t.unknownButton, backKeyboard(t));
	}
}

// Реакция на обычное текстовое сообщение
async function handleText(
	token: string,
	kv: KVNamespace,
	chatId: number,
	language: Language,
	text: string,
	repliedTo: string | undefined,
): Promise<void> {
	const t = texts[language];
	if (text.startsWith("/")) {
		// "/city@имя_бота Нью Йорк" -> команда "/city", остальное "Нью Йорк"
		const [first = "", ...rest] = text.trim().split(/\s+/);
		const command = first.split("@")[0];
		const value = rest.join(" ");
		switch (command) {
			case "/city":
				await setCity(token, kv, chatId, language, value);
				break;
			case "/weather":
				await sendWeather(token, kv, chatId, language);
				break;
			case "/name":
				await setName(token, kv, chatId, language, value);
				break;
			case "/language":
				await setLanguage(token, kv, chatId, language, value);
				break;
			case "/age":
				await setAge(token, kv, chatId, language, value);
				break;
			case "/country":
				await setCountry(token, kv, chatId, language, value);
				break;
			case "/mycountry":
				await sendMyCountry(token, kv, chatId, language);
				break;
			case "/profile":
				await sendProfile(token, kv, chatId, language);
				break;
			default:
				await sendMenu(token, kv, chatId, language); // /start, /menu и любая другая команда
		}
		return;
	}
	// вопрос о стране мог быть задан до смены языка, поэтому сверяем со всеми
	if (Object.values(texts).some((other) => other.countryQuestion === repliedTo)) {
		const country = await findCountry(text, language);
		const answer = country === undefined ? t.countryNotFound : countryText(t, country);
		await send(token, chatId, answer, countryKeyboard(t));
		return;
	}
	await sendMenu(token, kv, chatId, language);
}

// Выполняет действие на языке чата; при ошибке сообщает о ней, а бот продолжает работать
async function run(
	token: string,
	kv: KVNamespace,
	chatId: number,
	action: (language: Language) => Promise<void>,
): Promise<void> {
	const language = await loadLanguage(kv, chatId);
	try {
		await action(language);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		console.error(reason);
		const t = texts[language];
		await send(token, chatId, t.failed(escapeHtml(reason)), backKeyboard(t));
	}
}

// Разбирает одно обновление от Telegram: нажатие кнопки или текст
export async function handleUpdate(token: string, kv: KVNamespace, update: Update): Promise<void> {
	const query = update.callback_query;
	if (query !== undefined) {
		const chatId = query.message?.chat.id;
		// убирает «часики» на кнопке
		await telegram(token, "answerCallbackQuery", { callback_query_id: query.id });
		if (chatId !== undefined && query.data !== undefined) {
			const data = query.data;
			await run(token, kv, chatId, (language) => handleButton(token, kv, chatId, language, data));
		}
		return;
	}

	const message = update.message;
	if (message?.text !== undefined) {
		const text = message.text;
		const repliedTo = message.reply_to_message?.text;
		const chatId = message.chat.id;
		await run(token, kv, chatId, (language) =>
			handleText(token, kv, chatId, language, text, repliedTo),
		);
	}
}
