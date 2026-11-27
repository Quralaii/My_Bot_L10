import { env } from "cloudflare:workers";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { handleUpdate } from "../src/bot.ts";
import { texts } from "../src/texts.ts";

interface SentMessage {
	text: string;
	reply_markup?: {
		force_reply?: boolean;
		inline_keyboard?: { text: string; callback_data: string }[][];
	};
}

// Сообщения, которые бот отправил в Telegram за время теста
let sent: SentMessage[] = [];

// Подменяем fetch: тесты не ходят ни в Telegram, ни в Википедию
beforeEach(() => {
	sent = [];
	vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
		const url = new URL(input);
		if (url.hostname === "api.telegram.org") {
			if (url.pathname.endsWith("/sendMessage")) {
				sent.push(JSON.parse(init?.body as string) as SentMessage);
			}
			return Response.json({ ok: true, result: {} });
		}
		if (url.hostname === "ru.wikipedia.org") {
			return Response.json({ type: "standard", title: "Япония", extract: "Государство в Азии." });
		}
		throw new Error(`Неожиданный запрос: ${input}`);
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function press(chatId: number, data: string): Promise<void> {
	return handleUpdate("test-token", env.CITY_KV, {
		update_id: 1,
		callback_query: { id: "q", data, message: { chat: { id: chatId } } },
	});
}

// Ответ пользователя на последний вопрос бота
function reply(chatId: number, text: string): Promise<void> {
	const question = sent.at(-1)?.text ?? "";
	return handleUpdate("test-token", env.CITY_KV, {
		update_id: 2,
		message: { chat: { id: chatId }, text, reply_to_message: { text: question } },
	});
}

const buttons = (message: SentMessage | undefined) =>
	message?.reply_markup?.inline_keyboard?.flat().map((button) => button.callback_data);

it("shows the menu buttons in order", async () => {
	await press(101, "menu");
	expect(buttons(sent[0])).toEqual([
		"name",
		"language",
		"age",
		"mycountry",
		"rates",
		"weather",
		"race",
		"country",
		"profile",
	]);
});

it.each(["ru", "kk", "en"] as const)("has a handler for every menu button in %s", async (code) => {
	await env.CITY_KV.put("102", JSON.stringify({ language: code }));
	await press(102, "menu");
	// кнопки, которым не нужны внешние сервисы
	const own = ["name", "language", "age", "mycountry", "profile"];
	expect(buttons(sent[0])).toEqual(expect.arrayContaining(own));
	for (const data of own) {
		await press(102, data);
	}
	expect(sent).toHaveLength(1 + own.length);
	expect(sent.map((message) => message.text)).not.toContain(texts[code].unknownButton);
});

it("saves the name and age typed after pressing the buttons", async () => {
	await press(103, "name");
	expect(sent.at(-1)?.reply_markup?.force_reply).toBe(true);
	await reply(103, "  Аружан ");
	await press(103, "age");
	await reply(103, "20");
	expect(await env.CITY_KV.get("103", "json")).toEqual({ name: "Аружан", age: 20 });
});

it("does not save a wrong age typed after pressing the button", async () => {
	await press(104, "age");
	await reply(104, "двадцать");
	expect(await env.CITY_KV.get("104")).toBeNull();
	expect(sent.at(-1)?.text).toBe(texts.ru.agePrompt);
});

it("changes the language by button", async () => {
	await press(105, "language");
	expect(buttons(sent[0])).toEqual(["lang:ru", "lang:kk", "lang:en", "menu"]);
	await press(105, "lang:kk");
	expect(await env.CITY_KV.get("105", "json")).toEqual({ language: "kk" });
	expect(sent[1]?.text).toBe(texts.kk.languageSaved);
});

it("asks for my country, then shows it and lets change it", async () => {
	await press(106, "mycountry");
	expect(sent[0]?.text).toBe(texts.ru.myCountryQuestion);
	await reply(106, "Япония");
	expect(await env.CITY_KV.get("106", "json")).toEqual({ country: "Япония" });
	await press(106, "mycountry");
	expect(sent[2]?.text).toContain("<b>Япония</b>");
	expect(buttons(sent[2])).toEqual(["changecountry", "menu"]);
	await press(106, "changecountry");
	expect(sent[3]?.text).toBe(texts.ru.myCountryQuestion);
});

it("shows the profile by button", async () => {
	await press(107, "profile");
	expect(sent[0]?.text).toContain(texts.ru.profileTitle);
});

it("keeps every question text unique", () => {
	const questions = Object.values(texts).flatMap((t) => [
		t.countryQuestion,
		t.nameQuestion,
		t.ageQuestion,
		t.myCountryQuestion,
	]);
	expect(new Set(questions).size).toBe(questions.length);
});
