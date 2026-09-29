import * as v from "valibot";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import { define } from "./index";
import { createContext } from "./context";
import {
  cleanup,
  connect,
  create,
  disconnect,
  h,
  mount,
  provideContext,
  ref,
  refs,
  stubElement,
  uniqueTag,
} from "./testing";

const Widget = define("t-widget")
  .withProps((p) => ({
    label: p.string("none"),
    size: p.oneOf(["sm", "lg"] as const, "sm"),
    disabled: p.boolean(false),
    itemCount: p.number(0),
    items: p.json(v.array(v.string()), []),
  }))
  .withRefs((r) => ({
    output: r.one("span"),
  }))
  .setup((ctx) => {
    const { output } = ctx.refs;

    ctx.effect([ctx.props.$label, ctx.props.$items], (label, items) => {
      output.textContent = `${label}:${items.length}`;
    });

    ctx.effect(ctx.props.$disabled, (disabled) => {
      ctx.host.setAttribute("aria-disabled", String(disabled));
    });

    return { seen: () => output.textContent };
  });

// Its attribute prop has no fallback, so it cannot be constructed without the attribute.
const Strict = define("t-strict")
  .withProps((p) => ({ label: v.string(), items: p.json(v.array(v.string()), []) }))
  .setup(() => {});

// Stands in for a child component: it owns whatever refs live inside it.
define("t-nested", () => {});

const List = define("t-list")
  .withRefs((r) => ({ rows: r.many("li") }))
  .setup((ctx) => ({ count: () => ctx.refs.rows.length }));

// Throws from its teardown, the way a component with a broken onCleanup does.
const BOOM = uniqueTag("boom");
define(BOOM).setup((ctx) => {
  ctx.onCleanup(() => {
    throw new Error("boom");
  });
});

declare global {
  interface HTMLElementTagNameMap {
    "t-widget": InstanceType<typeof Widget>;
    "t-list": InstanceType<typeof List>;
  }
}

const MARKUP = h("span", { "data-ref": "output" });

const HAPPY_DOM = navigator.userAgent.includes("HappyDOM");

afterEach(cleanup);

describe("h", () => {
  it("writes attribute props as attributes, kebab-cased so keys are named after the prop", () => {
    const host = mount(h(Widget, { itemCount: 3, "aria-busy": "true" }, MARKUP));

    expect(host.getAttribute("item-count")).toBe("3");
    expect(host.itemCount).toBe(3);
    // A key that is already kebab-case is left alone.
    expect(host.getAttribute("aria-busy")).toBe("true");
  });

  it("skips undefined, null and false attributes so optional props need no branching", () => {
    const host = mount(h(Widget, { label: undefined, size: null, disabled: false }, MARKUP));

    expect(host.hasAttribute("label")).toBe(false);
    expect(host.hasAttribute("size")).toBe(false);
    expect(host.hasAttribute("disabled")).toBe(false);
    expect(host.label).toBe("none");
  });

  it("writes true as an empty boolean attribute and coerces numbers", () => {
    const host = mount(h(Widget, { disabled: true, label: 42 }, MARKUP));

    expect(host.getAttribute("disabled")).toBe("");
    expect(host.disabled).toBe(true);
    expect(host.label).toBe("42");
  });

  it("seeds json props as data-prop scripts", () => {
    const host = mount(h(Widget, { items: ["a", "b", "c"] }, MARKUP));

    expect(host.items).toEqual(["a", "b", "c"]);
    expect(host.seen()).toBe("none:3");
  });

  it("keeps a closing script tag in a json seed from ending the element", () => {
    const items = ["</script><b>not markup</b>"];
    const host = mount(h(Widget, { items }, MARKUP));

    expect(host.querySelector("b")).toBeNull();
    expect(host.items).toEqual(items);
  });

  it("skips an undefined json seed instead of writing invalid JSON", () => {
    const host = mount(h(Widget, { items: undefined }, MARKUP));

    expect(host.querySelector("script")).toBeNull();
    expect(host.items).toEqual([]);
  });

  it("escapes attribute values", () => {
    const title = `say "hi" & <leave>`;
    const markup = h("div", { title });

    expect(markup.html).not.toContain(`"hi"`);
    expect(mount(markup).title).toBe(title);
  });

  it("writes a plain element's attribute names as given", () => {
    const svg = mount(h("div", null, h("svg", { viewBox: "0 0 10 10" }))).firstElementChild!;

    expect(svg.getAttribute("viewBox")).toBe("0 0 10 10");
  });

  it("seeds a nested component rather than the host", () => {
    const section = mount(h("section", null, h(Widget, { items: ["a"] }, MARKUP)));
    const widget = section.querySelector("t-widget")!;

    expect(section.querySelector("script")!.parentElement).toBe(widget);
    expect(widget.items).toEqual(["a"]);
  });

  it("keeps the children of a template", () => {
    const tpl = mount(h("template", { "data-ref": "tpl" }, h("li")));

    expect((tpl as HTMLTemplateElement).content.querySelector("li")).not.toBeNull();
  });

  it("interpolates as its HTML inside a template literal", () => {
    mount(`<nav id="nav"></nav>${h(Widget, { label: "hi" }, MARKUP)}`);

    expect(document.querySelector("t-widget")!.label).toBe("hi");
  });

  it("names the tag that was never defined", () => {
    expect(() => h("t-nope")).toThrow(/h: <t-nope> is not defined/);
  });

  it("rejects a string that is not a tag name", () => {
    expect(() => h("not a tag")).toThrow(/h: "not a tag" is not a tag name/);
  });

  it("accepts the dots and underscores a custom element name may contain", () => {
    const Dotted = define(`${uniqueTag("dot")}.v_2`, () => {});

    expect(mount(h(Dotted))).toBeInstanceOf(Dotted);
  });

  // happy-dom runs a parsed component's constructor before its attributes land.
  it.skipIf(HAPPY_DOM)("seeds a component whose attribute prop has no fallback", () => {
    const host = mount(h(Strict, { label: "x", items: ["a"] }));

    expect(host.items).toEqual(["a"]);
  });

  it("rethrows when the component cannot be constructed", () => {
    expect(() => h(Strict, { items: ["a"] })).toThrow(/Prop "label": invalid value null/);
  });
});

