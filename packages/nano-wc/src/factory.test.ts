import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import * as v from "valibot";

import { propBuilders, refBuilders } from "./builders";
import { __ctx } from "./setup-context";
import { collectRefs, createComponent, createReactiveProps, parseWithSchema } from "./factory";
import { cleanup, createHostWith, mount, uniqueTag } from "../tests/utils";

afterEach(() => cleanup());

describe("parseWithSchema", () => {
  const schema = propBuilders.string();

  it("returns parsed value for valid input", () => {
    expect(parseWithSchema(schema, "hello", "test")).toBe("hello");
  });

  it("throws TypeError for async schema", () => {
    const asyncSchema = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: () => Promise.resolve({ value: "x" }),
      },
    };
    expect(() => parseWithSchema(asyncSchema, "x", "ctx")).toThrow(/async schemas not supported/);
  });
});

describe("createReactiveProps — reserved name guard", () => {
  it("throws when prop name conflicts with a prototype method", () => {
    const div = document.createElement("div");
    expect(() => createReactiveProps(div, { getAttribute: propBuilders.string() })).toThrow(
      /reserved/,
    );
  });

  it("allows emit as prop name (not on Component prototype)", () => {
    const tag = uniqueTag("rp");
    const Component = createComponent(tag, {}, {}, () => {});
    const el = new Component();
    expect(() => createReactiveProps(el, { emit: propBuilders.string() })).not.toThrow();
  });

  it("allows configurable prototype accessor props like lang and className", () => {
    const div = document.createElement("div");
    expect(() =>
      createReactiveProps(div, { lang: propBuilders.string(), className: propBuilders.string() }),
    ).not.toThrow();
  });
});

describe("createReactiveProps", () => {
  it("creates $-prefixed atom stores for each prop", () => {
    const div = document.createElement("div");
    const { stores } = createReactiveProps(div, { label: propBuilders.string() });
    expect(stores.$label).toBeDefined();
    expect(stores.$label.get()).toBe("");
  });

  it("initial store value from getAttribute", () => {
    const div = document.createElement("div");
    div.setAttribute("count", "7");
    const { stores } = createReactiveProps(div, { count: propBuilders.number() });
    expect(stores.$count.get()).toBe(7);
  });

  it("getter reads from store", () => {
    const div = document.createElement("div") as unknown as HTMLElement & { label: string };
    div.setAttribute("label", "hi");
    createReactiveProps(div, { label: propBuilders.string() });
    expect(div.label).toBe("hi");
  });

  it("setter with string calls setAttribute", () => {
    const div = document.createElement("div") as unknown as HTMLElement & { label: string };
    createReactiveProps(div, { label: propBuilders.string() });
    div.label = "new";
    expect(div.getAttribute("label")).toBe("new");
  });

  it("setter with null calls removeAttribute", () => {
    const div = document.createElement("div") as unknown as HTMLElement & { label: string | null };
    div.setAttribute("label", "old");
    createReactiveProps(div, { label: propBuilders.string() });
    div.label = null;
    expect(div.hasAttribute("label")).toBe(false);
  });

  it("camelCase prop reads from kebab-case HTML attribute on init", () => {
    const div = document.createElement("div");
    div.setAttribute("default-size", "42");
    const { stores } = createReactiveProps(div, { defaultSize: propBuilders.number() });
    expect(stores.$defaultSize.get()).toBe(42);
  });

  it("camelCase prop setter writes kebab-case attribute", () => {
    const div = document.createElement("div") as unknown as HTMLElement & { defaultSize: number };
    createReactiveProps(div, { defaultSize: propBuilders.number() });
    div.defaultSize = 10;
    expect(div.getAttribute("default-size")).toBe("10");
    expect(div.hasAttribute("defaultSize")).toBe(false);
  });

  it("camelCase prop setter with null removes kebab-case attribute", () => {
    const div = document.createElement("div") as unknown as HTMLElement & {
      defaultSize: number | null;
    };
    div.setAttribute("default-size", "5");
    createReactiveProps(div, { defaultSize: propBuilders.number() });
    div.defaultSize = null;
    expect(div.hasAttribute("default-size")).toBe(false);
  });
});

