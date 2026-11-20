import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Guard Next.js; di test cukup modul kosong supaya lib server bisa diimpor.
      "server-only": fileURLToPath(new URL("./src/lib/__tests__/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "print-agent/**/*.test.ts"],
    environment: "node",
    globalSetup: ["src/lib/__tests__/support/global-setup.ts"],
    // Path sqlite relatif ke folder prisma → prisma/data/test.db (terpisah dari DB dev).
    env: { DATABASE_URL: "file:./data/test.db", NODE_ENV: "test", REDIS_URL: "" },
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
