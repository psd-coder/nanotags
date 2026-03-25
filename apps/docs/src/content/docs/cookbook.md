---
title: Cookbook
description: Best practices, communication patterns, context API, TypeScript, and attachments
order: 3
---

## Best Practices

### Code structure

Keep a consistent order inside `setup()` so components read predictably:

1. **Variable definitions**: atoms, constants, cached values
2. **Methods**: named functions for reusable logic
3. **Event handlers**: `ctx.on()` calls
4. **Effects**: `ctx.effect()` subscriptions
5. **Return mixin**: the optional object returned from setup

```typescript
define("x-search")
  .withProps((p) => ({ query: p.string() }))
  .withRefs((r) => ({ input: r.one("input"), results: r.one("ul") }))
  .setup((ctx) => {
    // 1. Variables
    const $filtered = computed(ctx.props.$query, (q) => filterItems(q));

    // 2. Methods
    function clearSearch() {
      ctx.props.$query.set("");
    }

    // 3. Event handlers
    ctx.on(ctx.refs.input, "input", (e) => {
      ctx.props.$query.set(e.currentTarget.value);
    });

    // 4. Effects
    ctx.effect($filtered, (items) => {
      renderList(ctx.refs.results, tpl, {
        data: items,
        key: (item) => item.id,
        update: (el, item) => { el.textContent = item.name; },
      });
    });

    // 5. Return mixin
    return { clearSearch };
  });
```

### Refs over manual selection