describe("createReactiveProps — pre-upgrade properties", () => {
  it("captures pre-upgrade attribute-backed prop and sets store", () => {
    const div = document.createElement("div") as unknown as HTMLElement & { active: boolean };
    (div as any).active = true;
    const { stores } = createReactiveProps(div, { active: propBuilders.boolean() });
    expect(stores.$active.get()).toBe(true);
    expect(div.active).toBe(true);
  });

  it("hydrateProps syncs attribute for pre-upgrade attribute-backed prop", () => {
    const div = document.createElement("div") as unknown as HTMLElement & { active: boolean };
    (div as any).active = true;
    const result = createReactiveProps(div, { active: propBuilders.boolean() });
    result.hydrateProps(div);
    expect(div.getAttribute("active")).toBe("true");
  });

  it("captures pre-upgrade non-attribute (json) prop", () => {
    const div = document.createElement("div") as unknown as HTMLElement & { items: number[] };
    (div as any).items = [1, 2, 3];
    const result = createReactiveProps(div, { items: propBuilders.json(v.array(v.number()), []) });
    expect(result.stores.$items.get()).toEqual([1, 2, 3]);
    result.hydrateProps(div);
    expect(result.stores.$items.get()).toEqual([1, 2, 3]);
  });

  it("parses pre-upgrade value through schema", () => {
    const div = document.createElement("div") as unknown as HTMLElement & { count: number };
    (div as any).count = "42";
    const { stores } = createReactiveProps(div, { count: propBuilders.number() });
    expect(stores.$count.get()).toBe(42);
  });

  it("standard case without pre-upgrade props unchanged", () => {
    const div = document.createElement("div") as unknown as HTMLElement & { label: string };
    div.setAttribute("label", "hello");
    const { stores } = createReactiveProps(div, { label: propBuilders.string() });
    expect(stores.$label.get()).toBe("hello");
    expect(div.label).toBe("hello");
  });
});

