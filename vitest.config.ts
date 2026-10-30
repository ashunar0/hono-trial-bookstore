import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each test file gets its own empty database, with the same migrations as production
    env: {
      DATABASE_URL: ":memory:",
      BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
      BETTER_AUTH_URL: "http://localhost",
    },
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
