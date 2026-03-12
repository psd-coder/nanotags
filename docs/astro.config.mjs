// @ts-check
import { defineConfig } from "astro/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import postcssPresetEnv from "postcss-preset-env";

const srcPath = new URL("../src", import.meta.url).pathname;

function moduleReferencePlugin(moduleName, srcEntry, distEntry) {
  return {
    name: `nano-wc-${moduleName}`,
    enforce: "pre",
    resolveId(id) {
      if (id === `${moduleName}?url`) return `\0${moduleName}-url`;
      if (id === moduleName) return srcEntry;
    },
    load(id) {
      if (id !== `\0${moduleName}-url`) return;
      // Embed as data URI so the srcdoc iframe can load it
      // without cross-origin or filesystem constraints.
      const src = readFileSync(distEntry, "utf-8");
      const dataUri = `data:text/javascript;charset=utf-8,${encodeURIComponent(src)}`;
      return `export default ${JSON.stringify(dataUri)};`;
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: "https://psd-coder.github.io",
  base: process.env.CI ? "/nano-wc/" : "/",
  vite: {
    css: {
      modules: {
        generateScopedName(name, filename) {
          const dir = path.basename(path.dirname(filename));
          const hash = createHash("sha256")
            .update(`${filename}:${name}`)
            .digest("hex")
            .slice(0, 5);

          return `${dir}__${name}_${hash}`;
        },
      },
      postcss: {
        plugins: [
          postcssPresetEnv({
            stage: 3,
            features: {
              'nesting-rules': true,
              'custom-media-queries': true,
              'media-query-ranges': true,
            },
          })
        ]
      }
    },
    plugins: [
      moduleReferencePlugin(
        "nano-wc",
        `${srcPath}/index.ts`,
        "../dist/index.mjs",
      ),
      moduleReferencePlugin(
        "nano-wc/render",
        `${srcPath}/render.ts`,
        "../dist/render.mjs",
      ),
    ],
  },
});
