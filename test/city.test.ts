import { env } from "cloudflare:workers";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { handleUpdate, type Update } from "../src/bot.ts";

// Тексты, которые бот отправил в Telegram за время теста
let sent: string[] = [];

// Подменяем fetch: тесты не ходят ни в Telegram, ни в Open-Meteo
beforeEach(() => {
	sent = [];
	vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
		const url = new URL(input);
		if (url.hostname === "api.telegram.org") {
			sent.push((JSON.parse(init?.body as string) as { text: string }).text);
			return Response.json({ ok: true, result: {} });
		}
		if (url.hostname === "geocoding-api.open-meteo.com") {
			return url.searchParams.get("name") === "Астана"
				? Response.json({ results: [{ name: "Астана", latitude: 51.18, longitude: 71.45 }] })
				: Response.json({});
		}
		if (url.hostname.endsWith(".wikipedia.org")) {
			const title = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
			const known: Record<string, string> = {
				"ru.wikipedia.org": "Япония",
				"kk.wikipedia.org": "Жапония",
				"en.wikipedia.org": "Japan",
			};
			return known[url.hostname] === title
				? Response.json({ type: "standard", title, extract: "Asia" })
				: new Response("", { status: 404 });
		}
		if (url.hostname === "api.open-meteo.com" && url.searchParams.get("latitude") === "51.18") {
			return Response.json({ current: { time: "", temperature_2m: -7, wind_speed_10m: 4 } });
		}
		throw new Error(`Неожиданный запрос: ${input}`);
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function say(chatId: number, text: string): Promise<void> {
	const update: Update = { update_id: 1, message: { chat: { id: chatId }, text } };
	return handleUpdate("test-token", env.CITY_KV, update);
}

it("saves the city under the chat id as ChatSettings JSON", async () => {
	await say(1, "/city Астана");
	expect(await env.CITY_KV.get("1")).toBe('{"city":"Астана"}');
	expect(sent).toEqual(["Запомнил город: Астана"]);
});

it("accepts /city with the bot name", async () => {
	await say(2, "/city@my_bot  Астана ");
	expect(await env.CITY_KV.get("2", "json")).toEqual({ city: "Астана" });
});

it("asks for a city when /city has no name", async () => {
	await say(3, "/city");
	expect(await env.CITY_KV.get("3")).toBeNull();
	expect(sent).toEqual(["Напиши /city и свой город"]);
});

it("keeps the old city when the new one is not found", async () => {
	await say(4, "/city Астана");
	await say(4, "/city Абракадабра");
	expect(await env.CITY_KV.get("4", "json")).toEqual({ city: "Астана" });
	expect(sent[1]).toContain("Такой город не нашёл");
});

it("asks for a city when the weather is requested without one", async () => {
	await say(5, "/weather");
	expect(sent).toEqual(["Напиши /city и свой город"]);
});

it.each([
	["no city field", '{"town":"Астана"}'],
	["plain text", "Астана"],
	["broken JSON", '{"city":'],
	["empty value", ""],
	["JSON null", "null"],
	["a number", "42"],
	["a string", '"Астана"'],
	["a list", '["Астана"]'],
	["city is a number", '{"city":123}'],
	["city is null", '{"city":null}'],
	["city is empty", '{"city":""}'],
	["city is blank", '{"city":"   "}'],
])("asks for a city when KV holds %s", async (_name, stored) => {
	await env.CITY_KV.put("7", stored);
	await say(7, "/weather");
	expect(sent).toEqual(["Напиши /city и свой город"]);
	expect(await env.CITY_KV.get("7")).toBe(stored); // чтение запись не трогает
});

it("repairs a bad value with /city", async () => {
	await env.CITY_KV.put("8", '{"town":"Астана"}');
	await say(8, "/city Астана");
	await say(8, "/weather");
	expect(sent).toEqual(["Запомнил город: Астана", "🌤 Астана: сейчас -7 °C, ветер 4 м/с"]);
});

it("reports a KV failure instead of asking for a city", async () => {
	const brokenKv = {
		get: () => Promise.reject(new Error("KV недоступен")),
	} as unknown as KVNamespace;
	await handleUpdate("test-token", brokenKv, {
		update_id: 3,
		message: { chat: { id: 9 }, text: "/weather" },
	});
	expect(sent).toEqual(["Не получилось: KV недоступен"]);
});

it("shows the weather for the saved city by command and by button", async () => {
	await say(6, "/city Астана");
	await say(6, "/weather");
	await handleUpdate("test-token", env.CITY_KV, {
		update_id: 2,
		callback_query: { id: "q", data: "weather", message: { chat: { id: 6 } } },
	});
	// answerCallbackQuery идёт без текста, поэтому берём только сообщения
	const weather = sent.filter((text) => text?.startsWith("🌤"));
	expect(weather).toEqual([
		"🌤 Астана: сейчас -7 °C, ветер 4 м/с",
		"🌤 Астана: сейчас -7 °C, ветер 4 м/с",
	]);
});

// ---------- Профиль: name, language, age, country ----------

const stored = (chatId: number) => env.CITY_KV.get(String(chatId), "json");

it("keeps the other fields when one is changed", async () => {
	await say(20, "/city Астана");
	await say(20, "/name Аружан");
	await say(20, "/language KK");
	await say(20, "/age 20");
	await say(20, "/country Япония");
	await say(20, "/age 21");
	expect(await stored(20)).toEqual({
		city: "Астана",
		name: "Аружан",
		language: "kk",
		age: 21,
		country: "Япония",
	});
	expect(sent[2]).toBe("Тіл сақталды: қазақ тілі");
});

it.each([
	"/name",
	`/name ${"а".repeat(51)}`,
	"/language",
	"/language de",
	"/language toString",
	"/age",
	"/age двадцать",
	"/age 0",
	"/age 121",
	"/age 20.5",
	"/age 2e1",
	"/country",
	"/country Абракадабра",
])("saves nothing for %s", async (command) => {
	await env.CITY_KV.put("21", '{"city":"Астана"}');
	await say(21, command);
	expect(await env.CITY_KV.get("21")).toBe('{"city":"Астана"}');
	expect(sent).toHaveLength(1);
	expect(sent[0]).not.toContain("Запомнил");
});

it("keeps good fields when other stored fields are bad", async () => {
	await env.CITY_KV.put("22", '{"city":"Астана","age":"двадцать","language":"de","name":""}');
	await say(22, "/weather");
	expect(sent).toEqual(["🌤 Астана: сейчас -7 °C, ветер 4 м/с"]);
});

it("shows the profile and marks missing fields", async () => {
	await say(23, "/name <Аружан>");
	await say(23, "/profile");
	expect(sent[1]).toBe(
		[
			"<b>Ваш профиль</b>",
			"Имя: &lt;Аружан&gt;",
			"Язык: не указано (/language)",
			"Возраст: не указано (/age)",
			"Страна: не указано (/country)",
			"Город для погоды: не указано (/city)",
		].join("\n"),
	);
});

it("greets by name in the menu", async () => {
	await say(24, "/start");
	await say(24, "/name Аружан");
	await say(24, "/start");
	expect(sent[0]).toMatch(/^Привет! 👋/);
	expect(sent[2]).toMatch(/^Привет, Аружан! 👋/);
});

it("shows the saved country or asks for one", async () => {
	await say(25, "/mycountry");
	await say(25, "/country Япония");
	await say(25, "/mycountry");
	expect(sent[0]).toBe("Напиши /country и свою страну");
	expect(sent[2]).toContain("<b>Япония</b>");
});

// ---------- Переводы ----------

it.each([
	["ru", "Запомнил язык: русский", "Напиши /city и свой город"],
	["kk", "Тіл сақталды: қазақ тілі", "/city командасын және қалаңды жаз"],
	["en", "Language saved: English", "Type /city and your city"],
])("answers in %s after /language", async (language, saved, prompt) => {
	await env.CITY_KV.delete("30");
	await say(30, `/language ${language}`);
	await say(30, "/weather");
	expect(sent).toEqual([saved, prompt]);
});

it.each([
	["kk", "🌤 Астана: қазір -7 °C, жел 4 м/с", "Сіздің профиліңіз", "Тіл: қазақ тілі"],
	["en", "🌤 Астана: now -7 °C, wind 4 m/s", "Your profile", "Language: English"],
])("shows weather and profile in %s", async (language, weather, title, languageLine) => {
	await say(31, "/city Астана");
	await say(31, `/language ${language}`);
	await say(31, "/weather");
	await say(31, "/profile");
	expect(sent[2]).toBe(weather);
	expect(sent[3]).toContain(title);
	expect(sent[3]).toContain(languageLine);
});

it("translates the menu buttons", async () => {
	const keyboards: string[] = [];
	const stub = globalThis.fetch;
	vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
		keyboards.push(init?.body as string);
		return stub(input, init);
	});
	await env.CITY_KV.put("32", '{"language":"en"}');
	await say(32, "/start");
	expect(sent[0]).toMatch(/^Hi! 👋/);
	expect(keyboards[0]).toContain("🌤 Weather");
});

it("understands a reply to the country question asked in another language", async () => {
	await env.CITY_KV.put("33", '{"language":"kk"}');
	await handleUpdate("test-token", env.CITY_KV, {
		update_id: 4,
		message: {
			chat: { id: 33 },
			text: "Япония",
			reply_to_message: { text: "🌍 Напишите название страны, например: Казахстан" },
		},
	});
	// в казахской Википедии статьи «Япония» нет (заглушка), поэтому берётся русская
	expect(sent[0]).toContain("<b>Япония</b>");
	expect(sent[0]).not.toContain("Орындалмады");
});

it("takes the country article from the Wikipedia of the chosen language", async () => {
	await say(34, "/language en");
	await say(34, "/country Japan");
	await say(34, "/mycountry");
	expect(sent[1]).toBe("Country saved: Japan");
	expect(sent[2]).toContain("<b>Japan</b>");
});