describe("createReactiveProps — json props", () => {
  const numArraySchema = v.array(v.number());
  const objSchema = v.object({ a: v.number() });

  it("hydrates from script tag", () => {
    const div = document.createElement("div");
    div.innerHTML = '<script type="application/json" data-prop="items">[1,2,3]</script>';
    const result = createReactiveProps(div, { items: propBuilders.json(numArraySchema, []) });
    result.hydrateProps(div);
    expect(result.stores.$items.get()).toEqual([1, 2, 3]);
  });

  it("falls back to attribute when no script tag", () => {
    const div = document.createElement("div");
    div.setAttribute("items", "[4,5]");
    const result = createReactiveProps(div, { items: propBuilders.json(numArraySchema, []) });
    result.hydrateProps(div);
    expect(result.stores.$items.get()).toEqual([4, 5]);
  });

  it("uses fallback when neither script tag nor attribute exists", () => {
    const div = document.createElement("div");
    const result = createReactiveProps(div, {
      items: propBuilders.json(numArraySchema, [10, 20]),
    });
    result.hydrateProps(div);
    expect(result.stores.$items.get()).toEqual([10, 20]);
  });

  it("prefers script tag over attribute", () => {
    const div = document.createElement("div");
    div.setAttribute("items", "[1]");
    div.innerHTML = '<script type="application/json" data-prop="items">[2]</script>';
    const result = createReactiveProps(div, { items: propBuilders.json(numArraySchema, []) });
    result.hydrateProps(div);
    expect(result.stores.$items.get()).toEqual([2]);
  });

  it("setter updates atom directly without creating attribute", () => {
    const div = document.createElement("div") as unknown as HTMLElement & { items: number[] };
    createReactiveProps(div, { items: propBuilders.json(numArraySchema, []) });
    div.items = [7, 8, 9];
    expect(div.items).toEqual([7, 8, 9]);
    expect(div.hasAttribute("items")).toBe(false);
  });

  it("getter reads from atom after hydration", () => {
    const div = document.createElement("div") as unknown as HTMLElement & {
      config: { a: number };
    };
    div.innerHTML = '<script type="application/json" data-prop="config">{"a":42}</script>';
    const result = createReactiveProps(div, {
      config: propBuilders.json(objSchema, { a: 0 }),
    });
    result.hydrateProps(div);
    expect(div.config).toEqual({ a: 42 });
  });

  it("throws on invalid JSON in script tag during hydration", () => {
    const div = document.createElement("div");
    div.innerHTML = '<script type="application/json" data-prop="items">not json</script>';
    const result = createReactiveProps(div, { items: propBuilders.json(numArraySchema, []) });
    expect(() => result.hydrateProps(div)).toThrow();
  });

  it("throws on invalid JSON in attribute during hydration", () => {
    const div = document.createElement("div");
    div.setAttribute("items", "not json");
    const result = createReactiveProps(div, { items: propBuilders.json(numArraySchema, []) });
    expect(() => result.hydrateProps(div)).toThrow();
  });

  it("validates parsed JSON through schema during hydration", () => {
    const div = document.createElement("div");
    div.innerHTML =
      '<script type="application/json" data-prop="config">{"a":"not a number"}</script>';
    const result = createReactiveProps(div, { config: propBuilders.json(objSchema, { a: 0 }) });
    expect(() => result.hydrateProps(div)).toThrow(TypeError);
  });

  it("reads kebab-case attribute for camelCase json prop", () => {
    const div = document.createElement("div");
    div.setAttribute("my-data", '{"a":1}');
    const result = createReactiveProps(div, {
      myData: propBuilders.json(objSchema, { a: 0 }),
    });
    result.hydrateProps(div);
    expect(result.stores.$myData.get()).toEqual({ a: 1 });
  });

  it("script tag stays in DOM after hydration", () => {
    const div = document.createElement("div");
    div.innerHTML = '<script type="application/json" data-prop="items">[1]</script>';
    const result = createReactiveProps(div, { items: propBuilders.json(numArraySchema, []) });
    result.hydrateProps(div);
    expect(div.querySelector('script[data-prop="items"]')).not.toBeNull();
  });

  it("property setter before hydration is not overwritten", () => {
    const div = document.createElement("div") as unknown as HTMLElement & { items: number[] };
    div.innerHTML = '<script type="application/json" data-prop="items">[1,2,3]</script>';
    const result = createReactiveProps(div, { items: propBuilders.json(numArraySchema, []) });
    div.items = [99];
    result.hydrateProps(div);
    expect(result.stores.$items.get()).toEqual([99]);
  });

  it("coexists with attribute-backed props", () => {
    const div = document.createElement("div") as unknown as HTMLElement & {
      label: string;
      items: number[];
    };
    div.setAttribute("label", "hello");
    div.innerHTML = '<script type="application/json" data-prop="items">[1,2]</script>';
    const result = createReactiveProps(div, {
      label: propBuilders.string(),
      items: propBuilders.json(numArraySchema, []),
    });
    result.hydrateProps(div);
    expect(result.stores.$label.get()).toBe("hello");
    expect(result.stores.$items.get()).toEqual([1, 2]);
  });
});

describe("createComponent — json props", () => {
  it("excludes json props from observedAttributes", () => {
    const tag = uniqueTag("json-obs");
    const Component = createComponent(
      tag,
      { label: propBuilders.string(), items: propBuilders.json(v.array(v.string()), []) },
      {},
      () => {},
    );
    expect(
      (Component as unknown as typeof HTMLElement & { observedAttributes: string[] })
        .observedAttributes,
    ).toEqual(["label"]);
  });

  it("json prop accessible via props stores", () => {
    const tag = uniqueTag("json-store");
    const schema = v.object({ x: v.number() });
    const Component = createComponent(
      tag,
      { data: propBuilders.json(schema, { x: 0 }) },
      {},
      () => {},
    );
    const el = mount<InstanceType<typeof Component>>(
      `<${tag}><script type="application/json" data-prop="data">{"x":5}</script></${tag}>`,
    );
    expect(el[__ctx].props.$data.get()).toEqual({ x: 5 });
  });

  it("json prop settable as JS property", () => {
    const tag = uniqueTag("json-set");
    const Component = createComponent(
      tag,
      { items: propBuilders.json(v.array(v.number()), []) },
      {},
      () => {},
    );
    const el = mount(Component);
    el.items = [1, 2, 3];
    expect(el[__ctx].props.$items.get()).toEqual([1, 2, 3]);
  });
});

