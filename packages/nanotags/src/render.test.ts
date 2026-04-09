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

    renderList(container, tpl, {
      ...opts,
      data: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
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

    renderList(container, tpl, {
      ...opts,
      data: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const [el1, el2, el3] = Array.from(container.children);

    renderList(container, tpl, {
      ...opts,
      data: [{ id: 3 }, { id: 1 }, { id: 2 }],
    });
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

  it("re-runs update callback without data on subsequent calls", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");
    let callCount = 0;

    const update = (el: Element) => {
      callCount++;
      el.textContent = `call-${callCount}`;
    };

    render(container, tpl, { update });
    expect(callCount).toBe(1);
    expect(container.children[0]?.textContent).toBe("call-1");

    render(container, tpl, { update });
    expect(callCount).toBe(2);
    expect(container.children[0]?.textContent).toBe("call-2");

    render(container, tpl, { update });
    expect(callCount).toBe(3);
    expect(container.children[0]?.textContent).toBe("call-3");
  });

  it("skips update when explicit data has not changed", () => {
    const container = createHostWith("");
    const tpl = makeTpl("<span></span>");
    let callCount = 0;
    const data = { name: "Alice" };

    render(container, tpl, {
      data,
      update: (el, d) => {
        callCount++;
        el.textContent = d.name;
      },
    });
    expect(callCount).toBe(1);

    render(container, tpl, {
      data,
      update: (el, d) => {
        callCount++;
        el.textContent = d.name;
      },
    });
    expect(callCount).toBe(1);
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

describe("nested render/renderList", () => {
  type Block = { heading: string; snippet: string };
  type Group = { pageId: string; pageTitle: string; blocks: Block[] };

  const wrapperTpl = makeTpl('<div class="results"></div>');
  const groupTpl = makeTpl(
    '<div class="group"><span data-title></span><ul data-blocks></ul></div>',
  );
  const blockTpl = makeTpl("<li><span data-heading></span><span data-snippet></span></li>");

  function renderNested(container: Element, groups: Group[]) {
    render(container, wrapperTpl, {
      data: groups,
      update(el) {
        renderList(el, groupTpl, {
          data: groups,
          key: (g) => g.pageId,
          update: (groupEl, g) => {
            groupEl.querySelector("[data-title]")!.textContent = g.pageTitle;
            renderList(groupEl.querySelector("[data-blocks]")!, blockTpl, {
              data: g.blocks,
              key: (b) => b.heading,
              update: (blockEl, b) => {
                blockEl.querySelector("[data-heading]")!.textContent = b.heading;
                blockEl.querySelector("[data-snippet]")!.textContent = b.snippet;
              },
            });
          },
        });
      },
    });
  }

  it("creates nested structure on first render", () => {
    const container = createHostWith("");
    const groups: Group[] = [
      {
        pageId: "intro",
        pageTitle: "Introduction",
        blocks: [
          { heading: "Getting Started", snippet: "Install the package" },
          { heading: "Quick Start", snippet: "Run the command" },
        ],
      },
    ];

    renderNested(container, groups);

    expect(container.children).toHaveLength(1); // wrapper
    const wrapper = container.children[0]!;
    expect(wrapper.children).toHaveLength(1); // one group
    const group = wrapper.children[0]!;
    expect(group.querySelector("[data-title]")!.textContent).toBe("Introduction");
    const blocks = group.querySelector("[data-blocks]")!;
    expect(blocks.children).toHaveLength(2);
    expect(blocks.children[0]!.querySelector("[data-heading]")!.textContent).toBe(
      "Getting Started",
    );
    expect(blocks.children[1]!.querySelector("[data-snippet]")!.textContent).toBe(
      "Run the command",
    );
  });

  it("reuses wrapper element across updates", () => {
    const container = createHostWith("");
    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [{ heading: "h1", snippet: "s1" }],
      },
    ]);
    const wrapper = container.children[0]!;

    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A updated",
        blocks: [{ heading: "h1", snippet: "s1 updated" }],
      },
    ]);
    expect(container.children[0]).toBe(wrapper);
  });

  it("reuses group elements by key across updates", () => {
    const container = createHostWith("");
    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [{ heading: "h1", snippet: "s1" }],
      },
      {
        pageId: "b",
        pageTitle: "B",
        blocks: [{ heading: "h2", snippet: "s2" }],
      },
    ]);
    const wrapper = container.children[0]!;
    const groupA = wrapper.children[0]!;
    const groupB = wrapper.children[1]!;

    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A v2",
        blocks: [{ heading: "h1", snippet: "s1 v2" }],
      },
      {
        pageId: "b",
        pageTitle: "B v2",
        blocks: [{ heading: "h2", snippet: "s2 v2" }],
      },
    ]);
    expect(wrapper.children[0]).toBe(groupA);
    expect(wrapper.children[1]).toBe(groupB);
    expect(groupA.querySelector("[data-title]")!.textContent).toBe("A v2");
    expect(groupB.querySelector("[data-title]")!.textContent).toBe("B v2");
  });

  it("reuses block elements by key across updates", () => {
    const container = createHostWith("");
    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [
          { heading: "h1", snippet: "s1" },
          { heading: "h2", snippet: "s2" },
        ],
      },
    ]);
    const blocksContainer = container.querySelector("[data-blocks]")!;
    const block1 = blocksContainer.children[0]!;
    const block2 = blocksContainer.children[1]!;

    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [
          { heading: "h1", snippet: "s1 updated" },
          { heading: "h2", snippet: "s2 updated" },
        ],
      },
    ]);
    expect(blocksContainer.children[0]).toBe(block1);
    expect(blocksContainer.children[1]).toBe(block2);
    expect(block1.querySelector("[data-snippet]")!.textContent).toBe("s1 updated");
    expect(block2.querySelector("[data-snippet]")!.textContent).toBe("s2 updated");
  });

  it("adds and removes groups without affecting siblings", () => {
    const container = createHostWith("");
    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [{ heading: "h1", snippet: "s1" }],
      },
      {
        pageId: "b",
        pageTitle: "B",
        blocks: [{ heading: "h2", snippet: "s2" }],
      },
    ]);
    const wrapper = container.children[0]!;
    const groupA = wrapper.children[0]!;

    // Remove "b", add "c"
    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [{ heading: "h1", snippet: "s1" }],
      },
      {
        pageId: "c",
        pageTitle: "C",
        blocks: [{ heading: "h3", snippet: "s3" }],
      },
    ]);
    expect(wrapper.children).toHaveLength(2);
    expect(wrapper.children[0]).toBe(groupA);
    expect(wrapper.children[1]!.querySelector("[data-title]")!.textContent).toBe("C");
  });

  it("adds and removes blocks within a group without affecting other groups", () => {
    const container = createHostWith("");
    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [
          { heading: "h1", snippet: "s1" },
          { heading: "h2", snippet: "s2" },
        ],
      },
      {
        pageId: "b",
        pageTitle: "B",
        blocks: [{ heading: "h3", snippet: "s3" }],
      },
    ]);
    const wrapper = container.children[0]!;
    const groupB = wrapper.children[1]!;
    const groupBBlock = groupB.querySelector("[data-blocks]")!.children[0]!;

    // Modify blocks in group "a", keep group "b" the same data shape
    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [{ heading: "h1", snippet: "s1" }], // removed h2
      },
      {
        pageId: "b",
        pageTitle: "B",
        blocks: [{ heading: "h3", snippet: "s3" }],
      },
    ]);

    expect(wrapper.children[1]).toBe(groupB);
    // group B's block element is reused since it's a new object with same key
    const groupBBlockAfter = groupB.querySelector("[data-blocks]")!.children[0]!;
    expect(groupBBlockAfter).toBe(groupBBlock);

    const groupABlocks = wrapper.children[0]!.querySelector("[data-blocks]")!;
    expect(groupABlocks.children).toHaveLength(1);
  });

  it("reorders groups and preserves nested block elements", () => {
    const container = createHostWith("");
    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [{ heading: "h1", snippet: "s1" }],
      },
      {
        pageId: "b",
        pageTitle: "B",
        blocks: [{ heading: "h2", snippet: "s2" }],
      },
      {
        pageId: "c",
        pageTitle: "C",
        blocks: [{ heading: "h3", snippet: "s3" }],
      },
    ]);
    const wrapper = container.children[0]!;
    const groupA = wrapper.children[0]!;
    const groupB = wrapper.children[1]!;
    const groupC = wrapper.children[2]!;
    const blockInA = groupA.querySelector("[data-blocks]")!.children[0]!;
    const blockInC = groupC.querySelector("[data-blocks]")!.children[0]!;

    // Reverse order
    renderNested(container, [
      {
        pageId: "c",
        pageTitle: "C",
        blocks: [{ heading: "h3", snippet: "s3" }],
      },
      {
        pageId: "b",
        pageTitle: "B",
        blocks: [{ heading: "h2", snippet: "s2" }],
      },
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [{ heading: "h1", snippet: "s1" }],
      },
    ]);
    expect(wrapper.children[0]).toBe(groupC);
    expect(wrapper.children[1]).toBe(groupB);
    expect(wrapper.children[2]).toBe(groupA);
    // Block elements inside reordered groups are still the same DOM nodes
    expect(groupA.querySelector("[data-blocks]")!.children[0]).toBe(blockInA);
    expect(groupC.querySelector("[data-blocks]")!.children[0]).toBe(blockInC);
  });

  it("switching outer template cleans up all nested content", () => {
    const container = createHostWith("");
    const emptyTpl = makeTpl('<div class="empty">No results</div>');

    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [
          { heading: "h1", snippet: "s1" },
          { heading: "h2", snippet: "s2" },
        ],
      },
    ]);
    expect(container.querySelectorAll("[data-heading]")).toHaveLength(2);

    // Switch to empty template
    render(container, emptyTpl);
    expect(container.children).toHaveLength(1);
    expect(container.children[0]!.textContent).toBe("No results");
    expect(container.querySelectorAll("[data-heading]")).toHaveLength(0);
  });

  it("restores nested structure after switching templates back", () => {
    const container = createHostWith("");
    const emptyTpl = makeTpl('<div class="empty">No results</div>');

    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [{ heading: "h1", snippet: "s1" }],
      },
    ]);
    const originalWrapper = container.children[0]!;

    render(container, emptyTpl);
    expect(container.children[0]!.textContent).toBe("No results");

    // Switch back - wrapper is recreated (old one was removed)
    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [{ heading: "h1", snippet: "s1" }],
      },
    ]);
    expect(container.children).toHaveLength(1);
    expect(container.children[0]).not.toBe(originalWrapper);
    expect(container.querySelector("[data-title]")!.textContent).toBe("A");
    expect(container.querySelector("[data-heading]")!.textContent).toBe("h1");
  });

  it("handles empty groups list", () => {
    const container = createHostWith("");
    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [{ heading: "h1", snippet: "s1" }],
      },
    ]);

    renderNested(container, []);
    const wrapper = container.children[0]!;
    expect(wrapper.children).toHaveLength(0);
  });

  it("handles groups with empty blocks", () => {
    const container = createHostWith("");
    renderNested(container, [
      {
        pageId: "a",
        pageTitle: "A",
        blocks: [{ heading: "h1", snippet: "s1" }],
      },
    ]);
    const blocksContainer = container.querySelector("[data-blocks]")!;
    expect(blocksContainer.children).toHaveLength(1);

    renderNested(container, [{ pageId: "a", pageTitle: "A", blocks: [] }]);
    expect(blocksContainer.children).toHaveLength(0);
  });

  it("renderList inside renderList: outer add does not destroy inner state", () => {
    const container = createHostWith("");
    const outerTpl = makeTpl('<div class="outer"><ul data-inner></ul></div>');
    const innerTpl = makeTpl("<li></li>");

    type Inner = { id: number; text: string };
    type Outer = { id: string; items: Inner[] };

    function renderTwoLevel(data: Outer[]) {
      renderList(container, outerTpl, {
        data,
        key: (o) => o.id,
        update: (el, o) => {
          const innerContainer = el.querySelector("[data-inner]")!;
          renderList(innerContainer, innerTpl, {
            data: o.items,
            key: (i) => i.id,
            update: (li, i) => {
              li.textContent = i.text;
            },
          });
        },
      });
    }

    renderTwoLevel([{ id: "x", items: [{ id: 1, text: "one" }] }]);
    const outerX = container.children[0]!;
    const innerOne = outerX.querySelector("[data-inner]")!.children[0]!;

    // Add a new outer item - existing outer+inner elements should be preserved
    renderTwoLevel([
      { id: "x", items: [{ id: 1, text: "one" }] },
      { id: "y", items: [{ id: 2, text: "two" }] },
    ]);
    expect(container.children).toHaveLength(2);
    expect(container.children[0]).toBe(outerX);
    expect(outerX.querySelector("[data-inner]")!.children[0]).toBe(innerOne);
  });
});
