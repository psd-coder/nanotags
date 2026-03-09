import type { Atom } from "nanostores";

export function isAtom(value: unknown): value is Atom<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "get" in value &&
    "listen" in value &&
    "subscribe" in value
  );
}
