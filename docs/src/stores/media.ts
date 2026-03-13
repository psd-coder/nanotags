import { atom, onMount, type Atom } from "nanostores";

export function media(query: `(${string})`): Atom<boolean> {
  const $media = atom<boolean>(false);

  onMount($media, () => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia(query);

    $media.set(media.matches);

    function handler(event: MediaQueryListEvent) {
      $media.set(event.matches);
    }

    media.addEventListener("change", handler);

    return () => media.removeEventListener("change", handler);
  });

  return $media;
}

export const $prefersDarkScheme = media("(prefers-color-scheme: dark)");
export const $prefersReducedMotion = media("(prefers-reduced-motion: reduce)");
