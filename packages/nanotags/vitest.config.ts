import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["tests/**"],
    },
    typecheck: {
      enabled: true,
      tsconfig: "./tsconfig.test.json",
    },
    projects: [
      { extends: true, test: { name: "happy-dom", environment: "happy-dom" } },
      // The testing entry exists to smooth over how DOM implementations report errors from custom
      // element reactions, and happy-dom alone never takes jsdom's path.
      {
        extends: true,
        test: { name: "jsdom", environment: "jsdom", include: ["src/testing.test.ts"] },
      },
    ],
  },
});
