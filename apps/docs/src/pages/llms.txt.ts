import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { siteConfig } from "~/config";
import { readDocFile } from "~/utils/markdown";

const base = import.meta.env.BASE_URL;

type Section = { title: string; methods: string[] };

function extractSections(slug: string): Section[] {
  const result: Section[] = [];
  for (const l of readDocFile(slug).split("\n")) {
    if (l.startsWith("## ")) result.push({ title: l.slice(3), methods: [] });
    else if (l.startsWith("### ") && result.length)
      result[result.length - 1]!.methods.push(l.slice(4));
  }
  return result;
}

function formatSections(sections: Section[], deep: boolean): string[] {
  return sections.map((s) => {
    if (deep && s.methods.length) return `  - ${s.title}: ${s.methods.join(", ")}`;
    return `  - ${s.title}`;
  });
}

const DEEP_SLUGS = new Set(["api"]);

export const GET: APIRoute = async () => {
  const docs = (await getCollection("docs")).sort((a, b) => a.data.order - b.data.order);

  const sections = docs.map((doc) => {
    const headings = extractSections(doc.id);
    return [
      `## ${doc.data.title}`,
      "",
      `- [${doc.data.title}](${base}${doc.id}.md): ${doc.data.description}`,
      ...formatSections(headings, DEEP_SLUGS.has(doc.id)),
    ].join("\n");
  });

  const lines = [
    `# ${siteConfig.name}`,
    "",
    siteConfig.description,
    "",
    `- [llms-full.txt](${base}llms-full.txt): Complete documentation in a single file`,
    "",
    ...sections,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
