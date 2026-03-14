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

    renderList(container, tpl, {
      data,
      key: (t) => t.id,
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
      data: [{ id: 1, text: "v1" }],
      key: (t: { id: number; text: string }) => t.id,
      update: (el: Element, t: { id: number; text: string }) => {
        el.textContent = t.text;
      },
    };

    renderList(container, tpl, opts);
    const firstEl = container.children[0]!;

    renderList(container, tpl, { ...opts, data: [{ id: 1, text: "v2" }] });
    expect(container.children[0]).toBe(firstEl);
    expect(firstEl.textContent).toBe("v2");
  });

  it("removes elements whose keys are gone", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");
    const opts = {
      key: (t: { id: number }) => t.id,
      update: (el: Element, t: { id: number }) => {
        el.textContent = String(t.id);
      },
    };

    renderList(container, tpl, { ...opts, data: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    expect(container.children).toHaveLength(3);

    renderList(container, tpl, { ...opts, data: [{ id: 1 }, { id: 3 }] });
    expect(container.children).toHaveLength(2);
    expect(container.children[0]?.textContent).toBe("1");
    expect(container.children[1]?.textContent).toBe("3");
  });

  it("reorders elements", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");
    const opts = {
      key: (t: { id: number }) => t.id,
      update: (el: Element, t: { id: number }) => {
        el.textContent = String(t.id);
      },
    };

    renderList(container, tpl, { ...opts, data: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    const [el1, el2, el3] = Array.from(container.children);

    renderList(container, tpl, { ...opts, data: [{ id: 3 }, { id: 1 }, { id: 2 }] });
    expect(container.children[0]).toBe(el3);
    expect(container.children[1]).toBe(el1);
    expect(container.children[2]).toBe(el2);
  });

  it("reorders [A,B,C,D,E] → [C,D,B,E,A] with minimum moves", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");
    const opts = {
      key: (t: { id: string }) => t.id,
      update: (el: Element, t: { id: string }) => {
        el.textContent = t.id;
      },
    };

    const items = ["A", "B", "C", "D", "E"].map((id) => ({ id }));
    renderList(container, tpl, { ...opts, data: items });
    const [elA, elB, elC, elD, elE] = Array.from(container.children);

    renderList(container, tpl, {
      ...opts,
      data: ["C", "D", "B", "E", "A"].map((id) => ({ id })),
    });
    expect(container.children[0]).toBe(elC);
    expect(container.children[1]).toBe(elD);
    expect(container.children[2]).toBe(elB);
    expect(container.children[3]).toBe(elE);
    expect(container.children[4]).toBe(elA);
  });

  it("removes non-managed children", () => {
    const container = createHostWith('<h1>Header</h1><p class="static">info</p>');
    const tpl = makeTpl("<span></span>");

    renderList(container, tpl, {
      data: [{ id: 1 }],
      key: (t) => t.id,
      update: (el, t) => {
        el.textContent = String(t.id);
      },
    });

    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector(".static")).toBeNull();
    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.textContent).toBe("1");
  });

  it("handles empty data (removes all children)", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");
    const opts = {
      key: (t: { id: number }) => t.id,
      update: (el: Element, t: { id: number }) => {
        el.textContent = String(t.id);
      },
    };

    renderList(container, tpl, { ...opts, data: [{ id: 1 }, { id: 2 }] });
    expect(container.children).toHaveLength(2);

    renderList(container, tpl, { ...opts, data: [] });
    expect(container.children).toHaveLength(0);
  });

  it("handles string keys", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");

    renderList(container, tpl, {
      data: [{ id: "abc" }, { id: "def" }],
      key: (t) => t.id,
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

    render(container, tpl, {
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
      update: (el: Element, d: { name: string }) => {
        el.textContent = d.name;
      },
    };

    render(container, tpl, { ...opts, data: { name: "v1" } });
    const firstEl = container.children[0]!;

    render(container, tpl, { ...opts, data: { name: "v2" } });
    expect(container.children[0]).toBe(firstEl);
    expect(firstEl.textContent).toBe("v2");
  });

  it("renders static template without options", () => {
    const container = createHostWith("");
    const tpl = makeTpl('<div class="loading">Loading...</div>');

    render(container, tpl);

    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.textContent).toBe("Loading...");
  });

  it("static render is idempotent", () => {
    const container = createHostWith("");
    const tpl = makeTpl('<div class="loading">Loading...</div>');

    render(container, tpl);
    const firstEl = container.children[0]!;

    render(container, tpl);
    expect(container.children).toHaveLength(1);
    expect(container.children[0]).toBe(firstEl);
  });

  it("switches between different templates", () => {
    const container = createHostWith("");
    const loadingTpl = makeTpl('<div class="loading">Loading...</div>');
    const errorTpl = makeTpl('<div class="error">Error!</div>');

    render(container, loadingTpl);
    expect(container.children[0]?.textContent).toBe("Loading...");

    render(container, errorTpl);
    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.textContent).toBe("Error!");
  });

  it("transitions from static to data-driven", () => {
    const container = createHostWith("");
    const loadingTpl = makeTpl("<div>Loading...</div>");
    const dataTpl = makeTpl("<span></span>");

    render(container, loadingTpl);
    expect(container.children[0]?.textContent).toBe("Loading...");

    render(container, dataTpl, {
      data: { name: "Alice" },
      update: (el, d) => {
        el.textContent = d.name;
      },
    });
    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.textContent).toBe("Alice");
  });

  it("transitions from data-driven to static", () => {
    const container = createHostWith("");
    const dataTpl = makeTpl("<span></span>");
    const emptyTpl = makeTpl("<div>No data</div>");

    render(container, dataTpl, {
      data: { name: "Alice" },
      update: (el, d) => {
        el.textContent = d.name;
      },
    });
    expect(container.children[0]?.textContent).toBe("Alice");

    render(container, emptyTpl);
    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.textContent).toBe("No data");
  });

  it("renderList cleans up render content", () => {
    const container = createHostWith("");
    const singleTpl = makeTpl("<div>Single</div>");
    const listTpl = makeTpl("<li></li>");

    render(container, singleTpl);
    expect(container.children).toHaveLength(1);

    renderList(container, listTpl, {
      data: [{ id: 1 }, { id: 2 }],
      key: (t) => t.id,
      update: (el, t) => {
        el.textContent = String(t.id);
      },
    });
    expect(container.children).toHaveLength(2);
    expect(container.children[0]?.textContent).toBe("1");
  });

  it("render cleans up renderList content", () => {
    const container = createHostWith("");
    const listTpl = makeTpl("<li></li>");
    const singleTpl = makeTpl("<div>Single</div>");

    renderList(container, listTpl, {
      data: [{ id: 1 }, { id: 2 }, { id: 3 }],
      key: (t) => t.id,
      update: (el, t) => {
        el.textContent = String(t.id);
      },
    });
    expect(container.children).toHaveLength(3);

    render(container, singleTpl);
    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.textContent).toBe("Single");
  });
});
