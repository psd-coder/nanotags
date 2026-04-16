import { persistentAtom } from "@nanostores/persistent";

export type Cdn = "esm.sh" | "jsdelivr";

export const $cdn = persistentAtom<Cdn>("cdn", "esm.sh");
