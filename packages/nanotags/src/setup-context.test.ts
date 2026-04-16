import { atom, type WritableAtom } from "nanostores";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { define } from "./define";
import type { SetupContext } from "./setup-context";
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
    document.body.append(el);
    el.remove();
    expect(calls).toEqual(["cleanup-0", "cleanup-1"]);
  });

  it("SetupContext exposes ctx API and omits HTMLElement members", () => {
    // oxlint-disable-next-line typescript-eslint/no-empty-object-type
    type Ctx = SetupContext<{}, {}>;
    expectTypeOf<Ctx>().toHaveProperty("props");
    expectTypeOf<Ctx>().toHaveProperty("refs");
    expectTypeOf<Ctx>().toHaveProperty("host");
    expectTypeOf<Ctx>().toHaveProperty("on");
    expectTypeOf<Ctx>().toHaveProperty("emit");
    expectTypeOf<Ctx>().toHaveProperty("effect");
    expectTypeOf<Ctx>().toHaveProperty("bind");
    expectTypeOf<Ctx>().toHaveProperty("onCleanup");
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

  it("emit(name, detail) creates bubbling CustomEvent", () => {
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

  it("accepts custom element type via generic", () => {
    type CustomEl = HTMLElement & { custom: true };
    const tag = uniqueTag("ge");
    define(tag, (ctx) => {
      const single = ctx.getElement<CustomEl>(".item");
      expectTypeOf(single).toEqualTypeOf<CustomEl>();

      const list = ctx.getElements<CustomEl>(".item");
      expectTypeOf(list).toEqualTypeOf<CustomEl[]>();

      const container = ctx.getElement(".container");
      const scoped = ctx.getElement<CustomEl>(container, ".item");
      expectTypeOf(scoped).toEqualTypeOf<CustomEl>();

      const scopedList = ctx.getElements<CustomEl>(container, ".item");
      expectTypeOf(scopedList).toEqualTypeOf<CustomEl[]>();
    });
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
  it("input[type=text]: control input → store", () => {
    const tag = uniqueTag("bind");
    const $val = atom("");
    define(tag, (ctx) => {
      const input = ctx.getElement("input");
      ctx.bind($val, input);
    });
    const el = mount(`<${tag}><input type="text" /></${tag}>`);
    const input = el.querySelector("input")!;
    input.value = "hello";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect($val.get()).toBe("hello");
  });

  it("input[type=text]: store set → control.value", () => {
    const tag = uniqueTag("bind");
    const $val = atom("initial");
    define(tag, (ctx) => {
      const input = ctx.getElement("input");
      ctx.bind($val, input);
    });
    const el = mount(`<${tag}><input type="text" /></${tag}>`);
    const input = el.querySelector("input")!;
    expect(input.value).toBe("initial");
    $val.set("updated");
    expect(input.value).toBe("updated");
  });

  it("input[type=number]: reads .valueAsNumber", () => {
    const tag = uniqueTag("bind");
    const $val = atom(0);
    define(tag, (ctx) => {
      const input = ctx.getElement("input");
      ctx.bind($val, input);
    });
    const el = mount(`<${tag}><input type="number" /></${tag}>`);
    const input = el.querySelector("input")!;
    input.value = "42";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect($val.get()).toBe(42);
  });

  it("input[type=number]: store set → control.value", () => {
    const tag = uniqueTag("bind");
    const $val = atom(7);
    define(tag, (ctx) => {
      const input = ctx.getElement("input");
      ctx.bind($val, input);
    });
    const el = mount(`<${tag}><input type="number" /></${tag}>`);
    const input = el.querySelector("input")!;
    expect(input.valueAsNumber).toBe(7);
    $val.set(99);
    expect(input.valueAsNumber).toBe(99);
  });

  it("input[type=range]: reads .valueAsNumber", () => {
    const tag = uniqueTag("bind");
    const $val = atom(1);
    define(tag, (ctx) => {
      const input = ctx.getElement("input");
      ctx.bind($val, input);
    });
    const el = mount(`<${tag}><input type="range" min="1" max="50" /></${tag}>`);
    const input = el.querySelector("input")!;
    input.value = "25";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect($val.get()).toBe(25);
  });

  it("input[type=range]: store set → control.value", () => {
    const tag = uniqueTag("bind");
    const $val = atom(10);
    define(tag, (ctx) => {
      const input = ctx.getElement("input");
      ctx.bind($val, input);
    });
    const el = mount(`<${tag}><input type="range" min="1" max="50" /></${tag}>`);
    const input = el.querySelector("input")!;
    expect(input.valueAsNumber).toBe(10);
    $val.set(30);
    expect(input.valueAsNumber).toBe(30);
  });

  it("input[type=checkbox]: toggle → store (boolean)", () => {
    const tag = uniqueTag("bind");
    const $checked = atom(false);
    define(tag, (ctx) => {
      const input = ctx.getElement("input");
      ctx.bind($checked, input);
    });
    const el = mount(`<${tag}><input type="checkbox" /></${tag}>`);
    const input = el.querySelector("input")!;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect($checked.get()).toBe(true);
  });

  it("input[type=checkbox]: store set → .checked", () => {
    const tag = uniqueTag("bind");
    const $checked = atom(true);
    define(tag, (ctx) => {
      const input = ctx.getElement("input");
      ctx.bind($checked, input);
    });
    const el = mount(`<${tag}><input type="checkbox" /></${tag}>`);
    const input = el.querySelector("input")!;
    expect(input.checked).toBe(true);
    $checked.set(false);
    expect(input.checked).toBe(false);
  });

  it("select: change → store", () => {
    const tag = uniqueTag("bind");
    const $val = atom("a");
    define(tag, (ctx) => {
      const select = ctx.getElement("select");
      ctx.bind($val, select);
    });
    const el = mount(
      `<${tag}><select><option value="a">A</option><option value="b">B</option></select></${tag}>`,
    );
    const select = el.querySelector("select")!;
    select.value = "b";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect($val.get()).toBe("b");
  });

  it("select: store set → .value", () => {
    const tag = uniqueTag("bind");
    const $val = atom("b");
    define(tag, (ctx) => {
      const select = ctx.getElement("select");
      ctx.bind($val, select);
    });
    const el = mount(
      `<${tag}><select><option value="a">A</option><option value="b">B</option></select></${tag}>`,
    );
    const select = el.querySelector("select")!;
    expect(select.value).toBe("b");
  });

  it("textarea: input → store", () => {
    const tag = uniqueTag("bind");
    const $val = atom("");
    define(tag, (ctx) => {
      const textarea = ctx.getElement("textarea");
      ctx.bind($val, textarea);
    });
    const el = mount(`<${tag}><textarea></textarea></${tag}>`);
    const textarea = el.querySelector("textarea")!;
    textarea.value = "hello";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    expect($val.get()).toBe("hello");
  });

  it("textarea: store set → .value", () => {
    const tag = uniqueTag("bind");
    const $val = atom("prefilled");
    define(tag, (ctx) => {
      const textarea = ctx.getElement("textarea");
      ctx.bind($val, textarea);
    });
    const el = mount(`<${tag}><textarea></textarea></${tag}>`);
    const textarea = el.querySelector("textarea")!;
    expect(textarea.value).toBe("prefilled");
  });

  it("initial value from store applied to control on bind", () => {
    const tag = uniqueTag("bind");
    const $val = atom("from-store");
    define(tag, (ctx) => {
      const input = ctx.getElement("input");
      ctx.bind($val, input);
    });
    const el = mount(`<${tag}><input type="text" value="from-html" /></${tag}>`);
    const input = el.querySelector("input")!;
    expect(input.value).toBe("from-store");
  });

  it("Object.is guard prevents loops", () => {
    const tag = uniqueTag("bind");
    const $val = atom("same");
    const spy = vi.fn();
    define(tag, (ctx) => {
      const input = ctx.getElement("input");
      ctx.bind($val, input);
    });
    mount(`<${tag}><input type="text" /></${tag}>`);
    $val.listen(spy);
    $val.set("same");
    expect(spy).not.toHaveBeenCalled();
  });

  it("custom element with .value prop + change event", () => {
    const controlTag = uniqueTag("ctrl");
    define(controlTag)
      .withProps((p) => ({ value: p.string("init") }))
      .setup(() => {});
    const tag = uniqueTag("bind");
    const $val = atom("from-store");
    define(tag, (ctx) => {
      const ctrl = ctx.getElement(controlTag) as HTMLElement & { value: string };
      ctx.bind($val, ctrl);
    });
    const el = mount(`<${tag}><${controlTag}></${controlTag}></${tag}>`);
    const ctrl = el.querySelector(controlTag)! as HTMLElement & { value: string };
    expect(ctrl.value).toBe("from-store");
    ctrl.value = "user-input";
    ctrl.dispatchEvent(new Event("change", { bubbles: true }));
    expect($val.get()).toBe("user-input");
    $val.set("programmatic");
    expect(ctrl.value).toBe("programmatic");
  });

  it("works with not-yet-upgraded custom element child", () => {
    const childTag = uniqueTag("bind-child");
    const parentTag = uniqueTag("bind-parent");
    const $val = atom("from-parent");
    define(parentTag, (ctx) => {
      const child = ctx.getElement<HTMLElement>(childTag);
      ctx.bind($val, child, { prop: "value", event: "change" });
    });
    const el = mount(`<${parentTag}><${childTag}></${childTag}></${parentTag}>`);
    const child = el.querySelector(childTag)! as HTMLElement & { value: string };
    // Before child upgrade, value is set as plain property
    expect(child.value).toBe("from-parent");
    // Define and upgrade child
    define(childTag)
      .withProps((p) => ({ value: p.string("default") }))
      .setup(() => {});
    customElements.upgrade(child);
    // Store update propagates through accessor
    $val.set("updated");
    expect(child.value).toBe("updated");
  });

  it("one-way bind with { prop }: store→el, no event listener", () => {
    const tag = uniqueTag("bind");
    const $theme = atom("dark");
    define(tag, (ctx) => {
      ctx.bind($theme, ctx.host, { prop: "title" });
    });
    const el = mount(`<${tag}></${tag}>`);
    expect(el.title).toBe("dark");
    $theme.set("light");
    expect(el.title).toBe("light");
    // No event listener, changing title and dispatching change shouldn't update store
    el.title = "manual";
    el.dispatchEvent(new Event("change", { bubbles: true }));
    expect($theme.get()).toBe("light");
  });

  it("two-way bind with { prop, event }: custom element", () => {
    const controlTag = uniqueTag("ctrl");
    define(controlTag)
      .withProps((p) => ({ theme: p.string("default") }))
      .setup((ctx) => {
        ctx.effect(ctx.props.$theme, () => ctx.emit("change"));
      });
    const tag = uniqueTag("bind");
    const $theme = atom("dark");
    define(tag, (ctx) => {
      const ctrl = ctx.getElement<HTMLElement>(controlTag);
      ctx.bind($theme, ctrl, { prop: "theme", event: "change" });
    });
    const el = mount(`<${tag}><${controlTag}></${controlTag}></${tag}>`);
    const ctrl = el.querySelector(controlTag)! as any;
    expect(ctrl.theme).toBe("dark");
    ctrl.theme = "light";
    ctrl.dispatchEvent(new Event("change", { bubbles: true }));
    expect($theme.get()).toBe("light");
    $theme.set("blue");
    expect(ctrl.theme).toBe("blue");
  });

  it("options override native defaults", () => {
    const tag = uniqueTag("bind");
    const $val = atom("test");
    define(tag, (ctx) => {
      const input = ctx.getElement("input");
      ctx.bind($val, input, { prop: "value", event: "change" });
    });
    const el = mount(`<${tag}><input type="text" /></${tag}>`);
    const input = el.querySelector("input")!;
    expect(input.value).toBe("test");
    input.value = "changed";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect($val.get()).toBe("test");
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect($val.get()).toBe("changed");
  });

  it.skipIf(true)("rejects custom element without .value at type level", () => {
    // oxlint-disable-next-line typescript-eslint/no-empty-object-type
    const ctx = {} as SetupContext<{}, {}>;
    const plain = {} as HTMLDivElement;
    // @ts-expect-error - HTMLDivElement has no .value, should not match overloads 1-2; overload 3 requires opts
    ctx.bind(atom(""), plain);
  });

  it.skipIf(true)("accepts arbitrary element with BindOptions at type level", () => {
    // oxlint-disable-next-line typescript-eslint/no-empty-object-type
    const ctx = {} as SetupContext<{}, {}>;
    const el = {} as HTMLElement;
    ctx.bind(atom("x"), el, { prop: "theme" });
  });

  it.skipIf(true)("accepts store with narrower type than control value", () => {
    // oxlint-disable-next-line typescript-eslint/no-empty-object-type
    const ctx = {} as SetupContext<{}, {}>;
    const $narrow = atom("light") as WritableAtom<"light" | "dark">;
    const ctrl = {} as HTMLElement & { value: string };
    ctx.bind($narrow, ctrl);
  });

  it.skipIf(true)("rejects store with wider type than control value", () => {
    // oxlint-disable-next-line typescript-eslint/no-empty-object-type
    const ctx = {} as SetupContext<{}, {}>;
    const $wide = atom("") as WritableAtom<string>;
    const ctrl = {} as HTMLElement & { value: "light" | "dark" };
    // @ts-expect-error - string does not extend "light" | "dark"
    ctx.bind($wide, ctrl);
  });
});
