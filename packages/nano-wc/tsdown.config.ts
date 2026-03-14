import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/render.ts"],
  format: "esm",
  dts: true,
});
