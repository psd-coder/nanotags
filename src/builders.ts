import * as v from "valibot";

import type { AnySchema, ListRefMarker, RefOptions, SingleRefMarker } from "./types";

export const propBuilders: {
  string: () => AnySchema;
  number: () => AnySchema;
  boolean: () => AnySchema;
} = {
  string: () => v.pipe(v.unknown(), v.toString()),
  number: () => v.pipe(v.unknown(), v.toNumber()),
  boolean: () =>
    v.pipe(
      v.unknown(),
      v.union([v.literal("true"), v.literal("false"), v.literal(""), v.null()]),
      v.transform((str) => str === "true" || str === ""),
    ),
};

function buildRefSchema(tag: string | undefined) {
  return tag
    ? v.pipe(
        v.instance(Element),
        v.check((el) => el.tagName.toLowerCase() === tag, `Expected <${tag}>`),
      )
    : v.instance(Element);
}

function one(): SingleRefMarker;
function one(options: RefOptions): SingleRefMarker;
function one<const Tag extends keyof HTMLElementTagNameMap>(tag: Tag): SingleRefMarker<Tag>;
function one<const Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  options: RefOptions,
): SingleRefMarker<Tag>;
function one<const Tag extends keyof HTMLElementTagNameMap>(
  options: RefOptions,
): SingleRefMarker<Tag>;
function one(tagOrOptions?: string | RefOptions, options?: RefOptions): SingleRefMarker {
  const tag = typeof tagOrOptions === "string" ? tagOrOptions : undefined;
  const opts = typeof tagOrOptions === "object" ? tagOrOptions : options;
  return {
    ...(tag && { __tag: tag }),
    ...(opts && { __options: opts }),
    schema: buildRefSchema(tag),
  } as unknown as SingleRefMarker;
}

function many(): ListRefMarker;
function many(options: RefOptions): ListRefMarker;
function many<const Tag extends keyof HTMLElementTagNameMap>(tag: Tag): ListRefMarker<Tag>;
function many<const Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  options: RefOptions,
): ListRefMarker<Tag>;
function many<const Tag extends keyof HTMLElementTagNameMap>(
  options: RefOptions,
): ListRefMarker<Tag>;
function many(tagOrOptions?: string | RefOptions, options?: RefOptions): ListRefMarker {
  const tag = typeof tagOrOptions === "string" ? tagOrOptions : undefined;
  const opts = typeof tagOrOptions === "object" ? tagOrOptions : options;
  return {
    __list: true as const,
    ...(tag && { __tag: tag }),
    ...(opts && { __options: opts }),
    schema: buildRefSchema(tag),
  } as unknown as ListRefMarker;
}

export const refBuilders: { one: typeof one; many: typeof many } = { one, many };
