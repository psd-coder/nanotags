import { afterEach, describe, expect, it, vi } from "vitest";
import { atom } from "nanostores";

import { createContext } from "./context";
import { createComponent } from "./factory";
import { cleanup, mount, uniqueTag } from "../tests/utils";

afterEach(cleanup);

describe("createContext", () => {
  it("returns object with provide and consume methods", () => {
    const ctx = createContext<string>("test");
    expect(typeof ctx.provide).toBe("function");
    expect(typeof ctx.consume).toBe("function");
  });
});

describe("provide + consume", () => {
  it("consumer receives value synchronously when provider is ancestor", () => {
    const parentTag = uniqueTag("prov");
    const childTag = uniqueTag("cons");

    type API = { greet: () => string };
    const ctx = createContext<API>("test");

    createComponent(parentTag, {}, {}, (setupCtx) => {
      ctx.provide(setupCtx, { greet: () => "hello" });
    });

    let received: API | undefined;
    createComponent(childTag, {}, {}, (setupCtx) => {
      ctx.consume(setupCtx, (api) => {
        received = api;
      });
    });

    mount(`<${parentTag}><${childTag}></${childTag}></${parentTag}>`);
    expect(received).toBeDefined();
    expect(received!.greet()).toBe("hello");
  });

  it("callback receives reactive stores within the value", () => {
    const parentTag = uniqueTag("prov");
    const childTag = uniqueTag("cons");

    type API = { $count: ReturnType<typeof atom<number>> };
    const ctx = createContext<API>("reactive");

    const $count = atom(0);
    createComponent(parentTag, {}, {}, (setupCtx) => {
      ctx.provide(setupCtx, { $count });
    });

    let store: ReturnType<typeof atom<number>> | undefined;
    createComponent(childTag, {}, {}, (setupCtx) => {
      ctx.consume(setupCtx, (api) => {
        store = api.$count;
      });
    });

    mount(`<${parentTag}><${childTag}></${childTag}></${parentTag}>`);
    expect(store).toBeDefined();
    expect(store!.get()).toBe(0);
    $count.set(42);
    expect(store!.get()).toBe(42);
  });

  it("nearest provider wins with nested providers", () => {
    const outerTag = uniqueTag("outer");
    const innerTag = uniqueTag("inner");
    const childTag = uniqueTag("child");

    const ctx = createContext<string>("nested");

    createComponent(outerTag, {}, {}, (setupCtx) => {
      ctx.provide(setupCtx, "outer");
    });
    createComponent(innerTag, {}, {}, (setupCtx) => {
      ctx.provide(setupCtx, "inner");
    });

    let received: string | undefined;
    createComponent(childTag, {}, {}, (setupCtx) => {
      ctx.consume(setupCtx, (value) => {
        received = value;
      });
    });

    mount(`<${outerTag}><${innerTag}><${childTag}></${childTag}></${innerTag}></${outerTag}>`);
    expect(received).toBe("inner");
  });

  it("different context keys don't cross-match", () => {
    const parentTag = uniqueTag("prov");
    const childTag = uniqueTag("cons");

    const ctx1 = createContext<string>("ctx1");
    const ctx2 = createContext<string>("ctx2");

    createComponent(parentTag, {}, {}, (setupCtx) => {
      ctx1.provide(setupCtx, "value1");
    });

    let received: string | undefined;
    createComponent(childTag, {}, {}, (setupCtx) => {
      ctx2.consume(setupCtx, (value) => {
        received = value;
      });
    });

    mount(`<${parentTag}><${childTag}></${childTag}></${parentTag}>`);
    expect(received).toBeUndefined();
  });

  it("multiple consumers for same context", () => {
    const parentTag = uniqueTag("prov");
    const child1Tag = uniqueTag("c1");
    const child2Tag = uniqueTag("c2");

    const ctx = createContext<string>("shared");

    createComponent(parentTag, {}, {}, (setupCtx) => {
      ctx.provide(setupCtx, "shared-value");
    });

    let r1: string | undefined;
    let r2: string | undefined;
    createComponent(child1Tag, {}, {}, (setupCtx) => {
      ctx.consume(setupCtx, (v) => {
        r1 = v;
      });
    });
    createComponent(child2Tag, {}, {}, (setupCtx) => {
      ctx.consume(setupCtx, (v) => {
        r2 = v;
      });
    });

    mount(
      `<${parentTag}><${child1Tag}></${child1Tag}><${child2Tag}></${child2Tag}></${parentTag}>`,
    );
    expect(r1).toBe("shared-value");
    expect(r2).toBe("shared-value");
  });

  it("consumer without provider warns after microtask", async () => {
    const tag = uniqueTag("orphan");
    const ctx = createContext<string>("orphan-ctx");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    createComponent(tag, {}, {}, (setupCtx) => {
      ctx.consume(setupCtx, () => {});
    });

    mount(`<${tag}></${tag}>`);
    expect(warn).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain("no provider");
    warn.mockRestore();
  });

  it("no warning when provider is present", async () => {
    const parentTag = uniqueTag("prov");
    const childTag = uniqueTag("cons");
    const ctx = createContext<string>("ok");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    createComponent(parentTag, {}, {}, (setupCtx) => {
      ctx.provide(setupCtx, "val");
    });
    createComponent(childTag, {}, {}, (setupCtx) => {
      ctx.consume(setupCtx, () => {});
    });

    mount(`<${parentTag}><${childTag}></${childTag}></${parentTag}>`);
    await Promise.resolve();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("late provider", () => {
  it("consumer receives value when provider upgrades later", () => {
    const parentTag = uniqueTag("late-prov");
    const childTag = uniqueTag("late-cons");

    const ctx = createContext<string>("late");

    let received: string | undefined;
    createComponent(childTag, {}, {}, (setupCtx) => {
      ctx.consume(setupCtx, (value) => {
        received = value;
      });
    });

    // Mount with parent undefined — child connects, parent stays as unknown element
    document.body.innerHTML = `<${parentTag}><${childTag}></${childTag}></${parentTag}>`;
    expect(received).toBeUndefined();

    // Now define parent — triggers upgrade + provide
    createComponent(parentTag, {}, {}, (setupCtx) => {
      ctx.provide(setupCtx, "late-value");
    });
    customElements.upgrade(document.body.querySelector(parentTag)!);

    expect(received).toBe("late-value");
  });

  it("consumer disconnect before resolution cleans up pending", () => {
    const parentTag = uniqueTag("late-prov2");
    const childTag = uniqueTag("late-cons2");

    const ctx = createContext<string>("cleanup");
    const callback = vi.fn();

    createComponent(childTag, {}, {}, (setupCtx) => {
      ctx.consume(setupCtx, callback);
    });

    // Mount with parent undefined
    document.body.innerHTML = `<${parentTag}><${childTag}></${childTag}></${parentTag}>`;
    expect(callback).not.toHaveBeenCalled();

    // Remove child before provider connects
    document.body.querySelector(childTag)!.remove();

    // Now define parent — child is disconnected, callback should not fire
    createComponent(parentTag, {}, {}, (setupCtx) => {
      ctx.provide(setupCtx, "too-late");
    });
    customElements.upgrade(document.body.querySelector(parentTag)!);

    expect(callback).not.toHaveBeenCalled();
  });

  it("provider reconnect resolves new consumers", () => {
    const parentTag = uniqueTag("reconn-prov");
    const childTag = uniqueTag("reconn-cons");

    const ctx = createContext<string>("reconnect");

    createComponent(parentTag, {}, {}, (setupCtx) => {
      ctx.provide(setupCtx, "reconnected");
    });

    let received: string | undefined;
    createComponent(childTag, {}, {}, (setupCtx) => {
      ctx.consume(setupCtx, (v) => {
        received = v;
      });
    });

    // Mount, disconnect, re-mount
    const html = `<${parentTag}><${childTag}></${childTag}></${parentTag}>`;
    mount(html);
    expect(received).toBe("reconnected");

    // Remove and re-add
    received = undefined;
    document.body.innerHTML = "";
    document.body.innerHTML = html;
    expect(received).toBe("reconnected");
  });
});
