---
title: Recipes
description: Common patterns and how-tos for nano-wc
order: 3
---

## Parent-child communication

When components form a logical group (Tabs/Tab, Accordion/Panel), use the **context pattern** via `ctx.consume()`. The parent exposes an API through its mixin, children look it up by constructor:

```typescript
const XTabs = define("x-tabs").setup((ctx) => {
  const panels: HTMLElement[] = [];

  function activate(index: number) {
    panels.forEach((p, i) => {
      p.hidden = i !== index;
    });
  }

  return {
    register(panel: HTMLElement) {
      panels.push(panel);
    },
    activate,
  };
});

define("x-tab-panel").setup((ctx) => {
  const tabs = ctx.consume(XTabs);
  tabs.register(ctx.host);
});
```

For **unrelated** components, use events instead:

```typescript
// Producer
ctx.emit("cart:updated", { items });

// Consumer
ctx.on(document, "cart:updated", (e) => {
  renderCart(e.detail.items);
});
```

## Form binding

Use `ctx.bind()` for two-way binding between form controls and stores. The store is the source of truth:

```typescript
import { atom } from "nanostores";

define("x-settings")
  .withRefs((r) => ({
    name: r.one("input"),
    theme: r.one("select"),
    notifications: r.one("input"),
  }))
  .setup((ctx) => {
    const $name = atom("Ada");
    const $theme = atom("light");
    const $notifications = atom(true);

    ctx.bind(ctx.refs.name, $name);
    ctx.bind(ctx.refs.theme, $theme);
    ctx.bind(ctx.refs.notifications, $notifications);
  });
```

Control types are auto-detected:
- `input[type=checkbox]` syncs `.checked` (listens to `change`)
- `input[type=number|range]` reads `.valueAsNumber` (listens to `input`)
- `input[type=text]` / `textarea` syncs `.value` (listens to `input`)
- `select` syncs `.value` (listens to `change`)

## Dynamic lists

Use `renderList` from `nano-wc/render` for keyed list reconciliation. It creates, updates, reorders, and removes DOM elements efficiently:

```html
<x-todo-list>
  <ul data-ref="list">
    <template data-ref="itemTpl">
      <li>
        <input type="checkbox" />
        <span class="text"></span>
        <button class="remove">×</button>
      </li>
    </template>
  </ul>
</x-todo-list>
```

```typescript
import { define } from "nano-wc";
import { renderList } from "nano-wc/render";
import { atom } from "nanostores";

type Todo = { id: number; text: string; done: boolean };

define("x-todo-list")
  .withRefs((r) => ({
    list: r.one("ul"),
    itemTpl: r.one("template"),
  }))
  .setup((ctx) => {
    const $todos = atom<Todo[]>([]);

    ctx.effect($todos, (todos) => {
      renderList(ctx.refs.list, ctx.refs.itemTpl, {
        data: todos,
        key: (todo) => todo.id,
        update: (el, todo) => {
          const checkbox = ctx.getElement<"input">(el, "input");
          const text = ctx.getElement(el, ".text");
          checkbox.checked = todo.done;
          text.textContent = todo.text;
        },
      });
    });
  });
```

## State templates with render

Use `render` to switch between loading, error, and content states:

```typescript
import { render } from "nano-wc/render";

define("x-profile")
  .withRefs((r) => ({
    container: r.one("div"),
    loadingTpl: r.one<"template">("#loading"),
    errorTpl: r.one<"template">("#error"),
    profileTpl: r.one<"template">("#profile"),
  }))
  .setup((ctx) => {
    ctx.effect($state, (state) => {
      if (state.loading) {
        render(ctx.refs.container, ctx.refs.loadingTpl);
      } else if (state.error) {
        render(ctx.refs.container, ctx.refs.errorTpl);
      } else {
        render(ctx.refs.container, ctx.refs.profileTpl, {
          data: state.data,
          update: (el, user) => {
            ctx.getElement(el, ".name").textContent = user.name;
          },
        });
      }
    });
  });
```

## Focus management

### Roving focus

Arrow-key navigation through a group of focusable elements. Create a reusable attachment:

```typescript
export function attachRovingFocus(
  ctx: SetupContext,
  container: HTMLElement,
  items: HTMLElement[],
  options: { onFocus?: (el: HTMLElement) => void } = {},
) {
  function setActive(index: number) {
    items.forEach((item, i) => {
      item.setAttribute("tabindex", i === index ? "0" : "-1");
    });
  }

  setActive(0);

  ctx.on(container, "keydown", (e) => {
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;

    let next = -1;
    if (e.key === "ArrowRight") next = (current + 1) % items.length;
    if (e.key === "ArrowLeft") next = (current - 1 + items.length) % items.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = items.length - 1;

    if (next !== -1) {
      e.preventDefault();
      setActive(next);
      items[next].focus();
      options.onFocus?.(items[next]);
    }
  });
}
```

### Focus trap

Keep focus within a container (modals, dialogs):

```typescript
export function attachFocusTrap(ctx: SetupContext, container: HTMLElement) {
  const focusable = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

  ctx.on(container, "keydown", (e) => {
    if (e.key !== "Tab") return;

    const elements = [...container.querySelectorAll<HTMLElement>(focusable)];
    if (!elements.length) return;

    const first = elements[0];
    const last = elements[elements.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}
```

## Typed custom events

Make events type-safe across components:

```typescript
import type { TypedEvent } from "nano-wc";

type SelectionChangeEvent = TypedEvent<
  InstanceType<typeof XListBox>,
  { selected: string[] }
>;

declare global {
  interface HTMLElementEventMap {
    "listbox:change": SelectionChangeEvent;
  }
}

// Emit
ctx.emit("listbox:change", { selected: ["a", "b"] });

// Listen — fully typed
ctx.on(listboxEl, "listbox:change", (e) => {
  console.log(e.detail.selected); // string[]
});
```

## Syncing external stores

Use `ctx.sync()` to keep a component prop in sync with an external store. Useful for shared state between components:

```typescript
import { atom } from "nanostores";

const $globalTheme = atom("light");

define("x-theme-toggle")
  .withProps((p) => ({
    theme: p.oneOf(["light", "dark"]),
  }))
  .setup((ctx) => {
    ctx.sync("theme", $globalTheme);
  });
```

With transforms:

```typescript
ctx.sync("count", $offset, {
  get: (offset) => offset * 2, // store → prop
  set: (count) => count / 2,   // prop → store
});
```
