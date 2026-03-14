import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { defineCollection } from "astro:content";
import { examplesLoader } from "./loaders/examples-loader";

const examples = defineCollection({
  loader: examplesLoader("src/content/examples/"),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    files: z.array(
      z.object({
        name: z.string(),
        type: z.enum(["html", "javascript", "css", "importmap"]),
        lang: z.enum(["html", "javascript", "css"]),
        content: z.string(),
      }),
    ),
  }),
});

const docs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "src/content/docs" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number(),
  }),
});

export const collections = { examples, docs };
