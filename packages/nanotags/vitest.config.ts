import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["tests/**"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "happy-dom",
          environment: "happy-dom",
          // Once is enough: the jsdom project runs a subset of the same files.
          typecheck: { enabled: true, tsconfig: "./tsconfig.test.json" },
        },
      },
      // The testing entry exists to smooth over how DOM implementations report errors from custom
      // element reactions, and happy-dom alone never takes jsdom's path.
      {
        extends: true,
        test: { name: "jsdom", environment: "jsdom", include: ["src/testing.test.ts"] },
      },
    ],
  },
});
