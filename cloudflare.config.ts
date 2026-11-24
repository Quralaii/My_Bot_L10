import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "my-bot",
		compatibilityDate: "2026-11-19",
		entrypoint,
		env: {
			// Секреты задаются в dash.cloudflare.com (или `npx cf workers secrets`), в репозиторий не попадают
			BOT_TOKEN: bindings.secret(),
			WEBHOOK_SECRET: bindings.secret(),
		},
	},
});
