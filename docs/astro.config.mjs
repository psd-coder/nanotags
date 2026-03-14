// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import postcssPresetEnv from "postcss-preset-env";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";

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
  markdown: {
    shikiConfig: {
      themes: { light: "catppuccin-latte", dark: "catppuccin-mocha" },
    },
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, {
        behavior: "prepend",
        properties: { className: ["anchor"], ariaHidden: true, tabIndex: -1 },
        content: [],
      }],
    ]
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Martian Grotesk",
      cssVariable: "--font-sans",
      options: {
        variants: [
          {
            weight: "100 900",
            style: "normal",
            src: ["./src/assets/fonts/MartianGrotesk-VF.woff2"],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Martian Mono",
      cssVariable: "--font-mono",
      options: {
        variants: [
          {
            weight: 400,
            style: "normal",
            src: ["./src/assets/fonts/MartianMono-Regular.woff2"],
          },
        ],
      },
    },
  ],
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
