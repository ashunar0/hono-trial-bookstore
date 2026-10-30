import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Apply the same migrations as production to the test D1
const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
          BETTER_AUTH_URL: "http://localhost",
        },
      },
    }),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
