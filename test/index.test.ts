import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { expect, it } from "vite-plus/test";

it("answers on the root path", async () => {
	const response = await SELF.fetch("https://example.com/");
	expect(response.status).toBe(200);
});

it("rejects GET on the webhook", async () => {
	const response = await SELF.fetch("https://example.com/telegram");
	expect(response.status).toBe(405);
});

it("rejects webhook calls without the secret token", async () => {
	const response = await SELF.fetch("https://example.com/telegram", {
		method: "POST",
		body: JSON.stringify({ update_id: 1 }),
	});
	expect(response.status).toBe(403);
});

it("accepts webhook calls with the right secret token", async () => {
	// update без message и callback_query: бот ничего не делает и в Telegram не ходит
	const response = await SELF.fetch("https://example.com/telegram", {
		method: "POST",
		headers: { "X-Telegram-Bot-Api-Secret-Token": env.WEBHOOK_SECRET },
		body: JSON.stringify({ update_id: 1 }),
	});
	expect(response.status).toBe(200);
});
