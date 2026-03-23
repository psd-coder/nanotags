// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import { createHash } from "node:crypto";
import path from "node:path";
import sitemap from "@astrojs/sitemap";
import postcssPresetEnv from "postcss-preset-env";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";

/** Fixes heading anchor links broken by <base href="/">: rewrites #fragment → slug#fragment */
function rehypeFixBaseAnchors() {
  return (tree, file) => {
    const match = file.history[0]?.match(/\/content\/docs\/(.+)\.md$/);
    if (!match || match[1] === "index") return;

    const slug = match[1];
    (function walk(node) {
      if (
        node.tagName === "a" &&
        node.properties?.className?.includes("anchor") &&
        typeof node.properties.href === "string" &&
        node.properties.href.startsWith("#")
      ) {
        node.properties.href = `${slug}${node.properties.href}`;
      }
      if (node.children) node.children.forEach(walk);
    })(tree);
  };
}

const nanoWcRoot = new URL("../../packages/nano-wc", import.meta.url).pathname;

// https://astro.build/config
export default defineConfig({
  site: "https://psd-coder.github.io",
  base: process.env.CI ? "/nano-wc/" : "/",
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      themes: { light: "catppuccin-latte", dark: "catppuccin-mocha" },
    },
    rehypePlugins: [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: "prepend",
          properties: { className: ["anchor"], ariaHidden: true, tabIndex: -1 },
          content: [],
        },
      ],
      rehypeFixBaseAnchors,
    ],
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
    optimizeDeps: {
      entries: ["!src/content/examples/**"],
    },
    css: {
      modules: {
        generateScopedName(name, filename) {
          const dir = path.basename(path.dirname(filename));
          const hash = createHash("sha256").update(`${filename}:${name}`).digest("hex").slice(0, 5);

          return `${dir}__${name}_${hash}`;
        },
      },
      postcss: {
        plugins: [
          postcssPresetEnv({
            stage: 3,
            features: {
              "nesting-rules": true,
              "custom-media-queries": true,
              "media-query-ranges": true,
            },
          }),
        ],
      },
    },
    plugins: [
      {
        name: "nano-wc-source",
        enforce: "pre",
        resolveId(id) {
          if (id === "nano-wc") return `${nanoWcRoot}/src/index.ts`;
          if (id.startsWith("nano-wc/"))
            return `${nanoWcRoot}/src/${id.slice("nano-wc/".length)}.ts`;
          if (id.startsWith("nano-wc:dist/"))
            return `${nanoWcRoot}/dist/${id.slice("nano-wc:dist/".length)}`;
        },
      },
    ],
  },
});
