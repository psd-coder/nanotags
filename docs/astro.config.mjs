// @ts-check
import { defineConfig } from "astro/config";
import { readFileSync } from "node:fs";

const nanoWcPath = new URL("../dist/index.mjs", import.meta.url).pathname;

// https://astro.build/config
export default defineConfig({
  site: "https://psd-coder.github.io",
  base: process.env.CI ? "/nano-wc/" : "/",
  vite: {
    resolve: {
      alias: {
        "nano-wc": new URL("../src", import.meta.url).pathname,
      },
    },
    plugins: [
      {
        name: "nano-wc-playground-url",
        enforce: /** @type {'pre'} */ ("pre"),
        resolveId(id) {
          if (id === "nano-wc?url") return "\0nano-wc-url";
        },
        load(id) {
          if (id !== "\0nano-wc-url") return;
          // Embed nano-wc as a data URI so the srcdoc iframe can load it
          // without cross-origin or filesystem constraints.
          const src = readFileSync(nanoWcPath, "utf-8");
          const dataUri = `data:text/javascript;charset=utf-8,${encodeURIComponent(src)}`;
          return `export default ${JSON.stringify(dataUri)};`;
        },
      },
    ],
  },
});
