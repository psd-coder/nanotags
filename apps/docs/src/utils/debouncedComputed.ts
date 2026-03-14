import { debounce } from "es-toolkit";
import { type ReadableAtom, type WritableAtom, atom, effect, onMount } from "nanostores";
import { isAtom } from "./isAtom";
import { toAtom } from "./toAtom";

export function debouncedComputed<V>(
  $atom: WritableAtom<V>,
  delay: number | ReadableAtom<number>,
): WritableAtom<V> {
  const $debouncedAtom = atom($atom.get());
  const $delay = isAtom(delay) ? delay : toAtom(delay);

  onMount($debouncedAtom, () => {
    return effect([$atom, $delay], (value, delay) => {
      const update = debounce(() => $debouncedAtom.set(value), delay);

      update();

      return () => update.cancel();
    });
  });

  return $debouncedAtom;
}
