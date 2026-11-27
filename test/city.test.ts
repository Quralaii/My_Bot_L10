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
