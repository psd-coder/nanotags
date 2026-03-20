import { afterEach, describe, expect, it, vi } from "vitest";

import { deferSetups, flushSetups } from "./defer";
import { createComponent } from "./factory";
import { cleanup, uniqueTag } from "../tests/utils";

const Q = Symbol.for("nano-wc.q");

afterEach(() => {
  delete (globalThis as any)[Q];
  cleanup();
});

describe("deferSetups / flushSetups", () => {
  it("deferSetups queues connectedCallback, setup doesn't run", () => {
    const tag = uniqueTag("defer");
    const setup = vi.fn();
    createComponent(tag, {}, {}, setup);

    deferSetups();
    const el = document.createElement(tag);
    document.body.append(el);

    expect(setup).not.toHaveBeenCalled();
  });

  it("flushSetups runs queued setups in DOM order (parent before child)", () => {
    const order: string[] = [];
    const parentTag = uniqueTag("parent");
    const childTag = uniqueTag("child");

    createComponent(parentTag, {}, {}, () => {
      order.push("parent");
    });
    createComponent(childTag, {}, {}, () => {
      order.push("child");
    });

    deferSetups();

    document.body.innerHTML = `<${parentTag}><${childTag}></${childTag}></${parentTag}>`;

    expect(order).toEqual([]);
    flushSetups();
    expect(order).toEqual(["parent", "child"]);
  });

  it("disconnected elements skipped during flush", () => {
    const tag = uniqueTag("disc");
    const setup = vi.fn();
    createComponent(tag, {}, {}, setup);

    deferSetups();
    const el = document.createElement(tag);
    document.body.append(el);
    el.remove();

    flushSetups();
    expect(setup).not.toHaveBeenCalled();
  });

  it("after flush, new connections run immediately", () => {
    const tag = uniqueTag("imm");
    const setup = vi.fn();
    createComponent(tag, {}, {}, setup);

    deferSetups();
    flushSetups();

    const el = document.createElement(tag);
    document.body.append(el);
    expect(setup).toHaveBeenCalledOnce();
  });

  it("multiple components with nesting depth > 2 flush in correct order", () => {
    const order: string[] = [];
    const grandparentTag = uniqueTag("gp");
    const parentTag = uniqueTag("par");
    const childTag = uniqueTag("ch");

    createComponent(grandparentTag, {}, {}, () => {
      order.push("grandparent");
    });
    createComponent(parentTag, {}, {}, () => {
      order.push("parent");
    });
    createComponent(childTag, {}, {}, () => {
      order.push("child");
    });

    deferSetups();
    document.body.innerHTML = `<${grandparentTag}><${parentTag}><${childTag}></${childTag}></${parentTag}></${grandparentTag}>`;

    flushSetups();
    expect(order).toEqual(["grandparent", "parent", "child"]);
  });

  it("multiple defers before flush accumulate into one queue", () => {
    const order: string[] = [];
    const tag1 = uniqueTag("acc1");
    const tag2 = uniqueTag("acc2");

    createComponent(tag1, {}, {}, () => {
      order.push("first");
    });
    createComponent(tag2, {}, {}, () => {
      order.push("second");
    });

    deferSetups();
    const el1 = document.createElement(tag1);
    document.body.append(el1);

    deferSetups();
    const el2 = document.createElement(tag2);
    document.body.append(el2);

    flushSetups();
    expect(order).toEqual(["first", "second"]);
  });

  it("flushSetups is no-op when no deferSetups was called", () => {
    expect(() => flushSetups()).not.toThrow();
  });
});
