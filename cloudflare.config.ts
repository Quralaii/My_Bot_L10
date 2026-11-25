import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "my-bot",
		compatibilityDate: "2026-11-19",
		entrypoint,
		// Логи и трейсы, включённые в дашборде, нужно держать и в конфиге,
		// иначе следующий деплой их отключит
		observability: {
			enabled: true,
			headSamplingRate: 1,
			logs: { enabled: true, invocationLogs: true },
			traces: { enabled: true, headSamplingRate: 1 },
		},
		env: {
			// Секреты задаются в dash.cloudflare.com (или `npx cf workers secrets`), в репозиторий не попадают
			BOT_TOKEN: bindings.secret(),
			WEBHOOK_SECRET: bindings.secret(),
		},
	},
});
