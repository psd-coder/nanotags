import { describe, expect, it } from "vitest";

import { render, renderList } from "./render";
import { createHostWith } from "../tests/utils";

function makeTpl(html: string): HTMLTemplateElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl;
}

describe("renderList", () => {
  it("creates elements from data", () => {
    const container = createHostWith("");
    const tpl = makeTpl('<span class="item"></span>');
    const data = [
      { id: 1, text: "a" },
      { id: 2, text: "b" },
    ];

    renderList(container, {
      template: tpl,
      data,
      getKey: (t) => t.id,
      update: (el, t) => {
        el.textContent = t.text;
      },
    });

    expect(container.children).toHaveLength(2);
    expect(container.children[0]?.textContent).toBe("a");
    expect(container.children[1]?.textContent).toBe("b");
  });

  it("updates existing elements without recreating", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");
    const opts = {
      template: tpl,
      data: [{ id: 1, text: "v1" }],
      getKey: (t: { id: number; text: string }) => t.id,
      update: (el: Element, t: { id: number; text: string }) => {
        el.textContent = t.text;
      },
    };

    renderList(container, opts);
    const firstEl = container.children[0]!;

    renderList(container, { ...opts, data: [{ id: 1, text: "v2" }] });
    expect(container.children[0]).toBe(firstEl);
    expect(firstEl.textContent).toBe("v2");
  });

  it("removes elements whose keys are gone", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");
    const opts = {
      template: tpl,
      getKey: (t: { id: number }) => t.id,
      update: (el: Element, t: { id: number }) => {
        el.textContent = String(t.id);
      },
    };

    renderList(container, { ...opts, data: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    expect(container.children).toHaveLength(3);

    renderList(container, { ...opts, data: [{ id: 1 }, { id: 3 }] });
    expect(container.children).toHaveLength(2);
    expect(container.children[0]?.textContent).toBe("1");
    expect(container.children[1]?.textContent).toBe("3");
  });

  it("reorders elements", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");
    const opts = {
      template: tpl,
      getKey: (t: { id: number }) => t.id,
      update: (el: Element, t: { id: number }) => {
        el.textContent = String(t.id);
      },
    };

    renderList(container, { ...opts, data: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    const [el1, el2, el3] = Array.from(container.children);

    renderList(container, { ...opts, data: [{ id: 3 }, { id: 1 }, { id: 2 }] });
    expect(container.children[0]).toBe(el3);
    expect(container.children[1]).toBe(el1);
    expect(container.children[2]).toBe(el2);
  });

  it("preserves non-managed children", () => {
    const container = createHostWith('<h1>Header</h1><p class="static">info</p>');
    const tpl = makeTpl("<span></span>");

    renderList(container, {
      template: tpl,
      data: [{ id: 1 }],
      getKey: (t) => t.id,
      update: (el, t) => {
        el.textContent = String(t.id);
      },
    });

    expect(container.querySelector("h1")?.textContent).toBe("Header");
    expect(container.querySelector(".static")?.textContent).toBe("info");
    expect(container.children).toHaveLength(3);
  });

  it("handles empty data (removes all managed)", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");
    const opts = {
      template: tpl,
      getKey: (t: { id: number }) => t.id,
      update: (el: Element, t: { id: number }) => {
        el.textContent = String(t.id);
      },
    };

    renderList(container, { ...opts, data: [{ id: 1 }, { id: 2 }] });
    expect(container.children).toHaveLength(2);

    renderList(container, { ...opts, data: [] });
    expect(container.children).toHaveLength(0);
  });

  it("handles string keys", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");

    renderList(container, {
      template: tpl,
      data: [{ id: "abc" }, { id: "def" }],
      getKey: (t) => t.id,
      update: (el, t) => {
        el.textContent = t.id;
      },
    });

    expect(container.children).toHaveLength(2);
    expect(container.children[0]?.textContent).toBe("abc");
  });
});

describe("render", () => {
  it("creates element when data is provided", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");

    render(container, {
      template: tpl,
      data: { name: "Alice" },
      update: (el, d) => {
        el.textContent = d.name;
      },
    });

    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.textContent).toBe("Alice");
  });

  it("updates existing element without recreating", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");
    const opts = {
      template: tpl,
      update: (el: Element, d: { name: string }) => {
        el.textContent = d.name;
      },
    };

    render(container, { ...opts, data: { name: "v1" } });
    const firstEl = container.children[0]!;

    render(container, { ...opts, data: { name: "v2" } });
    expect(container.children[0]).toBe(firstEl);
    expect(firstEl.textContent).toBe("v2");
  });

  it("removes element when data is null", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");
    const opts = {
      template: tpl,
      update: (el: Element, d: { name: string }) => {
        el.textContent = d.name;
      },
    };

    render(container, { ...opts, data: { name: "hi" } });
    expect(container.children).toHaveLength(1);

    render(container, { ...opts, data: null });
    expect(container.children).toHaveLength(0);
  });

  it("no-op when data is null and no managed child", () => {
    const container = createHostWith("<p>static</p>");
    const tpl = makeTpl("<span></span>");

    render(container, {
      template: tpl,
      data: null,
      update: () => {},
    });

    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.textContent).toBe("static");
  });

  it("re-creates after remove", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");
    const opts = {
      template: tpl,
      update: (el: Element, d: { name: string }) => {
        el.textContent = d.name;
      },
    };

    render(container, { ...opts, data: { name: "first" } });
    const firstEl = container.children[0]!;

    render(container, { ...opts, data: null });
    render(container, { ...opts, data: { name: "second" } });

    expect(container.children).toHaveLength(1);
    expect(container.children[0]).not.toBe(firstEl);
    expect(container.children[0]?.textContent).toBe("second");
  });
});
