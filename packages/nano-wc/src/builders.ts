import * as v from "valibot";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { PropDef, ListRefMarker, SingleRefMarker } from "./types";
import { camelToKebab } from "./utils";

function getBaseSchema<V>(fallback?: V) {
  return fallback !== undefined ? v.nullish(v.unknown(), fallback) : v.unknown();
}

export const propBuilders: {
  string: {
    (fallback: null): StandardSchemaV1<unknown, string | null>;
    (fallback?: string): StandardSchemaV1<unknown, string>;
  };
  number: {
    (fallback: null): StandardSchemaV1<unknown, number | null>;
    (fallback?: number): StandardSchemaV1<unknown, number>;
  };
  boolean: {
    (fallback: null): StandardSchemaV1<unknown, boolean | null>;
    (fallback?: boolean): StandardSchemaV1<unknown, boolean>;
  };
  oneOf: {
    <const V extends string | number | bigint>(
      options: readonly V[],
      fallback: null,
    ): StandardSchemaV1<unknown, V | null>;
    <const V extends string | number | bigint>(
      options: readonly V[],
      fallback?: V,
    ): StandardSchemaV1<unknown, V>;
  };
  json: {
    <S extends StandardSchemaV1>(
      schema: S,
      fallback: null,
    ): PropDef<StandardSchemaV1.InferOutput<S> | null>;
    <S extends StandardSchemaV1>(
      schema: S,
      fallback: StandardSchemaV1.InferOutput<S>,
    ): PropDef<StandardSchemaV1.InferOutput<S>>;
    <S extends StandardSchemaV1>(schema: S): PropDef<StandardSchemaV1.InferOutput<S> | null>;
  };
} = {
  string(fallback?: string | null) {
    const n = fallback === null;
    return v.pipe(
      getBaseSchema(fallback),
      v.transform((val) => (val == null ? (n ? null : "") : String(val))),
    );
  },
  number(fallback?: number | null) {
    const parser =
      fallback === null ? v.transform((val) => (val == null ? null : Number(val))) : v.toNumber();
    return v.pipe(getBaseSchema(fallback), parser);
  },
  boolean(fallback?: boolean | null) {
    return v.pipe(
      getBaseSchema(fallback),
      v.transform((s) => {
        if (s === "false") return false;
        return s === "" || !!s;
      }),
    );
  },
  oneOf(
    options: readonly (string | number | bigint)[],
    fallback?: string | number | bigint | null,
  ) {
    const parser = fallback === null ? v.nullable(v.picklist(options)) : v.picklist(options);
    return v.pipe(getBaseSchema(fallback), parser);
  },
  json(schema: StandardSchemaV1, fallback?: unknown): PropDef {
    const fb = fallback ?? null;
    return {
      schema,
      attribute: false,
      get(host: HTMLElement, propName: string) {
        const script = host.querySelector(
          `script[type="application/json"][data-prop="${propName}"]`,
        );
        const raw = script?.textContent ?? host.getAttribute(camelToKebab(propName));
        return raw !== null ? JSON.parse(raw) : fb;
      },
    };
  },
} as never;

function buildRefSchema(tag: string | undefined) {
  return tag
    ? v.pipe(
        v.instance(Element),
        v.check((el) => el.tagName.toLowerCase() === tag, `Expected <${tag}>`),
      )
    : v.instance(Element);
}

const TAG_RE = /^[a-z][a-z0-9-]*$/;

function parseRefArgs(tagOrSelector?: string | readonly string[]) {
  const tag =
    typeof tagOrSelector === "string" && TAG_RE.test(tagOrSelector) ? tagOrSelector : undefined;
  const sel = typeof tagOrSelector === "string" && !tag ? tagOrSelector : undefined;
  return {
    ...(sel && { __selector: sel }),
    schema: buildRefSchema(tag),
  };
}

function one(): SingleRefMarker;
function one<const Tag extends keyof HTMLElementTagNameMap>(tag: Tag): SingleRefMarker<Tag>;
function one<const Tag extends keyof HTMLElementTagNameMap>(selector: string): SingleRefMarker<Tag>;
function one<const Tags extends readonly (keyof HTMLElementTagNameMap)[]>(
  tags: Tags,
): SingleRefMarker<Tags[number]>;
function one(selectors: readonly string[]): SingleRefMarker;
function one<El extends Element>(): SingleRefMarker & { readonly __el: El };
function one<El extends Element>(selector: string): SingleRefMarker & { readonly __el: El };
function one(selector: string): SingleRefMarker;
function one(tagOrSelector?: string | readonly string[]): SingleRefMarker {
  return parseRefArgs(tagOrSelector) as SingleRefMarker;
}

function many(): ListRefMarker;
function many<const Tag extends keyof HTMLElementTagNameMap>(tag: Tag): ListRefMarker<Tag>;
function many<const Tag extends keyof HTMLElementTagNameMap>(selector: string): ListRefMarker<Tag>;
function many<const Tags extends readonly (keyof HTMLElementTagNameMap)[]>(
  tags: Tags,
): ListRefMarker<Tags[number]>;
function many(selectors: readonly string[]): ListRefMarker;
function many<El extends Element>(): ListRefMarker & { readonly __el: El };
function many<El extends Element>(selector: string): ListRefMarker & { readonly __el: El };
function many(selector: string): ListRefMarker;
function many(tagOrSelector?: string | readonly string[]): ListRefMarker {
  return { __list: true as const, ...parseRefArgs(tagOrSelector) } as ListRefMarker;
}

export const refBuilders: { one: typeof one; many: typeof many } = {
  one,
  many,
};
