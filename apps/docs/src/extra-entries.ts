import type { ExtraEntry } from "astro-pigment";
import { getHref } from "astro-pigment/utils/urls";
import { markdownLinkItem } from "astro-pigment/utils/markdown";
import { getCollection } from "astro:content";

export const EXAMPLES_DESCRIPTION =
  "Live playground: edit code and see changes in the Preview immediately.";

export default async function (): Promise<ExtraEntry[]> {
  const examples = await getCollection("examples");
  return [
    {
      id: "examples",
      title: "Examples",
      description: EXAMPLES_DESCRIPTION,
      body: `${examples.map((ex) => markdownLinkItem(ex.data.title, getHref(`examples/${ex.id}.md`), ex.data.description)).join("\n")}`,
      order: 100,
    },
    ...examples.map((ex) => ({
      id: `examples/${ex.id}`,
      title: ex.data.title,
      description: ex.data.description,
      body: `## Example code\n\`\`\`html\n${ex.data.body}\n\`\`\``,
      llmsFull: false,
      order: 101,
    })),
  ];
}
