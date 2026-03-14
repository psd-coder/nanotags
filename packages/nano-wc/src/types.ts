import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { WritableAtom } from "nanostores";

export type ReadableStore<V> = {
  get(): V;
  subscribe(callback: (value: V) => void): () => void;
};

export type WritableStore<V> = ReadableStore<V> & {
  set(value: V): void;
};

export type TypedEvent<T extends EventTarget, D = unknown> = CustomEvent<D> & {
  target: T;
};

export type AnySchema = StandardSchemaV1;
export type PropDef<T = unknown> = {
  schema: StandardSchemaV1<unknown, T>;
  get?: (host: HTMLElement, key: string) => unknown;
  sync?: boolean;
};
export type FullPropDef<T = unknown> = Required<PropDef<T>>;
export type PropEntry = AnySchema | PropDef;
export type PropsSchema = Record<string, PropEntry>;

// oxlint-disable-next-line typescript/no-explicit-any
export type Infer<S> =
  S extends PropDef<infer T>
    ? T
    : // oxlint-disable-next-line typescript/no-explicit-any
      S extends StandardSchemaV1<any, infer O>
      ? O
      : never;

export type AttrPropKeys<S extends PropsSchema> = {
  [K in keyof S]: S[K] extends PropDef ? (S[K]["sync"] extends true ? K : never) : K;
}[keyof S] &
  string;

export type ReactiveProps<Schema extends PropsSchema> = {
  [Key in keyof Schema as `$${Key & string}`]: WritableAtom<Infer<Schema[Key]>>;
};

export type ComponentProps<Schema extends PropsSchema> = {
  [Key in keyof Schema]: Infer<Schema[Key]>;
};

// Store __tag (tag name literal) instead of _type (element type).
// Using HTMLElementTagNameMap[Tag] directly in the marker would force TypeScript to eagerly
// evaluate the whole map, causing circular references when the component itself is registered
// in HTMLElementTagNameMap via a global declaration.
// __tag is conditionally present: omitted when Tag is undefined (untyped ref → Element fallback).
export type SingleRefMarker<Tag extends keyof HTMLElementTagNameMap | undefined = undefined> = {
  readonly __list?: false;
  readonly __selector?: string;
  readonly schema: AnySchema;
  // oxlint-disable-next-line typescript-eslint/ban-types, typescript-eslint/no-empty-object-type
} & ([Tag] extends [undefined] ? {} : { readonly __tag: Tag & keyof HTMLElementTagNameMap });

export type ListRefMarker<Tag extends keyof HTMLElementTagNameMap | undefined = undefined> = {
  readonly __list: true;
  readonly __selector?: string;
  readonly schema: AnySchema;
  // oxlint-disable-next-line typescript-eslint/ban-types, typescript-eslint/no-empty-object-type
} & ([Tag] extends [undefined] ? {} : { readonly __tag: Tag & keyof HTMLElementTagNameMap });

export type RefsSchema = Record<string, SingleRefMarker | ListRefMarker>;

// HTMLElementTagNameMap[Tag] is resolved lazily here at usage time, not in the marker types.
// When __tag is absent (untyped ref), falls back to Element / Element[].
export type InferRef<M> = M extends { __el: infer El; __list: true }
  ? El[]
  : M extends { __el: infer El }
    ? El
    : M extends { __tag: infer Tag extends keyof HTMLElementTagNameMap; __list: true }
      ? HTMLElementTagNameMap[Tag][]
      : M extends { __list: true }
        ? Element[]
        : M extends { __tag: infer Tag extends keyof HTMLElementTagNameMap }
          ? HTMLElementTagNameMap[Tag]
          : Element;

export type InferRefs<Schema extends RefsSchema> = {
  [Key in keyof Schema]: InferRef<Schema[Key]>;
};

export type Prettify<T> = {
  [Key in keyof T]: T[Key];
} & {};
