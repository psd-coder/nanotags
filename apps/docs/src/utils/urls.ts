import type { AstroGlobal } from "astro";

export function getHref(href: string): string {
  const base = import.meta.env.BASE_URL;
  return base + href;
}

export function isActiveHref(ctx: AstroGlobal, href: string): boolean {
  const currentPath = ctx.url.pathname;
  const base = import.meta.env.BASE_URL;
  const fullPath = base + href;

  if (href === "") {
    return currentPath === base || currentPath === base.replace(/\/$/, "");
  }

  return currentPath.startsWith(fullPath);
}
