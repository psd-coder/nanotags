// @ts-check
import { defineConfig } from "astro/config";
import docsTheme from "astro-pigment";

const nanoTagsRoot = new URL("../../packages/nanotags", import.meta.url).pathname;

// https://astro.build/config
export default defineConfig({
  integrations: [
    docsTheme({
      project: {
        name: "nanotags",
        description:
          "Tiny Web Components wrapper powered by Nano Stores reactivity. No Shadow DOM, typed builder API, reactive props and refs via nanostores, automatic cleanup on disconnect.",
        license: {
          name: "MIT",
          url: "https://github.com/psd-coder/nanotags/blob/main/LICENSE",
        },
        github: { user: "psd-coder", repository: "nanotags" },
      },
      author: { name: "Pavel Grinchenko", url: "https://x.com/psd_coder" },
      credits: [{ name: "Evil Martians", url: "https://evilmartians.com/" }],
      customCss: ["./src/assets/custom.css"],
      logo: "./src/assets/logo.svg",
      icon: "./src/assets/favicon.svg",
      docs: {
        navLinks: [
          { href: "/", label: "Getting Started" },
          { href: "/api", label: "API" },
          { href: "/cookbook", label: "Cookbook" },
          { href: "/examples", label: "Examples" },
        ],
      },
      extraEntries: "./src/extra-entries.ts",
    }),
  ],
  vite: {
    optimizeDeps: {
      entries: ["!src/content/examples/**"],
    },
    plugins: [
      {
        name: "nanotags-source",
        enforce: "pre",
        resolveId(id) {
          if (id === "nanotags") return `${nanoTagsRoot}/src/index.ts`;
          if (id.startsWith("nanotags/"))
            return `${nanoTagsRoot}/src/${id.slice("nanotags/".length)}.ts`;
          if (id.startsWith("nanotags:dist/"))
            return `${nanoTagsRoot}/dist/${id.slice("nanotags:dist/".length)}`;
        },
      },
    ],
  },
});
