import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/render.ts", "src/context.ts", "src/testing.ts"],
  format: "esm",
  dts: true,
});
