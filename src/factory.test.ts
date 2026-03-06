import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { propBuilders, refBuilders } from "./builders";
import { collectRefs, createComponent, createReactiveProps, parseWithSchema } from "./factory";
import { cleanup, createHostWith, mount, uniqueTag } from "../tests/utils";

afterEach(() => cleanup());

describe("parseWithSchema", () => {
  const schema = propBuilders.string();

  it("returns parsed value for valid input", () => {
    expect(parseWithSchema(schema, "hello", "test")).toBe("hello");
  });

  it("throws TypeError with context for invalid input", () => {
    const badSchema = propBuilders.boolean();
    expect(() => parseWithSchema(badSchema, "yes", "ctx")).toThrow(TypeError);
    expect(() => parseWithSchema(badSchema, "yes", "ctx")).toThrow(/ctx/);
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

  it("error includes JSON of invalid value", () => {
    const badSchema = propBuilders.boolean();
    expect(() => parseWithSchema(badSchema, "yes", "ctx")).toThrow(/"yes"/);
  });
});

describe("createReactiveProps — reserved name guard", () => {
  it("throws when prop name conflicts with a prototype method", () => {
    const div = document.createElement("div");
    expect(() => createReactiveProps(div, { getAttribute: propBuilders.string() })).toThrow(
      /reserved/,
    );
  });

  it("throws when prop name conflicts with prototype method on component", () => {
    const tag = uniqueTag("rp");
    const Component = createComponent(tag, {}, {}, () => {});
    const el = new Component();
    expect(() => createReactiveProps(el, { emit: propBuilders.string() })).toThrow(/reserved/);
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
    it("defines element, returns ctor with elementName", () => {
      const tag = uniqueTag("reg");
      const Component = createComponent(tag, {}, {}, () => {});
      expect(Component.elementName).toBe(tag);
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

    it("elementName is literal type", () => {
      const tag = uniqueTag("ty") as "x-ty-100";
      const Component = createComponent(tag, {}, {}, () => {});
      expectTypeOf(Component.elementName).toEqualTypeOf<"x-ty-100">();
    });

    it("instance exposes props", () => {
      const tag = uniqueTag("ty") as "x-ty-101";
      const Component = createComponent(tag, {}, {}, () => {});
      const el = new Component();
      expectTypeOf(el.props).toBeObject();
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
      const el = new Component();
      el.setAttribute("val", "updated");
      expect(el.props.$val.get()).toBe("updated");
    });

    it("updates camelCase prop store from kebab-case attribute change", () => {
      const tag = uniqueTag("attr-camel");
      const Component = createComponent(tag, { defaultSize: propBuilders.number() }, {}, () => {});
      const el = new Component();
      el.setAttribute("default-size", "99");
      expect(el.props.$defaultSize.get()).toBe(99);
    });

    it("no-ops when old === new", () => {
      const tag = uniqueTag("noop");
      const Component = createComponent(tag, { val: propBuilders.string() }, {}, () => {});
      const el = new Component();
      el.setAttribute("val", "same");
      const spy = vi.fn();
      el.props.$val.listen(spy);
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

    it("throws when mixin key conflicts with prototype", () => {
      const tag = uniqueTag("mixin-bad");
      createComponent(tag, {}, {}, () => ({ emit: () => {} }));
      expect(() => mount(`<${tag}></${tag}>`)).toThrow(/reserved/);
    });
  });

  describe("consume() timing with mixin", () => {
    it("child defined after mount can consume() parent mixin via upgrade", () => {
      const parentTag = uniqueTag("par");
      const childTag = uniqueTag("ch");

      const Parent = createComponent(parentTag, {}, {}, () => ({ getInfo: () => "from-parent" }));

      // Mount with child NOT yet defined — child stays as plain element
      const el = mount(`<${parentTag}><${childTag}></${childTag}></${parentTag}>`);
      expect((el as any).getInfo()).toBe("from-parent");

      // Now define child — upgrade will connect it
      let consumed: string | undefined;
      createComponent(childTag, {}, {}, (ctx) => {
        const parent = ctx.consume(Parent);
        consumed = (parent as any).getInfo();
      });

      customElements.upgrade(el);
      expect(consumed).toBe("from-parent");
    });
  });

  describe("prop reflection round-trip", () => {
    it("setAttribute → store → getter", () => {
      const tag = uniqueTag("rt1");
      const Component = createComponent(tag, { name: propBuilders.string() }, {}, () => {});
      const el = new Component();
      el.setAttribute("name", "Alice");
      expect(el.props.$name.get()).toBe("Alice");
      expect((el as any).name).toBe("Alice");
    });

    it("property setter → setAttribute → store", () => {
      const tag = uniqueTag("rt2");
      const Component = createComponent(tag, { name: propBuilders.string() }, {}, () => {});
      const el = new Component();
      (el as any).name = "Bob";
      expect(el.getAttribute("name")).toBe("Bob");
      expect(el.props.$name.get()).toBe("Bob");
    });

    it("same-value setAttribute skipped (oldValue === newValue guard)", () => {
      const tag = uniqueTag("rt3");
      const Component = createComponent(tag, { name: propBuilders.string() }, {}, () => {});
      const el = new Component();
      el.setAttribute("name", "same");
      const spy = vi.fn();
      el.props.$name.listen(spy);
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
      const el = new Component();
      expect(el.props.$size.get()).toBe("m");

      el.setAttribute("size", "l");
      expect(el.props.$size.get()).toBe("l");

      (el as any).size = "s";
      expect(el.getAttribute("size")).toBe("s");
      expect(el.props.$size.get()).toBe("s");
    });
  });
});