Prefer [`withRefs()`](api#withrefs) for elements you always need. Use [`ctx.getElement()`](api#getelement) / [`ctx.getElements()`](api#getelements) only for dynamic queries (e.g. inside [`renderList()`](api#renderlist) update callbacks):

```typescript
// Good: static ref
.withRefs((r) => ({ trigger: r.one("button") }))

// Good: dynamic query inside renderList update
update: (el, item) => {
  ctx.getElement(el, ".name").textContent = item.name;
}
```

### Reactive state with atoms

When state changes over time, use [Nano Stores](https://github.com/nanostores/nanostores) atoms instead of local `let` variables. Atoms integrate with [`ctx.effect()`](api#effect) and [`ctx.bind()`](api#bind), keeping updates declarative:

```typescript
// Avoid: imperative variable + manual DOM update
let count = 0;
ctx.on(ctx.refs.btn, "click", () => {
  count++;
  ctx.refs.display.textContent = String(count);
});

// Prefer: atom + effect
const $count = atom(0);
ctx.on(ctx.refs.btn, "click", () => {
  $count.set($count.get() + 1);
});
ctx.effect($count, (count) => {
  ctx.refs.display.textContent = String(count);
});
```

The atom approach scales better: multiple effects can react to the same state, and the current value is always accessible via `.get()`.

### Effects over imperative handlers

When a DOM update depends on state, express it as an [`ctx.effect()`](api#effect) rather than scattering updates across event handlers. Effects make the data flow explicit: state changes in one place, the DOM reacts in another:

```typescript
// Avoid: updating DOM inside the handler
ctx.on(ctx.refs.toggle, "click", () => {
  const next = !ctx.props.$open.get();
  ctx.props.$open.set(next);
  ctx.host.setAttribute("aria-expanded", String(next));
  ctx.refs.body.hidden = !next;
});

// Prefer: handler changes state, effect updates DOM
ctx.on(ctx.refs.toggle, "click", () => {
  ctx.props.$open.set(!ctx.props.$open.get());
});

ctx.effect(ctx.props.$open, (open) => {
  ctx.host.setAttribute("aria-expanded", String(open));
  ctx.refs.body.hidden = !open;
});
```

## Components Communication

Parents pass data down through props. Children notify parents via custom events ([`ctx.emit()`](api#emit) / [`ctx.on()`](api#on)). When a child needs ongoing access to parent state, use the [context protocol](cookbook#context-api) (`nanotags/context`). Unrelated components share [Nano Stores](https://github.com/nanostores/nanostores) atoms directly.

### Parent to child

The primary channel. A parent sets attributes or properties on its children, and each child reacts via its own prop stores:

```typescript
// Parent sets attribute, child's $mode atom updates automatically
childEl.setAttribute("mode", "dark");

// Or via property
childEl.mode = "dark";
```

### Child to parent

Standard DOM events. The child dispatches with [`ctx.emit()`](api#emit), the parent listens with [`ctx.on()`](api#on):

```typescript
// Child
ctx.emit("tab:select", { index: 2 });

// Parent
ctx.on(ctx.refs.tabs, "tab:select", (e) => {
  console.log(e.detail.index); // 2
});
```

### Child needs parent state or API

Use the [Context protocol](cookbook#context-api). The parent exposes a value via [`provide()`](api#contextprovide), descendants receive it via [`consume()`](api#contextconsume) or [`withContexts()`](api#withcontexts). This avoids tight coupling and works regardless of DOM depth.

When components form a logical group (Tabs/Tab, Accordion/Panel), the parent provides a typed API and children declare required contexts:

```typescript
import { createContext } from "nanotags/context";

type TabsAPI = { register: (el: Element) => void; $active: WritableAtom<string> };
const tabsContext = createContext<TabsAPI>("tabs");

const XTabs = define("x-tabs").setup((ctx) => {
  const $active = atom("");

  tabsContext.provide(ctx, {
    $active,
  });
});

define("x-tab-panel")
  .withProps(p => ({ value: p.string() }))
  .withContexts({ tabs: tabsContext })
  .setup((ctx) => {
    ctx.effect(ctx.contexts.tabs.$active, (active) => {
      ctx.host.setAttribute('aria-)
    })
  });
```

[`withContexts()`](api#withcontexts) defers setup until all declared contexts resolve. For dynamic or conditional access, use [`consume()`](api#contextconsume) directly.

### Siblings or unrelated components

Share a [Nano Stores](https://github.com/nanostores/nanostores) atom directly. Import the same store in both components and react via [`ctx.effect()`](api#effect):

```typescript
// shared store (plain module)
export const $theme = atom("light");

// component A
ctx.on(ctx.refs.toggle, "click", () => {
  $theme.set($theme.get() === "light" ? "dark" : "light");
});

// component B
ctx.effect($theme, (theme) => {
  ctx.host.dataset.theme = theme;
});
```

### Combining patterns

You can provide a Nano Stores atom through the Context protocol so that siblings under the same parent share state without a global import:

```typescript
const filterCtx = createContext<WritableAtom<string>>("filter");

define("x-filter-panel").setup((ctx) => {
  const $filter = atom("");
  filterCtx.provide(ctx, $filter);
});

// child A writes to the store
define("x-search-input")
  .withRefs((r) => ({ input: r.one("input") }))
  .withContexts({ filter: filterCtx })
  .setup((ctx) => {
    ctx.on(ctx.refs.input, "input", (e) => {
      ctx.contexts.filter.set(e.currentTarget.value);
    });
  });

// sibling B reacts to changes
define("x-results-list")
  .withContexts({ filter: filterCtx })
  .setup((ctx) => {
    ctx.effect(ctx.contexts.filter, (query) => {
      // filter visible items
    });
  });
```

## Context API

The Context API enables cross-component communication for parent-child relationships without tight coupling. It's imported from the separate `nanotags/context` entry point (~0.4 KB).

### When to use context

Use context when a child component needs **ongoing access to parent state or API**, not just a one-time value (use props) or a fire-and-forget notification (use events).

### How it works

The protocol uses two DOM events following the [Web Components Community Context Protocol](https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md):

**Normal case** (parent connects first):
1. [`provide()`](api#contextprovide) registers a `context-request` event listener on the host
2. [`consume()`](api#contextconsume) dispatches a `context-request` event that bubbles up
3. The provider catches it, stops propagation, and calls the callback with the value
4. The callback runs synchronously

**Late provider** (child upgrades before parent):
1. The `consume()` dispatch goes unhandled: no provider is listening yet
2. A lazy document-level handler stores the pending request
3. When the parent's `provide()` runs, it dispatches a `context-provider` event
4. The document handler re-dispatches `context-request` from pending consumers, resolving them

This means context works regardless of element upgrade order.

### provide vs consume vs withContexts

There are two ways to consume context. Prefer `withContexts()`; use `consume()` only when the context is optional.

**[`withContexts()`](api#withcontexts) (declarative, preferred)**: declares required contexts on the builder. Setup is deferred until **all** contexts resolve:

```typescript
define("x-tab")
  .withContexts({ tabs: tabsCtx })
  .setup((ctx) => {
    // ctx.contexts.tabs is guaranteed to be available here
    ctx.contexts.tabs.register(ctx.host);
  });
```

Use when: the component **cannot function** without the context value. If a provider never appears, setup never runs and the element stays inert.

**[`consume()`](api#contextconsume) (imperative)**: requests context inside setup. The callback runs when/if the context resolves:

```typescript
define("x-widget").setup((ctx) => {
  // Setup runs immediately, context is optional
  tabsCtx.consume(ctx, (tabs) => {
    tabs.register(ctx.host);
  });
});
```

Use when: the context is **optional**; the component should still function without it, or you need to handle the "no provider" case yourself.

Context consumers registered via `consume()` are automatically cleaned up on disconnect: pending requests are removed from the document-level queue. Providers remove their `context-request` listener on disconnect.

## TypeScript

Both patterns below use TypeScript [global augmentation](https://www.typescriptlang.org/docs/handbook/declaration-merging.html#global-augmentation) to extend built-in DOM interfaces.

### Augmenting HTMLElementTagNameMap

Register your element so that refs ([`r.one()`/`r.many()`](api#withrefs)), [`ctx.getElement()`](api#getelement), [`ctx.getElements()`](api#getelements), and standard DOM APIs (`querySelector`, `createElement`) return properly typed instances:

```typescript
declare global {
  interface HTMLElementTagNameMap {
    "x-my-el": InstanceType<typeof MyEl>;
  }
}

const MyEl = define("x-my-el")
  .withProps(/* ... */)
  .setup(/* ... */);
```

This also enables typed ref lookups in other components:

```typescript
r.one("x-my-el"); // typed as InstanceType<typeof MyEl>, validated at runtime
```

### Typed custom events

Use [`TypedEvent`](api#typedevent) to define type-safe events, then augment `HTMLElementEventMap` so that [`ctx.on()`](api#on), [`ctx.emit()`](api#emit), and `addEventListener` are fully typed:

```typescript
import type { TypedEvent } from "nanotags";

type SelectionChangeEvent = TypedEvent<
  InstanceType<typeof XListBox>,
  { selected: string[] }
>;

declare global {
  interface HTMLElementEventMap {
    "listbox:change": SelectionChangeEvent;
  }
}

// Emit (inside x-listbox setup):
ctx.emit("listbox:change", { selected: ["a", "b"] });

// Listen (anywhere in the app):
ctx.on(listboxEl, "listbox:change", (e) => {
  e.target; // XListBox instance
  e.detail.selected; // string[]
});
```

### Combining both augmentations

For a complete component definition, declare both the element and its events together:

```typescript
import { define } from "nanotags";
import type { TypedEvent } from "nanotags";

type TabsChangedEvent = TypedEvent<InstanceType<typeof XTabs>, { index: number }>;

declare global {
  interface HTMLElementTagNameMap {
    "x-tabs": InstanceType<typeof XTabs>;
  }
  interface HTMLElementEventMap {
    "tabs:changed": TabsChangedEvent;
  }
}

const XTabs = define("x-tabs")
  .withProps((p) => ({ active: p.string("") }))
  .setup((ctx) => {
    // ...
  });
```

## Attachments

Attachments are reusable functions that receive the setup context (`ctx`) and wire up behavior—effects, event listeners, cleanup—without creating a new component.

Unlike regular helper functions, attachments are **lifecycle-aware**: because they receive `ctx`, everything they register via [`ctx.on()`](api#on), [`ctx.effect()`](api#effect), or [`ctx.onCleanup()`](api#oncleanup) is automatically cleaned up when the host component disconnects. A plain helper that calls `addEventListener` would leak listeners; an attachment never does.

Attachments also compose naturally with the [context protocol](cookbook#context-api). An attachment can call [`consume()`](api#contextconsume) to access ancestor state, or accept a context value as a parameter, letting you build reusable behaviors (keyboard navigation, drag handling, focus traps) that participate in the component tree without being components themselves.

### Writing your own

An attachment is just a function, no special API needed. Follow these conventions:

1. Accept `ctx: SetupContext` as the first parameter
2. Use [`ctx.on()`](api#on), [`ctx.effect()`](api#effect), [`ctx.onCleanup()`](api#oncleanup) for auto-cleanup
3. Accept configuration via additional parameters or an options object
4. Optionally return state or methods for the calling component

```typescript
export function attachClickOutside(
  ctx: SetupContext,
  callback: () => void,
) {
  ctx.on(document, "click", (e) => {
    if (!ctx.host.contains(e.target as Node)) callback();
  });
}
```

### Example: roving focus

Arrow-key navigation through a group of focusable elements:

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

Usage:

```typescript
define("x-tabs")
  .withRefs((r) => ({ tablist: r.one("div"), tabs: r.many("[role=tab]") }))
  .setup((ctx) => {
    attachRovingFocus(ctx, ctx.refs.tablist, ctx.refs.tabs, {
      onFocus: (el) => activate(el.dataset.value),
    });
  });
```
