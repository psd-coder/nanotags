import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { readFileSync } from "node:fs";

export const getStaticPaths: GetStaticPaths = async () => {
  const docs = await getCollection("docs");
  return docs.map((doc) => ({ params: { slug: doc.id } }));
};

export const GET: APIRoute = ({ params }) => {
  const content = readFileSync(`src/content/docs/${params.slug}.md`, "utf-8");

  return new Response(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
