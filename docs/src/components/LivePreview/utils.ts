import { merge } from "es-toolkit/object";
import baseStyles from "./base.css?raw";
import type { FileEntry, FileEntryType, ImportMap } from "./types";

const METHOD_OVERRIDES = `
  const log = (l, a) =>
    window.parent?.postMessage(
      { type: "nano-wc-log", level: l, args: a.map(String) },
      "*"
    );
  ["log", "warn", "error", "info", "debug"].forEach(l => {
    console[l] = (...a) => log(l, a);
  });
  window.addEventListener("error", e =>
    log("error", [e.message || String(e)])
  );
  window.addEventListener("unhandledrejection", e =>
    log("error", [e.reason?.message || String(e.reason)])
  );
`;

export function getContentType(entries: readonly FileEntry[], type: FileEntryType) {
  return entries.filter((e) => e.type === type).map((e) => e.content);
}

export function renderImportMap(
  importMaps: readonly string[],
  importMapOverrides?: ImportMap,
): string {
  let importMap = {};

  for (const stringMap of importMaps) {
    try {
      const parsed = JSON.parse(stringMap);
      merge(importMap, parsed);
    } catch {}
  }

  if (importMapOverrides) {
    merge(importMap, importMapOverrides);
  }

  return `<script type="importmap">${JSON.stringify(importMap)}</script>`;
}

export function renderScripts(scripts: readonly string[]): string {
  return `<script type="module">${scripts.join("\n")}</script>`;
}

export function renderStyles(styles: readonly string[]): string {
  return styles.map((c) => `<style>${c}</style>`).join("\n");
}

export function renderMarkup(markups: readonly string[]): string {
  return markups.join("\n");
}

export function buildHtml(
  files: readonly FileEntry[],
  importMapOverrides?: ImportMap,
  theme?: string,
): string {
  const jsFiles = files.filter((f) => f.type === "javascript");
  const mainJs = jsFiles.filter((f) => f.name === "app.js");
  const moduleJs = jsFiles.filter((f) => f.name !== "app.js");

  const moduleImports: ImportMap | undefined = moduleJs.length
    ? {
        imports: Object.fromEntries(
          moduleJs.map((f) => [
            f.name,
            `data:text/javascript;charset=utf-8,${encodeURIComponent(f.content)}`,
          ]),
        ),
      }
    : undefined;

  const combinedOverrides: ImportMap | undefined =
    importMapOverrides || moduleImports
      ? {
          imports: {
            ...moduleImports?.imports,
            ...importMapOverrides?.imports,
          },
        }
      : undefined;

  return `<!DOCTYPE html>
  <html style="color-scheme: ${theme ?? ""}">
    <head>
      <meta charset="UTF-8">
      ${renderImportMap(getContentType(files, "importmap"), combinedOverrides)}
      <style>${baseStyles}</style>
      ${renderStyles(getContentType(files, "css"))}
      ${renderScripts([METHOD_OVERRIDES])}
    </head>
    <body>
      ${renderMarkup(getContentType(files, "html"))}
      ${renderScripts(mainJs.map((f) => f.content))}
    </body>
  </html>`;
}
