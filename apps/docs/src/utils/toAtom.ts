import { type Atom, atom } from "nanostores";

import { isAtom } from "./isAtom";

export type ToAtom<V> = Atom<V> | V;

export function toAtom<V>(value: ToAtom<V>): Atom<V> {
  return isAtom(value) ? value : atom(value);
}
