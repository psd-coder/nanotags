declare module "*.astro" {
  const component: import("astro/runtime/server/render/index.d.ts").AstroComponentFactory;
  export default component;
}

/// <reference path="../.astro/types.d.ts" />
