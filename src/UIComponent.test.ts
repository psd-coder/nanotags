import { atom } from "nanostores";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { define } from "./define";
import type { SetupContext } from "./UIComponent";
import { cleanup, mount, uniqueTag } from "../tests/utils";

afterEach(() => cleanup());

describe("lifecycle cleanup", () => {
  it("onCleanup callbacks fire on disconnect", () => {
    const tag = uniqueTag("lc");
    const cb = vi.fn();
    define(tag, (ctx) => {
      ctx.onCleanup(cb);
    });
    const el = mount(`<${tag}></${tag}>`);
    el.remove();
    expect(cb).toHaveBeenCalledOnce();
  });

  it("on() listeners removed on disconnect", () => {
    const tag = uniqueTag("lc");
    const handler = vi.fn();
    define(tag, (ctx) => {
      ctx.on(ctx.host, "click", handler);
    });
    const el = mount(`<${tag}></${tag}>`);
    el.click();
    expect(handler).toHaveBeenCalledOnce();
    el.remove();
    el.click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("effect() unsubscribed on disconnect", () => {
    const tag = uniqueTag("lc");
    const $store = atom(0);
    const spy = vi.fn();
    define(tag, (ctx) => {
      ctx.effect($store, spy);
    });
    const el = mount(`<${tag}></${tag}>`);
    expect(spy).toHaveBeenCalledWith(0);
    el.remove();
    $store.set(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("cleanups reset after disconnect", () => {
    const tag = uniqueTag("lc");
    const cb = vi.fn();
    define(tag, (ctx) => {
      ctx.onCleanup(cb);
    });
    const el = mount(`<${tag}></${tag}>`);
    el.remove();
    el.remove();
    expect(cb).toHaveBeenCalledOnce();
  });

  it("runs all cleanups even if one throws, re-throws first error", () => {
    const tag = uniqueTag("lc");
    const cb1 = vi.fn();
    const cb2 = vi.fn(() => {
      throw new Error("boom");
    });
    const cb3 = vi.fn();
    define(tag, (ctx) => {
      ctx.onCleanup(cb1);
      ctx.onCleanup(cb2);
      ctx.onCleanup(cb3);
    });
    const el = mount(`<${tag}></${tag}>`);
    expect(() => el.remove()).toThrow("boom");
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
    expect(cb3).toHaveBeenCalledOnce();
  });

  it("re-throws first error when multiple cleanups throw", () => {
    const tag = uniqueTag("lc");
    define(tag, (ctx) => {
      ctx.onCleanup(() => {
        throw new Error("first");
      });
      ctx.onCleanup(() => {
        throw new Error("second");
      });
    });
    const el = mount(`<${tag}></${tag}>`);
    expect(() => el.remove()).toThrow("first");
  });

  it("reconnect: previous listeners gone, new ones from fresh setup", () => {
    const tag = uniqueTag("lc");
    const calls: string[] = [];
    define(tag, (ctx) => {
      const id = String(calls.length);
      ctx.onCleanup(() => calls.push(`cleanup-${id}`));
    });
    const el = mount(`<${tag}></${tag}>`);
    el.remove();
    expect(calls).toEqual(["cleanup-0"]);
    document.body.appendChild(el);
    el.remove();
    expect(calls).toEqual(["cleanup-0", "cleanup-1"]);
  });

  it("SetupContext exposes UIComponent API and omits HTMLElement members (only on type level)", () => {
    type Ctx = SetupContext<Record<string, never>, Record<string, never>>;
    expectTypeOf<Ctx>().toHaveProperty("props");
    expectTypeOf<Ctx>().toHaveProperty("refs");
    expectTypeOf<Ctx>().toHaveProperty("host");
    expectTypeOf<Ctx>().toHaveProperty("on");
    expectTypeOf<Ctx>().toHaveProperty("emit");
    expectTypeOf<Ctx>().toHaveProperty("effect");
    expectTypeOf<Ctx>().toHaveProperty("bind");
    expectTypeOf<Ctx>().toHaveProperty("render");
    expectTypeOf<Ctx>().toHaveProperty("renderList");
    expectTypeOf<Ctx>().toHaveProperty("withCache");
    expectTypeOf<Ctx>().toHaveProperty("onCleanup");
    expectTypeOf<Ctx>().toHaveProperty("consume");
    expectTypeOf<Ctx>().toHaveProperty("getElement");
    expectTypeOf<Ctx>().toHaveProperty("getElements");
    expectTypeOf<Ctx>().not.toHaveProperty("className");
    expectTypeOf<Ctx>().not.toHaveProperty("innerHTML");
    expectTypeOf<Ctx>().not.toHaveProperty("addEventListener");
  });
});

describe("on", () => {
  it("single element", () => {
    const tag = uniqueTag("on");
    const handler = vi.fn();
    define(tag, (ctx) => {
      ctx.on(ctx.host, "click", handler);
    });
    const el = mount(`<${tag}></${tag}>`);
    el.click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("array of elements", () => {
    const tag = uniqueTag("on");
    const handler = vi.fn();
    define(tag)
      .withRefs((r) => ({ btns: r.many("button") }))
      .setup((ctx) => {
        ctx.on(ctx.refs.btns, "click", handler);
      });
    mount(`<${tag}><button data-ref="btns">A</button><button data-ref="btns">B</button></${tag}>`);
    const btns = document.querySelectorAll<HTMLElement>("button");
    btns[0]?.click();
    btns[1]?.click();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("Document target", () => {
    const tag = uniqueTag("on");
    const handler = vi.fn();
    define(tag, (ctx) => {
      ctx.on(document, "keydown", handler);
    });
    mount(`<${tag}></${tag}>`);
    document.dispatchEvent(new Event("keydown"));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("Window target", () => {
    const tag = uniqueTag("on");
    const handler = vi.fn();
    define(tag, (ctx) => {
      ctx.on(window, "resize", handler);
    });
    mount(`<${tag}></${tag}>`);
    window.dispatchEvent(new Event("resize"));
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("emit", () => {
  it("emit(Event) dispatches provided event", () => {
    const tag = uniqueTag("emit");
    const spy = vi.fn();
    define(tag, (ctx) => {
      ctx.host.addEventListener("my-event", spy);
      ctx.emit(new Event("my-event"));
    });
    mount(`<${tag}></${tag}>`);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("emit(name, detail) creates bubbling composed CustomEvent", () => {
    const tag = uniqueTag("emit");
    let captured: CustomEvent | undefined;
    define(tag, (ctx) => {
      ctx.host.addEventListener("notify", (e) => (captured = e as CustomEvent));
      ctx.emit("notify", { msg: "hi" });
    });
    mount(`<${tag}></${tag}>`);
    expect(captured).toBeDefined();
    expect(captured?.detail).toEqual({ msg: "hi" });
    expect(captured?.bubbles).toBe(true);
    expect(captured?.composed).toBe(true);
  });

  it("options override merged", () => {
    const tag = uniqueTag("emit");
    let captured: CustomEvent | undefined;
    define(tag, (ctx) => {
      ctx.host.addEventListener("evt", (e) => (captured = e as CustomEvent));
      ctx.emit("evt", null, { bubbles: false });
    });
    mount(`<${tag}></${tag}>`);
    expect(captured?.bubbles).toBe(false);
  });
});

describe("withCache", () => {
  it("computes on first call", () => {
    const tag = uniqueTag("cache");
    const compute = vi.fn(() => 42);
    define(tag, (ctx) => {
      expect(ctx.withCache("k", compute)).toBe(42);
    });
    mount(`<${tag}></${tag}>`);
    expect(compute).toHaveBeenCalledOnce();
  });

  it("returns cached on second call", () => {
    const tag = uniqueTag("cache");
    const compute = vi.fn(() => 42);
    define(tag, (ctx) => {
      ctx.withCache("k", compute);
      ctx.withCache("k", compute);
    });
    mount(`<${tag}></${tag}>`);
    expect(compute).toHaveBeenCalledOnce();
  });

  it("cleared on disconnect", () => {
    const tag = uniqueTag("cache");
    const compute = vi.fn(() => 99);
    define(tag, (ctx) => {
      ctx.withCache("k", compute);
    });
    const el = mount(`<${tag}></${tag}>`);
    el.remove();
    document.body.appendChild(el);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("recomputes after reconnect", () => {
    const tag = uniqueTag("cache");
    let counter = 0;
    define(tag, (ctx) => {
      const val = ctx.withCache("k", () => ++counter);
      return { val };
    });
    const el = mount(`<${tag}></${tag}>`);
    expect((el as any).val).toBe(1);
    el.remove();
    document.body.appendChild(el);
    expect((el as any).val).toBe(2);
  });
});

describe("getElement / getElements", () => {
  it("returns matching element", () => {
    const tag = uniqueTag("ge");
    let found: Element | undefined;
    define(tag, (ctx) => {
      found = ctx.getElement(".item");
    });
    mount(`<${tag}><span class="item">ok</span></${tag}>`);
    expect(found).toBeDefined();
    expectTypeOf(found!).toEqualTypeOf<Element>();
  });

  it("Inferres type from the tag-name selector", () => {
    const tag = uniqueTag("ge");
    let found: HTMLButtonElement | undefined;
    define(tag, (ctx) => {
      found = ctx.getElement("button");
    });
    mount(`<${tag}><button>Click</button></${tag}>`);
    expect(found).toBeDefined();
    expectTypeOf(found!).toEqualTypeOf<HTMLButtonElement>();
  });

  it("throws when not found", () => {
    const tag = uniqueTag("ge");
    define(tag, (ctx) => {
      ctx.getElement(".missing");
    });
    expect(() => mount(`<${tag}></${tag}>`)).toThrow(/missing/);
  });

  it("returns matching elements", () => {
    const tag = uniqueTag("ge");
    let found: Element[] | undefined;
    define(tag, (ctx) => {
      found = ctx.getElements(".item");
    });
    mount(`<${tag}><span class="item">1</span><span class="item">2</span></${tag}>`);
    expect(found).toHaveLength(2);
  });

  it("getElements throws when not found", () => {
    const tag = uniqueTag("ge");
    define(tag, (ctx) => {
      ctx.getElements(".missing");
    });
    expect(() => mount(`<${tag}></${tag}>`)).toThrow(/missing/);
  });

  it("works with custom root", () => {
    const tag = uniqueTag("ge");
    let found: Element | undefined;
    define(tag, (ctx) => {
      const container = ctx.getElement(".container");
      found = ctx.getElement(container, ".nested");
    });
    mount(`<${tag}><div class="container"><span class="nested">ok</span></div></${tag}>`);
    expect(found).toBeDefined();
    expect((found as Element).tagName).toBe("SPAN");
  });

  it("getElements works with custom root", () => {
    const tag = uniqueTag("ge");
    let found: Element[] | undefined;
    define(tag, (ctx) => {
      const container = ctx.getElement(".container");
      found = ctx.getElements(container, ".item");
    });
    mount(
      `<${tag}><div class="container"><span class="item">1</span><span class="item">2</span></div></${tag}>`,
    );
    expect(found).toHaveLength(2);
  });
});

describe("consume", () => {
  it("finds nearest ancestor", () => {
    const parentTag = uniqueTag("parent");
    const childTag = uniqueTag("child");
    const ParentComponent = define(parentTag, () => ({ kind: "parent" }));
    let consumed: InstanceType<typeof ParentComponent> | undefined;
    define(childTag, (ctx) => {
      consumed = ctx.consume(ParentComponent);
    });
    mount(`<${parentTag}><${childTag}></${childTag}></${parentTag}>`);
    expect(consumed).toBeDefined();
    expect(consumed!.kind).toBe("parent");
  });

  it("throws when no ancestor", () => {
    const parentTag = uniqueTag("parent");
    const childTag = uniqueTag("child");
    const ParentComponent = define(parentTag, () => {});
    define(childTag, (ctx) => {
      ctx.consume(ParentComponent);
    });
    expect(() => mount(`<${childTag}></${childTag}>`)).toThrow(/no ancestor/);
  });

  it("skips non-matching ancestors (picks nearest)", () => {
    const grandparent = uniqueTag("gp");
    const parent = uniqueTag("par");
    const child = uniqueTag("ch");
    define(grandparent, () => ({ level: "grandparent" }));
    const ParentComponent = define(parent, () => ({ level: "parent" }));
    let consumed: any;
    define(child, (ctx) => {
      consumed = ctx.consume(ParentComponent);
    });
    mount(`<${grandparent}><${parent}><${child}></${child}></${parent}></${grandparent}>`);
    expect((consumed as any).level).toBe("parent");
  });
});

describe("effect", () => {
  it("single store: immediate + on change", () => {
    const tag = uniqueTag("eff");
    const $store = atom(10);
    const spy = vi.fn();
    define(tag, (ctx) => {
      ctx.effect($store, spy);
    });
    mount(`<${tag}></${tag}>`);
    expect(spy).toHaveBeenCalledWith(10);
    $store.set(20);
    expect(spy).toHaveBeenCalledWith(20);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("multi-store: invoked with all values", () => {
    const tag = uniqueTag("eff");
    const $a = atom(1);
    const $b = atom("x");
    const spy = vi.fn();
    define(tag, (ctx) => {
      ctx.effect([$a, $b], spy);
    });
    mount(`<${tag}></${tag}>`);
    expect(spy).toHaveBeenCalledWith(1, "x");
    $a.set(2);
    expect(spy).toHaveBeenCalledWith(2, "x");
  });

  it("cleaned on disconnect", () => {
    const tag = uniqueTag("eff");
    const $store = atom(0);
    const spy = vi.fn();
    define(tag, (ctx) => {
      ctx.effect($store, spy);
    });
    const el = mount(`<${tag}></${tag}>`);
    el.remove();
    $store.set(99);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("bind", () => {
  it("external store → prop store", () => {
    const tag = uniqueTag("bind");
    const $ext = atom("hello");
    const Component = define(tag)
      .withProps((p) => ({ val: p.string() }))
      .setup((ctx) => {
        ctx.bind("val", $ext);
      });
    const el = mount<InstanceType<typeof Component>>(`<${tag}></${tag}>`);
    expect(el.props.$val.get()).toBe("hello");
  });

  it("prop store → external store", () => {
    const tag = uniqueTag("bind");
    const $ext = atom("init");
    define(tag)
      .withProps((p) => ({ val: p.string() }))
      .setup((ctx) => {
        ctx.bind("val", $ext);
      });
    const el = mount(`<${tag}></${tag}>`);
    el.setAttribute("val", "changed");
    expect($ext.get()).toBe("changed");
  });

  it("Object.is guard prevents infinite loop", () => {
    const tag = uniqueTag("bind");
    const $ext = atom("same");
    const spy = vi.fn();
    define(tag)
      .withProps((p) => ({ val: p.string() }))
      .setup((ctx) => {
        ctx.bind("val", $ext);
        ctx.effect(ctx.props.$val, spy);
      });
    mount(`<${tag} val="same"></${tag}>`);
    const callCount = spy.mock.calls.length;
    $ext.set("same");
    expect(spy.mock.calls.length).toBe(callCount);
  });

  it("get/set transforms applied", () => {
    const tag = uniqueTag("bind");
    const $ext = atom(42);
    const Component = define(tag)
      .withProps((p) => ({ val: p.string() }))
      .setup((ctx) => {
        ctx.bind("val", $ext, {
          get: (n) => String(n),
          set: (s) => Number(s),
        });
      });
    const el = mount<InstanceType<typeof Component>>(`<${tag}></${tag}>`);
    expect(el.props.$val.get()).toBe("42");
    el.props.$val.set("100");
    expect($ext.get()).toBe(100);
  });

  it("throws when binding unknown prop", () => {
    const tag = uniqueTag("bind");
    const $ext = atom("x");
    define(tag)
      .withProps((p) => ({ val: p.string() }))
      .setup((ctx) => {
        (ctx as any).bind("nope", $ext);
      });
    expect(() => mount(`<${tag}></${tag}>`)).toThrow(/unknown prop/);
  });

  it("same value: no extra propagation", () => {
    const tag = uniqueTag("bind");
    const $ext = atom("v");
    const extSpy = vi.fn();
    define(tag)
      .withProps((p) => ({ val: p.string() }))
      .setup((ctx) => {
        ctx.bind("val", $ext);
      });
    mount(`<${tag} val="v"></${tag}>`);
    $ext.listen(extSpy);
    $ext.set("v");
    expect(extSpy).not.toHaveBeenCalled();
  });
});

describe("render", () => {
  it("clones template by name", () => {
    const tag = uniqueTag("rnd");
    let fragment: DocumentFragment | undefined;
    define(tag, (ctx) => {
      fragment = ctx.render("item");
    });
    mount(`<${tag}><template name="item"><span class="tpl">hello</span></template></${tag}>`);
    expect(fragment).toBeDefined();
    expect(fragment?.querySelector(".tpl")?.textContent).toBe("hello");
  });

  it("throws on missing template", () => {
    const tag = uniqueTag("rnd");
    define(tag, (ctx) => {
      ctx.render("nope");
    });
    expect(() => mount(`<${tag}></${tag}>`)).toThrow(/missing/);
  });

  it("fill function called with data", () => {
    const tag = uniqueTag("rnd");
    let fragment: DocumentFragment | undefined;
    define(tag, (ctx) => {
      fragment = ctx.render("card", { title: "Hi" }, (tpl, data) => {
        tpl.querySelector(".title")!.textContent = data.title;
      });
    });
    mount(`<${tag}><template name="card"><div class="title"></div></template></${tag}>`);
    expect(fragment?.querySelector(".title")?.textContent).toBe("Hi");
  });
});

describe("renderList", () => {
  it("one clone per item, correct order", () => {
    const tag = uniqueTag("rl");
    let fragment: DocumentFragment | undefined;
    define(tag, (ctx) => {
      fragment = ctx.renderList("row", ["a", "b", "c"], (tpl, item) => {
        tpl.querySelector(".val")!.textContent = item;
      });
    });
    mount(`<${tag}><template name="row"><span class="val"></span></template></${tag}>`);
    const spans = Array.from(fragment?.querySelectorAll(".val") ?? []);
    expect(spans).toHaveLength(3);
    expect(spans[0]?.textContent).toBe("a");
    expect(spans[1]?.textContent).toBe("b");
    expect(spans[2]?.textContent).toBe("c");
  });

  it("index passed correctly", () => {
    const tag = uniqueTag("rl");
    const indices: number[] = [];
    define(tag, (ctx) => {
      ctx.renderList("row", ["x", "y"], (_tpl, _item, i) => indices.push(i));
    });
    mount(`<${tag}><template name="row"><span></span></template></${tag}>`);
    expect(indices).toEqual([0, 1]);
  });

  it("empty items → empty fragment", () => {
    const tag = uniqueTag("rl");
    let fragment: DocumentFragment | undefined;
    define(tag, (ctx) => {
      fragment = ctx.renderList("row", [], () => {});
    });
    mount(`<${tag}><template name="row"><span></span></template></${tag}>`);
    expect(fragment?.childNodes).toHaveLength(0);
  });
});
