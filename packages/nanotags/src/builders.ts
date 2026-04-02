import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { PropDef, ListRefMarker, SingleRefMarker } from "./types";
import { camelToKebab } from "./utils";

function schema<O>(
  validate: (value: unknown) => StandardSchemaV1.Result<O>,
): StandardSchemaV1<unknown, O> {
  return { "~standard": { version: 1, vendor: "nanotags", validate } };
}

function propSchema<O>(
  fallback: unknown,
  coerce: (value: unknown) => StandardSchemaV1.Result<O>,
): StandardSchemaV1<unknown, O> {
  const nullable = fallback === null;
  return schema<O>((value) => {
    const v = fallback !== undefined && value === null ? fallback : value;
    if (nullable && v === null) return { value: null } as StandardSchemaV1.Result<O>;
    return coerce(v);
  });
}

function fail(message: string) {
  return { issues: [{ message }] } as const;
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
    return propSchema(fallback, (v) => ({ value: v == null ? "" : String(v) }));
  },
  number(fallback?: number | null) {
    return propSchema(fallback, (v) => {
      const num = Number(v);
      return Number.isNaN(num) ? fail("Invalid number") : { value: num };
    });
  },
  boolean(fallback?: boolean | null) {
    return propSchema(fallback, (v) => ({
      value: v === "false" ? false : v === "" || !!v,
    }));
  },
  oneOf(
    options: readonly (string | number | bigint)[],
    fallback?: string | number | bigint | null,
  ) {
    return propSchema(fallback, (v) =>
      options.includes(v as string | number | bigint)
        ? { value: v }
        : fail(`Invalid value: ${JSON.stringify(v)}`),
    );
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

const TAG_RE = /^[a-z][a-z0-9-]*$/;

function parseRefArgs(tagOrSelector?: string) {
  const tag =
    typeof tagOrSelector === "string" && TAG_RE.test(tagOrSelector) ? tagOrSelector : undefined;
  const sel = typeof tagOrSelector === "string" && !tag ? tagOrSelector : undefined;
  return {
    ...(tag && { __tag: tag }),
    ...(sel && { __selector: sel }),
    schema: schema((value) => {
      if (!(value instanceof Element)) return fail("Expected Element");
      if (tag && value.tagName.toLowerCase() !== tag) return fail(`Expected <${tag}>`);
      return { value };
    }),
  };
}

function one(): SingleRefMarker;
function one<const Tag extends keyof HTMLElementTagNameMap>(tag: Tag): SingleRefMarker<Tag>;
function one<El extends Element>(): SingleRefMarker & { readonly __el: El };
function one<El extends Element>(selector: string): SingleRefMarker & { readonly __el: El };
function one(selector: string): SingleRefMarker;
function one(tagOrSelector?: string): SingleRefMarker {
  return parseRefArgs(tagOrSelector) as SingleRefMarker;
}

function many(): ListRefMarker;
function many<const Tag extends keyof HTMLElementTagNameMap>(tag: Tag): ListRefMarker<Tag>;
function many<El extends Element>(): ListRefMarker & { readonly __el: El };
function many<El extends Element>(selector: string): ListRefMarker & { readonly __el: El };
function many(selector: string): ListRefMarker;
function many(tagOrSelector?: string): ListRefMarker {
  return {
    __list: true as const,
    ...parseRefArgs(tagOrSelector),
  } as ListRefMarker;
}

export const refBuilders: { one: typeof one; many: typeof many } = {
  one,
  many,
};
