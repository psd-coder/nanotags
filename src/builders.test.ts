import { describe, expect, expectTypeOf, it } from "vitest";

import { propBuilders, refBuilders } from "./builders";
import { parseWithSchema } from "./factory";
import type { InferRef, InferRefs, ListRefMarker, SingleRefMarker, TypedEvent } from "./types";

describe("propBuilders", () => {
  describe("string", () => {
    const schema = propBuilders.string();

    it("coerces null to empty string", () => {
      expect(parseWithSchema(schema, null, "test")).toBe("");
    });

    it("coerces number to string", () => {
      expect(parseWithSchema(schema, 42, "test")).toBe("42");
    });

    it("passes string through", () => {
      expect(parseWithSchema(schema, "hello", "test")).toBe("hello");
    });
  });

  describe("number", () => {
    const schema = propBuilders.number();

    it('coerces "42" to 42', () => {
      expect(parseWithSchema(schema, "42", "test")).toBe(42);
    });

    it("coerces null to 0", () => {
      expect(parseWithSchema(schema, null, "test")).toBe(0);
    });

    it('throws on non-numeric "abc"', () => {
      expect(() => parseWithSchema(schema, "abc", "test")).toThrow(TypeError);
    });
  });

  describe("boolean", () => {
    const schema = propBuilders.boolean();

    it('"true" → true', () => {
      expect(parseWithSchema(schema, "true", "test")).toBe(true);
    });

    it('"false" → false', () => {
      expect(parseWithSchema(schema, "false", "test")).toBe(false);
    });

    it('"" (present attr) → true', () => {
      expect(parseWithSchema(schema, "", "test")).toBe(true);
    });

    it("null (absent attr) → false", () => {
      expect(parseWithSchema(schema, null, "test")).toBe(false);
    });

    it('rejects "yes"', () => {
      expect(() => parseWithSchema(schema, "yes", "test")).toThrow(TypeError);
    });

    it('rejects "1"', () => {
      expect(() => parseWithSchema(schema, "1", "test")).toThrow(TypeError);
    });
  });
});

describe("refBuilders", () => {
  describe("one", () => {
    it("no args: validates any Element", () => {
      const marker = refBuilders.one();
      const el = document.createElement("div");
      expect(parseWithSchema(marker.schema, el, "test")).toBe(el);
    });

    it("with tag: rejects non-matching element", () => {
      const marker = refBuilders.one("button");
      const el = document.createElement("div");
      expect(() => parseWithSchema(marker.schema, el, "test")).toThrow(TypeError);
    });

    it("with tag: accepts matching element", () => {
      const marker = refBuilders.one("button");
      const el = document.createElement("button");
      expect(parseWithSchema(marker.schema, el, "test")).toBe(el);
    });

    it("stores __options when given options", () => {
      const opts = { selector: ".custom" };
      const marker = refBuilders.one(opts);
      expect(marker.__options).toBe(opts);
    });

    it("typed one() infers __tag literal", () => {
      const marker = refBuilders.one("button");
      expectTypeOf(marker).toExtend<{ __tag: "button" }>();
    });

    it("untyped one() matches SingleRefMarker", () => {
      const marker = refBuilders.one();
      expectTypeOf(marker).toExtend<SingleRefMarker>();
    });

    it("InferRef: untyped → Element", () => {
      expectTypeOf<InferRef<SingleRefMarker>>().toEqualTypeOf<Element>();
    });

    it("InferRef: typed → concrete element", () => {
      expectTypeOf<InferRef<SingleRefMarker<"button">>>().toEqualTypeOf<HTMLButtonElement>();
    });

    it("generic type param with options: typed without runtime tag check", () => {
      const marker = refBuilders.one<"button">({ selector: ".my-trigger" });
      expectTypeOf(marker).toExtend<SingleRefMarker<"button">>();
      expect(marker.__options).toEqual({ selector: ".my-trigger" });
    });
  });

  describe("many", () => {
    it("__list is true", () => {
      const marker = refBuilders.many();
      expect(marker.__list).toBe(true);
    });

    it("with tag: validates matching elements", () => {
      const marker = refBuilders.many("input");
      const el = document.createElement("input");
      expect(parseWithSchema(marker.schema, el, "test")).toBe(el);
    });

    it("with tag: rejects non-matching element", () => {
      const marker = refBuilders.many("button");
      const el = document.createElement("div");
      expect(() => parseWithSchema(marker.schema, el, "test")).toThrow(TypeError);
    });

    it("stores __options when given options object", () => {
      const opts = { selector: ".items" };
      const marker = refBuilders.many(opts);
      expect(marker.__options).toBe(opts);
    });

    it("stores __options when given tag + options", () => {
      const opts = { selector: ".btns" };
      const marker = refBuilders.many("button", opts);
      expect(marker.__options).toBe(opts);
    });

    it("typed many() infers __list and __tag", () => {
      const marker = refBuilders.many("input");
      expectTypeOf(marker).toExtend<{ __list: true; __tag: "input" }>();
    });

    it("untyped many() matches ListRefMarker", () => {
      const marker = refBuilders.many();
      expectTypeOf(marker).toExtend<ListRefMarker>();
    });

    it("InferRef: untyped → Element[]", () => {
      expectTypeOf<InferRef<ListRefMarker>>().toEqualTypeOf<Element[]>();
    });

    it("InferRef: typed → concrete element[]", () => {
      expectTypeOf<InferRef<ListRefMarker<"input">>>().toEqualTypeOf<HTMLInputElement[]>();
    });

    it("generic type param with options: typed without runtime tag check", () => {
      const marker = refBuilders.many<"li">({ selector: ".items" });
      expectTypeOf(marker).toExtend<ListRefMarker<"li">>();
      expect(marker.__options).toEqual({ selector: ".items" });
    });
  });

  it("InferRefs maps mixed schema to correct element types", () => {
    type Schema = {
      btn: SingleRefMarker<"button">;
      items: ListRefMarker<"li">;
      generic: SingleRefMarker;
    };
    type Result = InferRefs<Schema>;
    expectTypeOf<Result["btn"]>().toEqualTypeOf<HTMLButtonElement>();
    expectTypeOf<Result["items"]>().toEqualTypeOf<HTMLLIElement[]>();
    expectTypeOf<Result["generic"]>().toEqualTypeOf<Element>();
  });
});

describe("TypedEvent", () => {
  it("narrows target and carries detail", () => {
    type E = TypedEvent<HTMLButtonElement, { id: number }>;
    expectTypeOf<E["target"]>().toExtend<HTMLButtonElement>();
    expectTypeOf<E["detail"]>().toEqualTypeOf<{ id: number }>();
  });
});
