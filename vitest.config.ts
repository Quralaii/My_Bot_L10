import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vite-plus";

export default defineConfig({
	plugins: [
		cloudflareTest({
			config: true,
			// Тестовые значения секретов; настоящие хранятся только в Cloudflare
			miniflare: { bindings: { BOT_TOKEN: "test-token", WEBHOOK_SECRET: "test-secret" } },
		}),
	],
});
