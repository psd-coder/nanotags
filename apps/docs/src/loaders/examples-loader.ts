import type { Loader } from "astro/loaders";
import { parseHTML } from "linkedom";
import { promises as fs } from "node:fs";
import { basename, join, relative } from "node:path";
import type { FileEntryLang, FileEntryType } from "../components/LivePreview/types";

type FileEntry = {
  name: string;
  type: FileEntryType;
  lang: FileEntryLang;
  content: string;
};

type ExampleData = {
  title: string;
  description: string;
  files: FileEntry[];
};

const TYPE_TO_LANG: Record<FileEntryType, FileEntryLang> = {
  html: "html",
  javascript: "javascript",
  css: "css",
  importmap: "javascript",
};

const TYPE_TO_DEFAULT_NAME: Record<FileEntryType, string> = {
  html: "index.html",
  javascript: "app.js",
  css: "styles.css",
  importmap: "importmap.json",
};

const TYPE_ORDER: Record<FileEntryType, number> = {
  html: 0,
  javascript: 1,
  css: 2,
  importmap: 3,
};

function dedent(text: string): string {
  const lines = text.split("\n");
  const indent = lines
    .filter((l) => l.trim().length > 0)
    .reduce((min, l) => {
      const leading = l.match(/^(\s*)/)?.[1]?.length ?? 0;
      return Math.min(min, leading);
    }, Infinity);

  if (!isFinite(indent) || indent === 0) return text;
  return lines.map((l) => l.slice(indent)).join("\n");
}

function resolveType(el: Element): FileEntryType | null {
  const dataType = el.getAttribute("data-type");
  if (dataType) return dataType as FileEntryType;
  if (el.getAttribute("type") === "importmap") return "importmap";
  return null;
}

function parseExampleHtml(raw: string): ExampleData {
  const { document } = parseHTML(raw);

  const title = document.querySelector("title")?.textContent ?? "";
  const description =
    document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";

  const files: FileEntry[] = [];

  for (const el of document.querySelectorAll('[data-type], script[type="importmap"]')) {
    const type = resolveType(el);
    if (!type) continue;
    const name = el.getAttribute("data-name") ?? TYPE_TO_DEFAULT_NAME[type];
    if (files.some((f) => f.name === name)) continue;
    const lang = TYPE_TO_LANG[type];
    const rawContent = type === "html" ? el.innerHTML : (el.textContent ?? "");
    const content = dedent(rawContent).trim();

    files.push({ name, type, lang, content });
  }

  files.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);

  return { title, description, files };
}

export function examplesLoader(contentDir: string): Loader {
  return {
    name: "examples-loader",
    async load({ store, parseData, config, logger, watcher }) {
      const rootPath = new URL(".", config.root).pathname;
      const baseDir = new URL(contentDir, config.root).pathname;

      const loadAll = async () => {
        let filenames: string[];
        try {
          filenames = (await fs.readdir(baseDir)).filter((f: string) => f.endsWith(".html"));
        } catch {
          logger.warn(`Examples directory not found: ${baseDir}`);
          return;
        }

        store.clear();

        for (const filename of filenames) {
          const fullPath = join(baseDir, filename);
          const raw = await fs.readFile(fullPath, "utf-8");
          const id = basename(filename, ".html");
          const parsed = parseExampleHtml(raw);
          const data = await parseData({ id, data: parsed });

          store.set({ id, data, filePath: relative(rootPath, fullPath) });
        }
      };

      await loadAll();

      watcher?.add(baseDir);
      watcher?.on("change", (changedPath) => {
        if (changedPath.startsWith(baseDir)) loadAll();
      });
    },
  };
}