describe("collectRefs", () => {
  describe("single refs", () => {
    it("finds by default [data-ref=key] selector", () => {
      const host = createHostWith('<span data-ref="title">Hello</span>');
      const refs = collectRefs(host, { title: refBuilders.one() });
      expect(refs.title).toBe(host.querySelector('[data-ref="title"]'));
    });

    it("finds by custom selector", () => {
      const host = createHostWith('<span class="custom">Hello</span>');
      const refs = collectRefs(host, { title: refBuilders.one(".custom") });
      expect(refs.title).toBe(host.querySelector(".custom"));
    });

    it("throws when not found", () => {
      const host = createHostWith("");
      expect(() => collectRefs(host, { title: refBuilders.one() })).toThrow(
        /Missing elements.*title/,
      );
    });

    it("aggregates all missing refs in one error", () => {
      const host = createHostWith("");
      expect(() => collectRefs(host, { a: refBuilders.one(), b: refBuilders.one() })).toThrow(
        /a, b/,
      );
    });

    it("validates element vs schema (tag mismatch throws)", () => {
      const host = createHostWith('<span data-ref="btn">click</span>');
      expect(() => collectRefs(host, { btn: refBuilders.one("button") })).toThrow(
        /Expected <button>/,
      );
    });
  });

  describe("list refs", () => {
    it("finds all matching elements", () => {
      const host = createHostWith('<i data-ref="items">1</i><i data-ref="items">2</i>');
      const refs = collectRefs(host, { items: refBuilders.many() });
      expect(refs.items).toHaveLength(2);
      expect(refs.items[0]).toBe(host.querySelectorAll('[data-ref="items"]')[0]);
      expect(refs.items[1]).toBe(host.querySelectorAll('[data-ref="items"]')[1]);
    });

    it("throws when none found", () => {
      const host = createHostWith("");
      expect(() => collectRefs(host, { items: refBuilders.many() })).toThrow(
        /Missing elements.*items/,
      );
    });

    it("validates each element", () => {
      const host = createHostWith('<div data-ref="btns">x</div>');
      expect(() => collectRefs(host, { btns: refBuilders.many("button") })).toThrow(
        /Expected <button>/,
      );
    });
  });

  describe("custom-element ancestor blocking", () => {
    it("skips ref inside nested custom element", () => {
      const tag = uniqueTag("inner");
      customElements.define(tag, class extends HTMLElement {});
      const host = createHostWith(`<${tag}><span data-ref="nested">inside</span></${tag}>`);
      expect(() => collectRefs(host, { nested: refBuilders.one() })).toThrow(/Missing/);
    });

    it("does not skip when custom element IS the host", () => {
      const tag = uniqueTag("host-ce");
      class CE extends HTMLElement {}
      customElements.define(tag, CE);
      const host = createHostWith(tag, '<span data-ref="child">ok</span>');
      const refs = collectRefs(host, { child: refBuilders.one() });
      expect(refs.child.tagName).toBe("SPAN");
    });

    it("multiple nesting levels are blocked for implicit refs", () => {
      const outer = uniqueTag("outer");
      const inner = uniqueTag("deep");
      customElements.define(outer, class extends HTMLElement {});
      customElements.define(inner, class extends HTMLElement {});
      const host = createHostWith(
        `<${outer}><${inner}><span data-ref="deep">x</span></${inner}></${outer}>`,
      );
      expect(() => collectRefs(host, { deep: refBuilders.one() })).toThrow(/Missing/);
    });
  });

  describe("owned refs (prefixed data-ref)", () => {
    it("finds prefixed ref through blocking custom element", () => {
      const hostTag = uniqueTag("owner");
      const inner = uniqueTag("wrap");
      customElements.define(inner, class extends HTMLElement {});
      const host = createHostWith(
        hostTag,
        `<${inner}><span data-ref="${hostTag}:nested">inside</span></${inner}>`,
      );
      const refs = collectRefs(host, { nested: refBuilders.one() });
      expect(refs.nested.tagName).toBe("SPAN");
    });

    it("finds prefixed ref through multiple nesting levels", () => {
      const hostTag = uniqueTag("owner");
      const outer = uniqueTag("outer");
      const inner = uniqueTag("inner");
      customElements.define(outer, class extends HTMLElement {});
      customElements.define(inner, class extends HTMLElement {});
      const host = createHostWith(
        hostTag,
        `<${outer}><${inner}><span data-ref="${hostTag}:deep">x</span></${inner}></${outer}>`,
      );
      const refs = collectRefs(host, { deep: refBuilders.one() });
      expect(refs.deep.tagName).toBe("SPAN");
    });

    it("does not collect ref prefixed with wrong component name", () => {
      const hostTag = uniqueTag("owner");
      const otherTag = uniqueTag("other");
      const inner = uniqueTag("wrap");
      customElements.define(inner, class extends HTMLElement {});
      const host = createHostWith(
        hostTag,
        `<${inner}><span data-ref="${otherTag}:nested">inside</span></${inner}>`,
      );
      expect(() => collectRefs(host, { nested: refBuilders.one() })).toThrow(/Missing/);
    });

    it("works with many() refs", () => {
      const hostTag = uniqueTag("owner");
      const inner = uniqueTag("wrap");
      customElements.define(inner, class extends HTMLElement {});
      const host = createHostWith(
        hostTag,
        `<${inner}><i data-ref="${hostTag}:items">1</i><i data-ref="${hostTag}:items">2</i></${inner}>`,
      );
      const refs = collectRefs(host, { items: refBuilders.many() });
      expect(refs.items).toHaveLength(2);
    });

    it("deduplicates when element matches both shallow and deep selectors", () => {
      const hostTag = uniqueTag("owner");
      const host = createHostWith(
        hostTag,
        `<span data-ref="title">shallow</span><span data-ref="${hostTag}:title">deep</span>`,
      );
      const refs = collectRefs(host, { title: refBuilders.many() });
      expect(refs.title).toHaveLength(2);
    });

    it("deduplicates same element matching both selectors", () => {
      const hostTag = uniqueTag("owner");
      // Element has both data-ref="title" and would need both selectors
      // but since data-ref can only have one value, this tests the set dedup
      const host = createHostWith(hostTag, `<span data-ref="title">only</span>`);
      const refs = collectRefs(host, { title: refBuilders.many() });
      expect(refs.title).toHaveLength(1);
    });

    it("mixes shallow and owned refs in same component", () => {
      const hostTag = uniqueTag("owner");
      const inner = uniqueTag("wrap");
      customElements.define(inner, class extends HTMLElement {});
      const host = createHostWith(
        hostTag,
        `<span data-ref="shallow">ok</span><${inner}><span data-ref="${hostTag}:deep">ok</span></${inner}>`,
      );
      const refs = collectRefs(host, {
        shallow: refBuilders.one(),
        deep: refBuilders.one(),
      });
      expect(refs.shallow.textContent).toBe("ok");
      expect(refs.deep.textContent).toBe("ok");
    });
  });
});

