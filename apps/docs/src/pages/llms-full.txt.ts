import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { siteConfig } from "~/config";
import { readDocFile } from "~/utils/markdown";

export const GET: APIRoute = async () => {
  const docs = (await getCollection("docs")).sort((a, b) => a.data.order - b.data.order);
  const parts = docs.map((doc) => `# ${doc.data.title}\n\n${readDocFile(doc.id)}`);
  const content = `# ${siteConfig.name}\n\n${siteConfig.description}\n\n${parts.join("\n\n")}`;

  return new Response(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
