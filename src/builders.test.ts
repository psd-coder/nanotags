import { describe, expect, expectTypeOf, it } from "vitest";

import { propBuilders, refBuilders } from "./builders";
import { parseWithSchema } from "./factory";
import type {
  Infer,
  InferRef,
  InferRefs,
  ListRefMarker,
  SingleRefMarker,
  TypedEvent,
} from "./types";

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

  describe("null fallback", () => {
    describe("string(null)", () => {
      const schema = propBuilders.string(null);

      it("null → null", () => {
        expect(parseWithSchema(schema, null, "test")).toBe(null);
      });

      it('"hello" → "hello"', () => {
        expect(parseWithSchema(schema, "hello", "test")).toBe("hello");
      });

      it("infers string | null", () => {
        expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<string | null>();
      });
    });

    describe("number(null)", () => {
      const schema = propBuilders.number(null);

      it("null → null", () => {
        expect(parseWithSchema(schema, null, "test")).toBe(null);
      });

      it('"42" → 42', () => {
        expect(parseWithSchema(schema, "42", "test")).toBe(42);
      });

      it("infers number | null", () => {
        expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<number | null>();
      });
    });

    describe("boolean(null)", () => {
      const schema = propBuilders.boolean(null);

      it("null → null", () => {
        expect(parseWithSchema(schema, null, "test")).toBe(null);
      });

      it('"true" → true', () => {
        expect(parseWithSchema(schema, "true", "test")).toBe(true);
      });

      it('"" → true', () => {
        expect(parseWithSchema(schema, "", "test")).toBe(true);
      });

      it('"false" → false', () => {
        expect(parseWithSchema(schema, "false", "test")).toBe(false);
      });

      it("infers boolean | null", () => {
        expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<boolean | null>();
      });
    });

    it("without null fallback types stay non-nullable", () => {
      expectTypeOf<Infer<ReturnType<typeof propBuilders.string>>>().toEqualTypeOf<string>();
      expectTypeOf<Infer<ReturnType<typeof propBuilders.number>>>().toEqualTypeOf<number>();
      expectTypeOf<Infer<ReturnType<typeof propBuilders.boolean>>>().toEqualTypeOf<boolean>();
    });
  });

  describe("oneOf", () => {
    const schema = propBuilders.oneOf(["a", "b"] as const);

    it("accepts valid option", () => {
      expect(parseWithSchema(schema, "a", "test")).toBe("a");
    });

    it("rejects invalid value", () => {
      expect(() => parseWithSchema(schema, "c", "test")).toThrow(TypeError);
    });

    it("with fallback: null → fallback", () => {
      const s = propBuilders.oneOf(["a", "b"] as const, "a");
      expect(parseWithSchema(s, null, "test")).toBe("a");
    });

    it("infers V", () => {
      expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<"a" | "b">();
    });

    describe("null fallback", () => {
      const nullSchema = propBuilders.oneOf(["a", "b"] as const, null);

      it("null → null", () => {
        expect(parseWithSchema(nullSchema, null, "test")).toBe(null);
      });

      it("accepts valid option", () => {
        expect(parseWithSchema(nullSchema, "a", "test")).toBe("a");
      });

      it("infers V | null", () => {
        expectTypeOf<Infer<typeof nullSchema>>().toEqualTypeOf<"a" | "b" | null>();
      });
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

    it("stores __selector for CSS selector string", () => {
      const marker = refBuilders.one(".custom");
      expect(marker.__selector).toBe(".custom");
    });

    it("treats tag+selector combo as selector, not tag", () => {
      const marker = refBuilders.one("button.primary");
      expect(marker.__selector).toBe("button.primary");
      expect(() =>
        parseWithSchema(marker.schema, document.createElement("div"), "test"),
      ).not.toThrow();
    });

    it("tag string: no __selector at runtime", () => {
      const marker = refBuilders.one("button");
      expect(marker.__selector).toBeUndefined();
    });

    it("typed one() infers __tag literal", () => {
      const marker = refBuilders.one("button");
      expectTypeOf(marker).toExtend<{ __tag: "button" }>();
      expectTypeOf<InferRef<typeof marker>>().toEqualTypeOf<HTMLButtonElement>();
    });

    it("untyped one() matches SingleRefMarker", () => {
      const marker = refBuilders.one();
      expectTypeOf(marker).toExtend<SingleRefMarker>();
      expectTypeOf<InferRef<typeof marker>>().toEqualTypeOf<Element>();
    });

    it("InferRef: untyped → Element", () => {
      expectTypeOf<InferRef<SingleRefMarker>>().toEqualTypeOf<Element>();
    });

    it("InferRef: typed → concrete element", () => {
      expectTypeOf<InferRef<SingleRefMarker<"button">>>().toEqualTypeOf<HTMLButtonElement>();
    });

    it("generic type param with selector: typed without runtime tag check", () => {
      const marker = refBuilders.one<"button">(".my-trigger");
      expectTypeOf(marker).toExtend<SingleRefMarker<"button">>();
      expect(marker.__selector).toBe(".my-trigger");
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

    it("stores __selector for CSS selector string", () => {
      const marker = refBuilders.many(".items");
      expect(marker.__selector).toBe(".items");
    });

    it("no __selector for tags array", () => {
      const marker = refBuilders.many(["button"]);
      expect(marker.__selector).toBeUndefined();
    });

    it("typed many() infers __list and __tag", () => {
      const marker = refBuilders.many("input");
      expectTypeOf(marker).toExtend<{ __list: true; __tag: "input" }>();
      expectTypeOf<InferRef<typeof marker>>().toEqualTypeOf<HTMLInputElement[]>();
    });

    it("untyped many() matches ListRefMarker", () => {
      const marker = refBuilders.many();
      expectTypeOf(marker).toExtend<ListRefMarker>();
      expectTypeOf<InferRef<typeof marker>>().toEqualTypeOf<Element[]>();
    });

    it("InferRef: untyped → Element[]", () => {
      expectTypeOf<InferRef<ListRefMarker>>().toEqualTypeOf<Element[]>();
    });

    it("InferRef: typed → concrete element[]", () => {
      expectTypeOf<InferRef<ListRefMarker<"input">>>().toEqualTypeOf<HTMLInputElement[]>();
    });

    it("generic type param with selector: typed without runtime tag check", () => {
      const marker = refBuilders.many<"li">(".items");
      expectTypeOf(marker).toExtend<ListRefMarker<"li">>();
      expect(marker.__selector).toBe(".items");
    });
  });

  describe("element generic overloads", () => {
    it("one<CustomEl>() → InferRef resolves to CustomEl", () => {
      type CustomEl = HTMLElement & { custom: true };
      const marker = refBuilders.one<CustomEl>();
      expectTypeOf<InferRef<typeof marker>>().toEqualTypeOf<CustomEl>();
    });

    it("many<CustomEl>() → InferRef resolves to CustomEl[]", () => {
      type CustomEl = HTMLElement & { custom: true };
      const marker = refBuilders.many<CustomEl>();
      expectTypeOf<InferRef<typeof marker>>().toEqualTypeOf<CustomEl[]>();
    });

    it("one<CustomEl>(selector) → works with selector", () => {
      type CustomEl = HTMLElement & { custom: true };
      const marker = refBuilders.one<CustomEl>(".x");
      expectTypeOf<InferRef<typeof marker>>().toEqualTypeOf<CustomEl>();
      expect(marker.__selector).toBe(".x");
    });

    it("many<CustomEl>(selector) → works with selector", () => {
      type CustomEl = HTMLElement & { custom: true };
      const marker = refBuilders.many<CustomEl>(".x");
      expectTypeOf<InferRef<typeof marker>>().toEqualTypeOf<CustomEl[]>();
      expect(marker.__selector).toBe(".x");
    });
  });

  describe("array-of-tags overloads", () => {
    it('one(["button", "a"]) → InferRef resolves to union', () => {
      const marker = refBuilders.one(["button", "a"]);
      expectTypeOf<InferRef<typeof marker>>().toEqualTypeOf<
        HTMLButtonElement | HTMLAnchorElement
      >();
    });

    it('many(["button", "a"]) → InferRef resolves to union[]', () => {
      const marker = refBuilders.many(["button", "a"]);
      expectTypeOf<InferRef<typeof marker>>().toEqualTypeOf<
        (HTMLButtonElement | HTMLAnchorElement)[]
      >();
    });

    it("array-of-tags: no __selector", () => {
      const marker = refBuilders.one(["button", "a"]);
      expectTypeOf<InferRef<typeof marker>>().toEqualTypeOf<
        HTMLButtonElement | HTMLAnchorElement
      >();
      expect(marker.__selector).toBeUndefined();
    });

    it("mixed tags and selectors in array → falls back to Element", () => {
      const oneMarker = refBuilders.one(["button", ".some-class"]);
      expectTypeOf<InferRef<typeof oneMarker>>().toEqualTypeOf<Element>();
      expect(oneMarker.__selector).toBeUndefined();

      const manyMarker = refBuilders.many(["li", ".some-class"]);
      expectTypeOf<InferRef<typeof manyMarker>>().toEqualTypeOf<Element[]>();
      expect(manyMarker.__selector).toBeUndefined();
    });
  });

  it("InferRefs maps mixed schema to correct element types", () => {
    type CustomEl = HTMLElement & { custom: true };
    type Schema = {
      btn: SingleRefMarker<"button">;
      items: ListRefMarker<"li">;
      generic: SingleRefMarker;
      custom: SingleRefMarker & { readonly __el: CustomEl };
      unionTags: ListRefMarker<"button" | "a">;
    };
    type Result = InferRefs<Schema>;
    expectTypeOf<Result["btn"]>().toEqualTypeOf<HTMLButtonElement>();
    expectTypeOf<Result["items"]>().toEqualTypeOf<HTMLLIElement[]>();
    expectTypeOf<Result["generic"]>().toEqualTypeOf<Element>();
    expectTypeOf<Result["custom"]>().toEqualTypeOf<CustomEl>();
    expectTypeOf<Result["unionTags"]>().toEqualTypeOf<(HTMLButtonElement | HTMLAnchorElement)[]>();
  });
});

describe("TypedEvent", () => {
  it("narrows target and carries detail", () => {
    type E = TypedEvent<HTMLButtonElement, { id: number }>;
    expectTypeOf<E["target"]>().toExtend<HTMLButtonElement>();
    expectTypeOf<E["detail"]>().toEqualTypeOf<{ id: number }>();
  });
});
