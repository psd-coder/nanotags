import { readFileSync } from "node:fs";

export function readDocFile(slug: string): string {
  let raw: string;
  try {
    raw = readFileSync(`src/content/docs/${slug}.md`, "utf-8");
  } catch {
    raw = readFileSync(`src/content/docs/${slug}.mdx`, "utf-8");
  }
  return cleanMarkdown(raw);
}

export function cleanMarkdown(raw: string): string {
  return raw
    .replace(/^---\n[\s\S]*?\n---\n*/, "")
    .replace(/^import\s+.*;\s*\n/gm, "")
    .replace(
      /<InstallPackage\s+pkg="([^"]+)"\s*\/>/g,
      (_, pkg) => "```sh\nnpm install " + pkg + "\n```",
    );
}