describe("mount", () => {
  it("connects with children already present", () => {
    const host = mount(h(Widget, null, MARKUP));

    expect(host.seen()).toBe("none:0");
  });

  it("takes a bare tag name or constructor", () => {
    const Bare = define(uniqueTag("bare"), () => {});

    expect(mount("t-nested").isConnected).toBe(true);
    expect(mount(Bare)).toBeInstanceOf(Bare);
  });

  it("inserts surrounding markup and returns its first element", () => {
    const nav = mount(`<nav id="nav"></nav><section id="one"></section>`);

    expect(nav.id).toBe("nav");
    expect(document.querySelector("#one")).not.toBeNull();
  });

  it("appends to a given parent", () => {
    const section = mount(h("section"));
    const host = mount(h(Widget, null, MARKUP), section);

    expect(host.parentElement).toBe(section);
    expect(host.seen()).toBe("none:0");
  });

  it("surfaces a missing ref as the component's own error", () => {
    expect(() => mount(Widget)).toThrow(/Missing elements for refs "output"/);
  });

  it("names the tag that was never defined", () => {
    expect(() => mount("t-nope")).toThrow(/mount: <t-nope> is not defined/);
  });

  it("returns an SVG root", () => {
    const svg = mount<SVGSVGElement>(`<svg viewBox="0 0 10 10"></svg>`);

    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  it("throws a useful error for markup with no root element", () => {
    expect(() => mount("<!-- nothing here -->")).toThrow(/no root element/);
  });

  it("refuses a parent that is not in the document", () => {
    const detached = document.createElement("section");

    expect(() => mount(h(Widget, null, MARKUP), detached)).toThrow(/parent is not in the document/);
  });
});

describe("mount connects all of its markup at once", () => {
  const PROBE = uniqueTag("probe");
  define(PROBE).setup((ctx) => {
    ctx.host.dataset["sawLater"] = String(document.getElementById("later") !== null);
  });

  // happy-dom fires each root's connectedCallback as it inserts that root, where the DOM spec
  // (jsdom, browsers) holds every callback until the whole insertion is done.
  it.skipIf(HAPPY_DOM)("sets a component up with the siblings after it already in place", () => {
    const probe = mount(`<${PROBE}></${PROBE}><section id="later"></section>`);

    expect(probe.dataset["sawLater"]).toBe("true");
  });
});

describe("create", () => {
  it("leaves the host detached until connect", () => {
    const host = create(h(Widget, null, MARKUP));

    expect(host.isConnected).toBe(false);
    expect(host.seen).toBeUndefined();

    connect(host);

    expect(host.isConnected).toBe(true);
    expect(host.seen()).toBe("none:0");
  });

  it("captures what a setup writes to a peer stubbed before connect", () => {
    const Driver = define("t-driver")
      .withRefs((r) => ({ peer: r.one<HTMLElement & { open: boolean }>("div") }))
      .setup((ctx) => {
        ctx.refs.peer.open = false;
        ctx.on(ctx.host, "click", () => {
          ctx.refs.peer.open = true;
        });
      });

    const host = create(h(Driver, null, h("div", { "data-ref": "peer" })));
    const peer = stubElement(ref(host, "peer"), { open: false });
    connect(host);

    expect(peer.writes("open")).toEqual([false]);

    host.click();

    expect(peer.writes("open")).toEqual([false, true]);
  });

  it("keeps a stub on a nested defined component through connect", () => {
    const Peer = define("t-upgraded-peer")
      .withProps((p) => ({ open: p.boolean(false) }))
      .setup(() => {});
    const Host = define("t-upgraded-host")
      .withRefs((r) => ({ peer: r.one<InstanceType<typeof Peer>>("t-upgraded-peer") }))
      .setup((ctx) => {
        ctx.refs.peer.open = false;
      });

    const host = create(h(Host, null, h(Peer, { "data-ref": "peer" })));
    const el = ref(host, "peer");

    // Already upgraded while detached, so connecting cannot redefine the props over the stub.
    expect(el).toBeInstanceOf(Peer);

    const peer = stubElement(el, { open: true });
    connect(host);

    expect(peer.writes("open")).toEqual([false]);
    expect(el.open).toBe(false);
  });

  it("connects into the parent it is given", () => {
    const section = mount(h("section"));

    connect(create(h(Widget, null, MARKUP)), section);

    expect(section.querySelector("t-widget")).not.toBeNull();
  });

  it("requires exactly one root element", () => {
    expect(() => create(`<p></p><p></p>`)).toThrow(/exactly one root element/);
  });
});

describe("cleanup", () => {
  it("disconnects mounted hosts and stops their effects", () => {
    const host = mount(h(Widget, { label: "a" }, MARKUP));
    const output = host.querySelector("span")!;

    cleanup();
    host.label = "b";

    expect(host.isConnected).toBe(false);
    expect(output.textContent).toBe("a:0");
  });

  it("is idempotent", () => {
    mount(h(Widget, null, MARKUP));

    expect(() => {
      cleanup();
      cleanup();
    }).not.toThrow();
  });
});

describe("ref", () => {
  it("finds a ref by its bare name", () => {
    const host = mount(h(Widget, null, MARKUP));

    expect(ref(host, "output")).toBe(host.querySelector("span"));
  });

  it("finds a ref claimed across a nested custom element", () => {
    const host = mount(
      h(Widget, null, MARKUP, h("t-nested", null, h("b", { "data-ref": "t-widget:owned" }))),
    );

    expect(ref<HTMLElement>(host, "owned").tagName).toBe("B");
  });

  it("ignores a ref that belongs to a nested custom element", () => {
    const host = mount(
      h(Widget, null, MARKUP, h("t-nested", null, h("b", { "data-ref": "inner" }))),
    );

    expect(() => ref<HTMLElement>(host, "inner")).toThrow(/no element with data-ref="inner"/);
  });

  it("blames no context on a custom element that is not a component", () => {
    const tag = uniqueTag("plain");
    customElements.define(tag, class extends HTMLElement {});
    const host = mount(tag);

    expect(() => ref(host, "missing")).toThrow(
      new Error(`ref: no element with data-ref="missing" inside <${tag}>`),
    );
  });
});

describe("refs", () => {
  const LIST_MARKUP = h(
    "ul",
    null,
    ...["a", "b", "c"].map((t) => h("li", { "data-ref": "rows" }, t)),
  );

  it("returns every list ref in document order", () => {
    const host = mount(h(List, null, LIST_MARKUP));

    expect(refs(host, "rows").map((el) => el.textContent)).toEqual(["a", "b", "c"]);
    expect(refs(host, "rows")).toEqual([...host.querySelectorAll("li")]);
  });

  it("agrees with what the component itself collected", () => {
    const host = mount(h(List, null, LIST_MARKUP));

    expect(refs(host, "rows")).toHaveLength(host.count());
  });

  it("skips rows that belong to a nested custom element", () => {
    const host = mount(
      h(List, null, LIST_MARKUP, h("t-nested", null, h("li", { "data-ref": "rows" }, "nested"))),
    );

    expect(refs(host, "rows").map((el) => el.textContent)).toEqual(["a", "b", "c"]);
  });

  it("includes a row claimed across a nested custom element", () => {
    const host = mount(
      h(
        List,
        null,
        LIST_MARKUP,
        h("t-nested", null, h("li", { "data-ref": "t-list:rows" }, "claimed")),
      ),
    );

    expect(refs(host, "rows").map((el) => el.textContent)).toEqual(["a", "b", "c", "claimed"]);
  });

  it("throws when nothing matches, the way a list ref does at connect", () => {
    const host = mount(h(List, null, LIST_MARKUP));

    expect(() => refs<HTMLElement>(host, "missing")).toThrow(/no element with data-ref="missing"/);
  });
});

describe("provideContext", () => {
  const themeKey = createContext<{ theme: string }>("theme");

  const Consumer = define("t-consumer")
    .withContexts({ theme: themeKey })
    .setup((ctx) => {
      ctx.host.dataset["theme"] = ctx.contexts.theme.theme;
    });

  it("lets a consumer mount without its real provider", () => {
    const wrapper = mount(h("div"));
    provideContext(wrapper, themeKey, { theme: "dark" });

    const host = mount(Consumer, wrapper);

    expect(host.dataset["theme"]).toBe("dark");
  });

  it("resolves a consumer that mounted before the provider existed", () => {
    const wrapper = mount(h("div"));
    const host = mount(Consumer, wrapper);

    expect(host.dataset["theme"]).toBeUndefined();

    provideContext(wrapper, themeKey, { theme: "light" });

    expect(host.dataset["theme"]).toBe("light");
  });

  it("makes ref name the missing provider instead of reading a parked host", () => {
    const Labelled = define(uniqueTag("labelled"))
      .withContexts({ theme: themeKey })
      .withRefs((r) => ({ label: r.one("span") }))
      .setup(() => {});
    const wrapper = mount(h("div"));
    const host = mount(h(Labelled, null, h("span", { "data-ref": "label" })), wrapper);

    expect(() => ref(host, "label")).toThrow(/setup has not run.*provideContext/);

    provideContext(wrapper, themeKey, { theme: "dark" });

    expect(ref(host, "label").tagName).toBe("SPAN");
  });

  it("stops providing after cleanup", () => {
    const wrapper = mount(h("div"));
    provideContext(wrapper, themeKey, { theme: "dark" });
    cleanup();

    const survivor = document.createElement("div");
    document.body.append(survivor);
    const host = mount(Consumer, survivor);

    expect(host.dataset["theme"]).toBeUndefined();
    survivor.remove();
  });
});

describe("stubElement", () => {
  it("records writes made by a component to a stubbed peer", () => {
    // A real peer would be typed through HTMLElementTagNameMap; the element generic stands
    // in for that here.
    const Clicker = define("t-clicker")
      .withRefs((r) => ({ peer: r.one<HTMLElement & { open: boolean }>("div") }))
      .setup((ctx) => {
        ctx.on(ctx.host, "click", () => {
          ctx.refs.peer.open = true;
        });
      });

    const host = mount(h(Clicker, null, h("div", { "data-ref": "peer" })));
    const peer = stubElement(ref(host, "peer"), { open: false });

    host.click();

    expect(peer.get("open")).toBe(true);
    expect(peer.writes("open")).toEqual([true]);
  });

  it("reset drops recorded writes but keeps current values", () => {
    const stub = stubElement(document.createElement("div"), { open: false });

    stub.el.open = true;
    stub.reset();

    expect(stub.writes("open")).toEqual([]);
    expect(stub.get("open")).toBe(true);
  });

  it("records calls to a stubbed peer's methods", () => {
    type Peer = HTMLElement & { open(reason: string): void; isOpen: boolean };
    const Opener = define("t-opener")
      .withRefs((r) => ({ peer: r.one<Peer>("div") }))
      .setup((ctx) => {
        ctx.on(ctx.host, "click", () => {
          if (!ctx.refs.peer.isOpen) ctx.refs.peer.open("click");
        });
      });

    const host = mount(h(Opener, null, h("div", { "data-ref": "peer" })));
    const peer = stubElement(ref(host, "peer"), {
      isOpen: false,
      // The stub is the implementation too, so the peer can behave like the real thing.
      open(this: HTMLElement, _reason: string) {
        peer.el.isOpen = true;
      },
    });

    host.click();
    host.click();

    expect(peer.calls("open")).toEqual([["click"]]);
    expect(peer.get("isOpen")).toBe(true);
  });

  it("calls a stubbed method with the element as this", () => {
    const stub = stubElement(document.createElement("div"), {
      marked: false,
      mark(this: { marked: boolean }) {
        this.marked = true;
      },
    });

    stub.el.mark();

    // Written through the stubbed accessor, so `this` really is the element.
    expect(stub.get("marked")).toBe(true);
    expect(stub.writes("marked")).toEqual([true]);
  });

  it("stands in for the props of an element that is itself a defined component", () => {
    const Peer = define("t-peer")
      .withProps((p) => ({ open: p.boolean(false) }))
      .setup(() => {});
    const Host = define("t-stub-host")
      .withRefs((r) => ({ peer: r.one("t-peer") }))
      .setup((ctx) => {
        ctx.on(ctx.host, "click", () => {
          (ctx.refs.peer as InstanceType<typeof Peer>).open = true;
        });
      });

    const host = mount(h(Host, null, h("t-peer", { "data-ref": "peer" })));
    const peer = stubElement(ref(host, "peer"), { open: false });

    host.click();

    expect(peer.writes("open")).toEqual([true]);
  });

  it("stubs a method on a component that has set up", () => {
    const peer = mount(h(Widget, null, MARKUP));
    const stub = stubElement(peer, { seen: () => "stub" });

    expect(peer.seen()).toBe("stub");
    expect(stub.calls("seen")).toEqual([[]]);
  });

  it("refuses to stub a method its setup would replace", () => {
    const peer = create(h(Widget, null, MARKUP));

    expect(() => stubElement(peer, { seen: () => "stub" })).toThrow(
      /<t-widget> has not set up yet, and its setup would replace the stubbed "seen"/,
    );
  });

  it("reset drops recorded calls", () => {
    const stub = stubElement(document.createElement("div"), { close: () => {} });

    stub.el.close();
    stub.reset();

    expect(stub.calls("close")).toEqual([]);
  });
});

describe("cleanup when a teardown throws", () => {
  it("rethrows it after removing everything else", () => {
    mount(BOOM);
    const widget = mount(h(Widget, null, MARKUP));

    expect(() => cleanup()).toThrow("boom");
    expect(widget.isConnected).toBe(false);
    expect(() => cleanup()).not.toThrow();
  });

  it("reports several failing teardowns together", () => {
    mount(BOOM);
    mount(BOOM);

    let failure: unknown;
    try {
      cleanup();
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toHaveLength(2);
  });

  it("still undoes providers", () => {
    const themeKey = createContext<string>("cleanup-theme");
    const CONSUMER = uniqueTag("cleanup-consumer");
    define(CONSUMER)
      .withContexts({ theme: themeKey })
      .setup((ctx) => {
        ctx.host.dataset["theme"] = ctx.contexts.theme;
      });
    provideContext(document.body, themeKey, "dark");
    mount(BOOM);

    expect(() => cleanup()).toThrow("boom");
    const host = mount(CONSUMER);

    expect(host.dataset["theme"]).toBeUndefined();
  });
});

describe("disconnect", () => {
  it("rethrows a teardown error at the call site", () => {
    const host = mount(BOOM);

    expect(() => disconnect(host)).toThrow("boom");
    expect(host.isConnected).toBe(false);
  });

  it("stops the component's effects", () => {
    const host = mount(h(Widget, { label: "a" }, MARKUP));

    disconnect(host);
    host.label = "b";

    expect(ref(host, "output").textContent).toBe("a:0");
  });

  it("lets connect put the host back where it was, running setup again", () => {
    const section = mount(h("section"));
    const host = mount(h(Widget, { label: "a" }, MARKUP), section);

    disconnect(host);
    host.label = "b";
    connect(host);

    expect(host.parentElement).toBe(section);
    expect(ref(host, "output").textContent).toBe("b:0");
  });

  it("lets connect put the host back between its siblings", () => {
    const list = mount(h("ul", null, h("li", { id: "a" }), h("li", { id: "b" }), h("li")));
    const b = list.querySelector("#b")!;

    disconnect(b);
    connect(b);

    expect(list.children[1]).toBe(b);
  });
});

describe("uniqueTag", () => {
  it("gives a fresh, definable name on every call", () => {
    const first = uniqueTag("fixture");
    const second = uniqueTag("fixture");

    expect(first).not.toBe(second);
    expect(() => define(first).setup(() => {})).not.toThrow();
    expect(customElements.get(first)).toBeDefined();
  });
});

describe("selector refs", () => {
  const Stepper = define("t-stepper")
    .withRefs((r) => ({
      title: r.one<HTMLElement>("[data-title]"),
      steps: r.many<HTMLElement>("[data-step]"),
    }))
    .setup(() => {});
  const STEPPER_MARKUP = [
    h("h2", { "data-title": true }, "Title"),
    h("div", { "data-step": true }, "1"),
    h("div", { "data-step": true }, "2"),
  ];

  it("resolves refs declared with a selector once the host has set up", () => {
    const host = mount(h(Stepper, null, ...STEPPER_MARKUP));

    expect(ref(host, "title").textContent).toBe("Title");
    expect(refs(host, "steps").map((el) => el.textContent)).toEqual(["1", "2"]);
  });

  it("says why a selector ref is not found before setup", () => {
    const host = create(h(Stepper, null, ...STEPPER_MARKUP));

    expect(() => refs(host, "steps")).toThrow(/resolves once the host has set up/);
  });
});

describe("types", () => {
  it("types a ref from the component's own definition", () => {
    const host = mount(h("t-widget", null, MARKUP));

    expectTypeOf(ref(host, "output")).toEqualTypeOf<HTMLSpanElement>();
    // @ts-expect-error not one of t-widget's refs
    expect(() => ref(host, "outptu")).toThrow(/data-ref="outptu"/);
    const list = mount(h("t-list", null, h("li", { "data-ref": "rows" })));
    // @ts-expect-error a list ref goes through refs
    expect(() => ref(list, "rows")).not.toThrow();
  });

  it("types list refs through refs", () => {
    const host = mount(h("t-list", null, h("li", { "data-ref": "rows" })));

    expectTypeOf(refs(host, "rows")).toEqualTypeOf<HTMLLIElement[]>();
  });

  it("lets an explicit type argument opt out for markup the test owns", () => {
    const host = mount(h("t-widget", null, MARKUP, h("input", { "data-ref": "fixture" })));

    expectTypeOf(ref<HTMLInputElement>(host, "fixture")).toEqualTypeOf<HTMLInputElement>();
  });

  it("falls back to plain names on an element that is no component", () => {
    const plain = mount(h("div", null, h("b", { "data-ref": "x" })));

    expectTypeOf(ref(plain, "x")).toEqualTypeOf<HTMLElement>();
    expectTypeOf(refs(plain, "x")).toEqualTypeOf<HTMLElement[]>();
  });

  it("checks h props against the component's props", () => {
    const host = mount(
      h(
        "t-widget",
        { itemCount: 1, "data-test": "x", "aria-label": "widget", id: "w", items: ["a"] },
        MARKUP,
      ),
    );

    expectTypeOf(host).toEqualTypeOf<HTMLElementTagNameMap["t-widget"]>();
    expectTypeOf(create(h(Widget))).toEqualTypeOf<InstanceType<typeof Widget>>();

    // @ts-expect-error `labl` is not a prop
    h("t-widget", { labl: "x" });
    // @ts-expect-error an attribute takes a primitive
    h("t-widget", { label: { text: "x" } });
    // @ts-expect-error the seed does not match the schema
    expect(() => mount(h("t-widget", { items: [1] }, MARKUP))).toThrow(/items/);
  });

  it("keeps a prop that reads no seed out of h's props", () => {
    const Raw = define(uniqueTag("raw"))
      .withProps((p) => ({ note: { schema: p.string(""), attribute: false } }))
      .setup(() => {});

    // @ts-expect-error `note` reads its attribute, so a seed would never reach it
    h(Raw, { note: "x" });
  });

  it("types raw markup as a plain element", () => {
    expectTypeOf(mount(`<p></p>`)).toEqualTypeOf<HTMLElement>();
    expectTypeOf(mount(h("ul"))).toEqualTypeOf<HTMLUListElement>();
  });
});
