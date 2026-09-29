---
title: Cookbook
description: Best practices, communication patterns, context API, TypeScript, attachments, and testing
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
        update: (el, item) => {
          el.textContent = item.name;
        },
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

type TabsAPI = { $active: WritableAtom<string> };
const tabsContext = createContext<TabsAPI>("tabs");

const XTabs = define("x-tabs").setup((ctx) => {
  const $active = atom("");

  tabsContext.provide(ctx, {
    $active,
  });
});

define("x-tab-panel")
  .withProps((p) => ({ value: p.string() }))
  .withContexts({ tabs: tabsContext })
  .setup((ctx) => {
    ctx.effect(ctx.contexts.tabs.$active, (active) => {
      ctx.host.hidden = active !== ctx.props.$value.get();
    });
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

const MyEl = define("x-my-el").withProps(/* ... */).setup(/* ... */);
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

type TabsChangedEvent = TypedEvent<
  InstanceType<typeof XTabs>,
  { index: number }
>;

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
export function attachClickOutside(ctx: SetupContext, callback: () => void) {
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
    if (e.key === "ArrowLeft")
      next = (current - 1 + items.length) % items.length;
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

## Testing

`nanotags/testing` helps you test components in jsdom or happy-dom, with any test runner. It builds the markup a page would have, connects the component, and gives you typed access to its refs. The [Testing API](api#testing-api) lists every helper; this section shows how to use them.

### What to test

You have two options, and you can pick per component:

- **Test the logic on its own.** If a component is mostly glue, move the real logic into a plain module next to it and test that module with ordinary unit tests. The component file stays a thin layer of DOM wiring that the type checker already covers.
- **Mount the component and test its behaviour.** If what matters is how the component reacts in the DOM (reading its initial data, updating when a prop changes, reusing list items, cleaning up on disconnect), mount it and assert what the DOM shows. That is what `nanotags/testing` is for.

```
ui/Chart/
  components.ts    define() + refs + one effect
  utils.ts         deriveChartBars(...)   <- plain logic, easy to test
  utils.test.ts
```

### Setup

The helpers need a DOM but do not ship one, so install jsdom or happy-dom and tell your runner to use it. Nothing imports `nanotags/testing` at runtime, so it never ends up in a browser bundle.

```typescript
// vitest.config.ts
export default defineConfig({
  test: { environment: "jsdom" },
});
```

### Your first test

```typescript
import { afterEach, expect, it } from "vitest";
import { cleanup, h, mount, ref } from "nanotags/testing";

// Registers x-char-count and adds it to HTMLElementTagNameMap.
import "./components";

afterEach(cleanup);

it("counts characters as the user types", () => {
  const markup = h(
    "x-char-count",
    null,
    h("textarea", { "data-ref": "field", maxlength: 10 }),
    h("span", { "data-ref": "count" }, "0"),
  );
  const host = mount(markup);
  const field = ref(host, "field"); // HTMLTextAreaElement, from r.one("textarea")

  field.value = "hello";
  field.dispatchEvent(new Event("input", { bubbles: true }));

  expect(ref(host, "count").textContent).toBe("5");
});
```

Step by step:

1. `h("x-char-count", null, ...children)` builds the HTML for the component. The nested `h` calls build what goes inside it: the same markup the server renders.
2. `mount(markup)` puts that HTML on the page and returns the component element, called the **host**. The component sets up exactly as it would in the browser.
3. `ref(host, "field")` finds a ref the same way the component does.
4. `afterEach(cleanup)` removes everything the test added, so the next test starts clean.

Why not build the element by hand? The order is easy to get wrong. If you append the element first and set its `innerHTML` after, the component has already looked for its refs, found nothing, and thrown. `mount` builds everything first and connects it last, so the component sees the full markup, just like on a real page.

### Typed tests

If the component adds itself to `HTMLElementTagNameMap` (see [Augmenting HTMLElementTagNameMap](#augmenting-htmlelementtagnamemap)), the helpers know its props and refs:

- `mount` returns the chart element for `h("x-chart", ...)` markup, so `host.bars = [...]` needs no cast.
- `h("x-chart", { ... })` checks every prop name and value.
- `ref(host, "list")` only accepts the component's `r.one` refs and returns the element type the ref declares.

A typo becomes a compile error instead of a confusing test failure. Passing the component class instead of a tag name works the same way.

For markup the test adds itself, pass the element type: `ref<HTMLElement>(host, "fixture")`. A tag that is not in the map returns a plain `HTMLElement`.

### Building markup with `h`

`h(tag, props, ...children)` works like React's `createElement`, but it returns HTML. On a real page the server renders a component's attributes, its JSON data and its inner markup. `h` gives you each of those:

```typescript
const markup = h(
  "x-calculator",
  { storageTb: 100, readsPct: undefined, presets: [{ id: "a", label: "A" }] },
  CHILDREN,
);
const host = mount(markup);
```

| You pass                                 | `h` writes                                             | On the page this is               |
| ---------------------------------------- | ------------------------------------------------------ | --------------------------------- |
| An attribute prop (`storageTb`)          | `storage-tb="100"`                                     | an attribute the server rendered  |
| A JSON prop (`presets`, from `p.json()`) | `<script type="application/json" data-prop="presets">` | the JSON seed the server rendered |
| Children                                 | the HTML inside the element                            | the component's template          |

A few rules keep test data simple:

- `undefined` is skipped. `null` and `false` leave the attribute out. So you can pass optional values straight through, and a missing one tests the prop's fallback.
- `true` writes an empty attribute, like `disabled=""`. Numbers become strings.
- Prop names are written in kebab-case, so name them after the prop: `storageTb` becomes `storage-tb`. Other attributes (`id`, `class`, `data-*`, `aria-*`, `viewBox` on an SVG) are written exactly as given.
- Children are more `h` calls, or raw HTML strings for markup copied as is. Nested `h` calls are typed too, so a component inside the markup gets checked props of its own:

```typescript
const markup = h("x-dashboard", null, h("x-chart", { bars }, CHART_CHILDREN));
mount(markup);
```

Property-only props (`{ schema, attribute: false }`) have no place in markup, and on a typed component `h` rejects them. Set them as properties before the component connects, as shown in [Before the component connects](#before-the-component-connects).

### The page around the component

Many components read DOM they do not own: the nav a scroll spy watches, the container a set of controls scrolls, the link that opens a modal. Mount that too, and `cleanup` removes it as well. `mount` also accepts a raw HTML string, handy for a larger piece of page copied as is.

```typescript
const containerMarkup = h("div", {
  "data-scroll-container": true,
  "data-scroll-id": "cards",
});
const markup = h("x-scroll-controls", { scrollId: "cards" }, CHILDREN);

mount(containerMarkup);
const host = mount(markup);

expect(ref(host, "prev").disabled).toBe(true);
```

`mount` returns the first element of the markup. It inserts everything at once, so a component sees the siblings that come after it, just like on a parsed page. happy-dom is the exception: it sets up each element as it is inserted, so a component there only sees the siblings before it. If a component reads its surroundings in setup, mount the surroundings first.

To put a component inside another element, pass that element as the second argument. It must already be on the page:

```typescript
const markup = h("x-cms-form", null, CHILDREN);

const dialog = mount("dialog");
const host = mount(markup, dialog);
```

### Before the component connects

A component sets up as soon as it connects. Sometimes the test needs to do something first: replace a neighbouring element with a stub, fake layout sizes, or set a property the way a parent would. Build the element with `create` instead of `mount`. It is ready but not yet on the page. Then call `connect`:

```typescript
const markup = h("x-share-button", null, CHILDREN);
const host = create(markup);
host.label = "Share"; // a property a parent would set before connect
connect(host); // setup runs now
```

### Stubbing other elements

Components often talk to elements they do not own: a tooltip, a modal, another component. Do not import the real one just to make a ref resolve. Replace it with `stubElement`. The test stays about one component, and it does not depend on the order in which modules register their elements.

`stubElement(el, shape)` gives the element the members in `shape`:

- A value becomes a property that remembers every write. Read them with `writes(name)`, and the current value with `get(name)`.
- A function becomes a method that remembers every call. Read them with `calls(name)`. The function also runs, with the element as `this`, so the stub can act like the real thing.

```typescript
const modal = stubElement(ref(host, "detailsModal"), {
  isOpen: false,
  open() {
    modal.el.isOpen = true;
  },
});

ref(host, "detailsTrigger").click();

expect(modal.calls("open")).toEqual([[]]);
expect(modal.get("isOpen")).toBe(true);
```

`modal.el` is the same element, typed as if it had those members. The stubbed element can even be a registered component. Its props can be stubbed at any time, but its methods come from its setup, which would replace a stub. So stub its methods once it has connected: `stubElement` throws if its setup has not run yet. Reconnecting it runs setup again and brings the real methods back.

A stub records only what happens after you install it. On a mounted host, the component's setup has already run, so its first writes are not recorded. To check them, stub before connecting:

```typescript
const markup = h("x-share-button", null, CHILDREN);
const host = create(markup);
const tooltip = stubElement(ref(host, "tooltip"), { open: false });
connect(host);

expect(tooltip.writes("open")).toEqual([false]);
```

If the rest of the test only cares about later writes, drop these with `tooltip.reset()`.

### Events

Listen with your runner's spy. A listener on the host goes away with it. A listener on `document` or `window` outlives the test, so remove it afterwards.

```typescript
const onPicked = vi.fn<(event: CustomEvent<string>) => void>();
host.addEventListener("picked", onPicked);

ref(host, "option").click();

expect(onPicked.mock.calls.map(([event]) => event.detail)).toEqual(["a"]);
```

If the event has no payload and you need the state at the moment it fired, read the state inside the listener: `host.addEventListener("change", () => values.push(host.value))`. Reading `host.value` later only shows the last value.

### Contexts

A component that uses `withContexts` waits until every context has a provider. Instead of mounting the real provider (with its own markup, refs and setup), use `provideContext`.

Take the tabs from [Child needs parent state or API](#child-needs-parent-state-or-api). To test `x-tab-panel` on its own, the test needs the same context key the component uses, so export it from the module that creates it:

```typescript
// tabs/context.ts
import type { WritableAtom } from "nanostores";
import { createContext } from "nanotags/context";

export type TabsAPI = { $active: WritableAtom<string> };
export const tabsContext = createContext<TabsAPI>("tabs");
```

Then any element on the page can stand in for `x-tabs`:

```typescript
import { atom } from "nanostores";
import { afterEach, expect, it } from "vitest";
import { cleanup, h, mount, provideContext } from "nanotags/testing";

import { tabsContext } from "./context";
// Registers x-tab-panel.
import "./components";

afterEach(cleanup);

it("shows the panel only while its tab is active", () => {
  const markup = h("x-tab-panel", { value: "b" });
  const $active = atom("a");

  const tabs = mount("div");
  provideContext(tabs, tabsContext, { $active });
  const panel = mount(markup, tabs);

  expect(panel.hidden).toBe(true);

  $active.set("b");
  expect(panel.hidden).toBe(false);
});
```

The value you provide is whatever the real provider would give: here a plain atom the test controls. The order does not matter. A component mounted before its provider waits and sets up once the provider appears, just like at runtime. `cleanup` removes the provider.

Without a provider the component never sets up, and it looks broken: no effects run and its methods are missing. `ref` and `refs` catch this. On a connected host that has not set up, they throw an error that names the missing provider.

### Components defined in a test

Some tests need a small component of their own, such as a wrapper that runs an attachment, or a provider for a context. A tag name can only be defined once per page, and defining it again keeps the first version. So two tests that use the same name would share one component. `uniqueTag` returns a fresh name each time:

```typescript
const tag = uniqueTag("roving");
define(tag)
  .withRefs((r) => ({ tabs: r.many<HTMLElement>("[role=tab]") }))
  .setup((ctx) => {
    attachRovingFocus(ctx, () => ctx.refs.tabs);
  });

const markup = h(tag, null, TABS_CHILDREN);
const host = mount(markup);
```

### Disconnect and reconnect

`disconnect(host)` takes the host off the page and runs its cleanup. `connect(host)` puts it back in the same place, and setup runs again:

```typescript
const markup = h("x-chart", null, CHILDREN);
const host = mount(markup);

disconnect(host);
host.bars = [{ label: "a", value: 1 }]; // nothing reacts while disconnected
expect(ref(host, "list").children).toHaveLength(0);

connect(host);
expect(ref(host, "list").children).toHaveLength(1);
```

### Errors surface where they happen

jsdom does not throw errors from a component's setup or cleanup. It reports them as a window `error` event instead, and the test carries on with a broken element and fails somewhere else much later. The helpers fix this: `mount` and `connect` rethrow setup errors, and `disconnect` and `cleanup` rethrow cleanup errors, right at the call.

`cleanup` always removes everything before it throws, so one broken component cannot leak into the next test. If several fail, it throws them together as an `AggregateError`.

### Upgrade order

In the browser, the order of imports decides which component sets up first. `define("x-modal")` sets up every `<x-modal>` already on the page, so if it is imported before `x-modal-outlet`, the outlet can call `modal.close()` in its setup. Swap the two imports and the outlet finds a plain element with no `close` method.

A parent whose setup calls into a child depends on import order, and that is a design smell, not a testing problem. If a test needs special steps to get the order right, the component will break the same way the day someone reorders the imports. Let state flow down instead: the parent provides it through a [context](#provide-vs-consume-vs-withcontexts), and the child reacts whenever it sets up. The context protocol works in either order, so a plain `mount` tests it.

```typescript
// Coupled: the outlet's first effect calls into the modal, so x-modal must set up first.
ctx.effect($hash, (hash) => {
  if (!hash) ctx.refs.modal.close();
});

// Decoupled: the outlet provides the state, and the modal follows it.
modalContext.provide(ctx, { $open: computed($hash, (hash) => hash !== "") });

define("x-modal")
  .withContexts({ modal: modalContext })
  .setup((ctx) => {
    ctx.effect(ctx.contexts.modal.$open, (open) => {
      // show or hide the dialog
    });
  });
```

`mount` sets up the outer component first and its children after, the same as a browser. (happy-dom sets up the children first, so a coupled test that passes there can still fail in a browser.) For a coupled component you cannot change yet, connect the child on its own first:

```typescript
const modalMarkup = h("x-modal", { "data-ref": "modal" }, MODAL_CHILDREN);

const modal = mount(modalMarkup);
const host = create("x-modal-outlet");
host.append(modal);
connect(host);
```

Moving the modal disconnects and reconnects it, so its setup runs twice. If the child is not registered at all, stub its methods with `stubElement` instead.

### DOM differences

jsdom and happy-dom are not browsers, and some gaps matter for component tests. Checked against jsdom 29 and happy-dom 20:

|                                                               | jsdom 29                                        | happy-dom 20                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `dialog.showModal()` / `show()` / `close()`                   | missing                                         | works, `close` event fires                                                             |
| `ResizeObserver`, `IntersectionObserver`                      | missing                                         | present                                                                                |
| `matchMedia`                                                  | missing                                         | present                                                                                |
| `element.scrollTo`                                            | missing                                         | present                                                                                |
| `showPopover()`, `element.animate`                            | missing                                         | missing                                                                                |
| Layout (`clientWidth`, `getBoundingClientRect`)               | always `0`                                      | always `0`                                                                             |
| Setup order of nested components                              | outer first, like a browser                     | inner first                                                                            |
| A component whose attribute prop has no fallback              | constructed with its attributes, like a browser | constructed before its attributes land, so the prop's schema rejects the missing value |
| Error thrown in `attributeChangedCallback`                    | window `error` event                            | thrown from `setAttribute`                                                             |
| Error thrown in `connectedCallback` or `disconnectedCallback` | window `error` event                            | thrown from the insertion or removal                                                   |

The helpers handle the last row for you (see [Errors surface where they happen](#errors-surface-where-they-happen)). The rest you fill in yourself, in a `beforeAll`. Keep each shim as small as what the component actually uses, and keep all of them in one shared module so every test gets the same fake.

```typescript
// test/stubs/dialogMethods.ts
// jsdom ships <dialog> without showModal/show, so any component driving a real dialog is
// untestable out of the box. This installs the minimum the spec guarantees and components
// rely on: `open` reflects visibility, and close() fires a non-bubbling "close" event once.
function open(this: HTMLDialogElement) {
  this.open = true;
}

function close(this: HTMLDialogElement) {
  if (!this.open) return;
  this.open = false;
  this.dispatchEvent(new Event("close"));
}

export function installDialogMethods() {
  HTMLDialogElement.prototype.showModal = open;
  HTMLDialogElement.prototype.show = open;
  HTMLDialogElement.prototype.close = close;
}
```

An observer shim wants a handle back, so the test can decide what the callback sees:

```typescript
// test/stubs/intersectionObserver.ts
export function installIntersectionObserver() {
  const created: FakeIntersectionObserver[] = [];

  class FakeIntersectionObserver {
    targets: Element[] = [];
    disconnected = false;
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      created.push(this);
    }
    observe(target: Element) {
      this.targets.push(target);
    }
    unobserve(target: Element) {
      this.targets = this.targets.filter((el) => el !== target);
    }
    disconnect() {
      this.disconnected = true;
    }
    /** Drive the component: hand it the entries a real observer would. */
    trigger(entries: Partial<IntersectionObserverEntry>[]) {
      this.callback(entries as IntersectionObserverEntry[], this as never);
    }
  }

  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  return { latest: () => created.at(-1) };
}
```

Layout has no shim worth writing. Define the geometry the component reads, on the element it reads it from:

```typescript
Object.defineProperty(container, "scrollWidth", {
  value: 900,
  configurable: true,
});
Object.defineProperty(container, "clientWidth", {
  value: 300,
  configurable: true,
});
container.scrollTo = vi.fn();
```

If a component needs so much faked geometry that the test becomes a fiction, that behaviour belongs in an end-to-end test in a real browser instead.

### Rules of thumb

- Copy the real markup, and note in a comment which template it comes from. If the test markup drifts from the template, the test passes while the component is broken.
- **Assert what the DOM shows**: text, attributes, `hidden`, focus, and what the component wrote to a stub. `nanotags/testing` intentionally gives no access to `ctx`.
- Vitest moves `vi.mock` above every import, so its factory cannot use the file's variables. Create the ones it needs with `vi.hoisted`.
- Use `await vi.waitFor(...)` for anything asynchronous. With fake timers, check the state just before and just after the timer fires.
- Test against the platform, not your wrapper. A component that listens on `closest("dialog")` can be tested inside a bare `<dialog>`, which is one reason to build on platform elements.
