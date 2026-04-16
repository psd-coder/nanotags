import { defineDocsCollections } from "astro-pigment/content";
import { defineExamplesLoader } from "astro-pigment/loaders/examples";

export const collections = {
  ...defineDocsCollections(),
  examples: defineExamplesLoader("src/content/examples"),
};