describe("createComponent", () => {
  describe("registration", () => {
    it("defines element, registers with customElements", () => {
      const tag = uniqueTag("reg");
      const Component = createComponent(tag, {}, {}, () => {});
      expect(customElements.get(tag)).toBe(Component);
    });

    it("instance is instanceof ctor", () => {
      const tag = uniqueTag("inst");
      const Component = createComponent(tag, {}, {}, () => {});
      const el = document.createElement(tag);
      expect(el).toBeInstanceOf(Component);
    });

    it("same tag twice → reuse with console.warn", () => {
      const tag = uniqueTag("dup");
      const Component1 = createComponent(tag, {}, {}, () => {});
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const Component2 = createComponent(tag, {}, {}, () => {});
      expect(Component2).toBe(Component1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("already defined"));
      warn.mockRestore();
    });

    it("instance exposes props via __ctx", () => {
      const tag = uniqueTag("ty") as "x-ty-101";
      const Component = createComponent(tag, {}, {}, () => {});
      const el = mount(Component);
      expectTypeOf(el[__ctx].props).toBeObject();
    });
  });

  describe("observedAttributes", () => {
    it("matches propsSchema keys as kebab-case", () => {
      const tag = uniqueTag("obs");
      const Component = createComponent(
        tag,
        { foo: propBuilders.string(), barBaz: propBuilders.number() },
        {},
        () => {},
      );
      expect(
        (Component as unknown as typeof HTMLElement & { observedAttributes: string[] })
          .observedAttributes,
      ).toEqual(["foo", "bar-baz"]);
    });
  });

  describe("attributeChangedCallback", () => {
    it("updates prop store on attribute change", () => {
      const tag = uniqueTag("attr");
      const Component = createComponent(tag, { val: propBuilders.string() }, {}, () => {});
      const el = mount(Component);
      el.setAttribute("val", "updated");
      expect(el[__ctx].props.$val.get()).toBe("updated");
    });

    it("updates camelCase prop store from kebab-case attribute change", () => {
      const tag = uniqueTag("attr-camel");
      const Component = createComponent(tag, { defaultSize: propBuilders.number() }, {}, () => {});
      const el = mount(Component);
      el.setAttribute("default-size", "99");
      expect(el[__ctx].props.$defaultSize.get()).toBe(99);
    });

    it("no-ops when old === new", () => {
      const tag = uniqueTag("noop");
      const Component = createComponent(tag, { val: propBuilders.string() }, {}, () => {});
      const el = mount(Component);
      el.setAttribute("val", "same");
      const spy = vi.fn();
      el[__ctx].props.$val.listen(spy);
      // Simulate attributeChangedCallback with same old/new
      (el as any).attributeChangedCallback("val", "same", "same");
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("connectedCallback", () => {
    it("calls setupFn", () => {
      const tag = uniqueTag("setup");
      const setupFn = vi.fn();
      createComponent(tag, {}, {}, setupFn);
      mount(`<${tag}></${tag}>`);
      expect(setupFn).toHaveBeenCalledOnce();
    });

    it("assigns mixin from setup return value", () => {
      const tag = uniqueTag("mixin");
      createComponent(tag, {}, {}, () => ({ greet: () => "hi" }));
      const el = mount(`<${tag}></${tag}>`);
      expect((el as any).greet()).toBe("hi");
    });

    it("allows mixin key 'emit' (not on prototype)", () => {
      const tag = uniqueTag("mixin-emit");
      createComponent(tag, {}, {}, () => ({ emit: () => "fired" }));
      const el = mount(`<${tag}></${tag}>`);
      expect((el as any).emit()).toBe("fired");
    });
  });

  describe("prop reflection round-trip", () => {
    it("setAttribute → store → getter", () => {
      const tag = uniqueTag("rt1");
      const Component = createComponent(tag, { name: propBuilders.string() }, {}, () => {});
      const el = mount(Component);
      el.setAttribute("name", "Alice");
      expect(el[__ctx].props.$name.get()).toBe("Alice");
      expect(el.name).toBe("Alice");
    });

    it("property setter → setAttribute → store", () => {
      const tag = uniqueTag("rt2");
      const Component = createComponent(tag, { name: propBuilders.string() }, {}, () => {});
      const el = mount(Component);
      el.name = "Bob";
      expect(el.getAttribute("name")).toBe("Bob");
      expect(el[__ctx].props.$name.get()).toBe("Bob");
    });

    it("same-value setAttribute skipped (oldValue === newValue guard)", () => {
      const tag = uniqueTag("rt3");
      const Component = createComponent(tag, { name: propBuilders.string() }, {}, () => {});
      const el = mount(Component);
      el.setAttribute("name", "same");
      const spy = vi.fn();
      el[__ctx].props.$name.listen(spy);
      el.setAttribute("name", "same");
      expect(spy).not.toHaveBeenCalled();
    });

    it("oneOf prop roundtrip: property setter → attribute → store", () => {
      const tag = uniqueTag("rt-oneof");
      const Component = createComponent(
        tag,
        { size: propBuilders.oneOf(["s", "m", "l"] as const, "m") },
        {},
        () => {},
      );
      const el = mount(Component);
      expect(el[__ctx].props.$size.get()).toBe("m");

      el.setAttribute("size", "l");
      expect(el[__ctx].props.$size.get()).toBe("l");

      el.size = "s";
      expect(el.getAttribute("size")).toBe("s");
      expect(el[__ctx].props.$size.get()).toBe("s");
    });
  });
});
