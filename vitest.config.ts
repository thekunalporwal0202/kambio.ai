import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

// Load .env into the test environment so the integration tests can reach
// Postgres. Without a reachable DATABASE_URL they skip themselves.
const fileEnv = loadEnv("test", process.cwd(), "");

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: fileEnv,
    // Integration tests share one database; run files serially to keep the
    // ledger assertions deterministic.
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` is a build-time guard that Next resolves. Vitest runs on
      // the server by definition, so it is a no-op here.
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
});
