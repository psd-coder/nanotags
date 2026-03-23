# nano-wc

<img align="right" width="92" height="92" title="nano-wc logo"
     src="./logo.svg">

[![npm version](https://img.shields.io/npm/v/nano-wc.svg)](https://www.npmjs.com/package/nano-wc)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A thin Web Components wrapper powered by [Nano Stores](https://github.com/nanostores/nanostores) reactivity. It leans on the platform — Custom Elements, standard DOM, regular CSS — instead of reinventing them. The result is a typed, reactive component model with automatic cleanup in under 2.5 KB.

- **No Shadow DOM** — markup stays in the regular DOM, styled with normal CSS
- **Reactive props** via Nano Stores atoms — subscribe when you need updates, `.get()` when you don't
- **Typed fluent builder** — props, refs, and contexts are fully inferred through the chain
- **Automatic cleanup** — event listeners, store subscriptions, and bindings are removed on disconnect
- **Tree-shakeable** — `nano-wc/render` and `nano-wc/context` are separate entry points
- **Standard Schema** — built-in validators plus any [Standard Schema](https://github.com/standard-schema/standard-schema)&#8209;compatible library (Valibot, Zod, ArkType)
- **Hydration-first** — built for statically rendered markup. Pair with [Astro](https://astro.build/), server-rendered HTML, or any static-first setup to hydrate lightweight interactive islands

```html
<x-hello></x-hello>
```

```typescript
import { define } from 'nano-wc';

define("x-hello", () => alert("Hello, world!"));
```

For components with props and refs, use the fluent builder:

```html
<x-counter count="0">
  <span data-ref="display">0</span>
  <button data-ref="increment">+1</button>
</x-counter>
```

```typescript
import { define } from "nano-wc";

const Counter = define("x-counter")
  .withProps((p) => ({
    count: p.number(),
  }))
  .withRefs((r) => ({
    increment: r.one("button"),
    display: r.one("span"),
  }))
  .setup((ctx) => {
    ctx.on(ctx.refs.increment, "click", () => {
      ctx.props.$count.set(ctx.props.$count.get() + 1);
    });

    ctx.effect(ctx.props.$count, (value) => {
      ctx.refs.display.textContent = String(value);
    });
  });
```


---

<img src="https://cdn.evilmartians.com/badges/logo-no-label.svg" alt="" width="22" height="16" />  Made at <b><a href="https://evilmartians.com/devtools?utm_source=nanostores&utm_campaign=devtools-button&utm_medium=github">Evil Martians</a></b>, product consulting for <b>developer tools</b>.

---

## Table of Contents

- [Installation](#installation)
- [Component Builder](#component-builder)
  - [Props](#props)
  - [Refs](#refs)
  - [Setup Return Value](#setup-return-value-mixin)
- [Setup Context](#setup-context)
  - [Reactivity](#reactivity)
  - [Events](#events)
  - [DOM Queries](#dom-queries)
  - [onCleanup](#oncleanup)
- [Extra APIs](#extra-apis)
  - [Context](#context)
  - [Render](#render)
- [Component Communication](#component-communication)
- [Tips & Tricks](#tips--tricks)
  - [Attachments](#attachments)
  - [Typed Events](#typed-events)
  - [Augmenting HTMLElementTagNameMap](#augmenting-htmlelementtagnamemap)
- [FAQ](#faq)
- [License](#license)

## Installation

```bash
npm install nano-wc nanostores
```

`nanostores` is a peer dependency.

## Component Builder

`define(name)` returns a `ComponentBuilder` with an immutable fluent chain. Each step returns a new builder, accumulating type information:

```typescript
define("x-my-comp")                  // ComponentBuilder (entry point)
  .withProps((p) => ({ ... }))       // + prop types
  .withRefs((r) => ({ ... }))        // + ref types
  .setup((ctx) => { ... });          // terminates chain, registers element
```

`withProps`, `withRefs`, and `withContexts` are optional and can appear in any order. `setup` ends the chain — it calls `customElements.define` under the hood and returns a typed constructor.

For simple components, pass setup directly as the second argument:

```typescript
const Logger = define("x-logger", (ctx) => {
  console.log("connected:", ctx.host.tagName);
});
```

### Props

Declare reactive attributes via `withProps`. Each prop becomes:

- An observed HTML attribute (auto-synced via `attributeChangedCallback`)
- A Nano Stores `WritableAtom` at `ctx.props.$propName`
- A typed getter/setter on the element instance

Four built-in validators coerce raw attribute strings to typed values:

| Validator | Coercion | `null` attr |
|-----------|----------|-------------|
| `p.string()` | `String(val)` | `""` |
| `p.number()` | `Number(val)` | `0` |
| `p.boolean()` | `"true"` / `""` &rarr; `true`, `"false"` &rarr; `false` | `false` |
| `p.oneOf(opts)` | Picklist enum, throws on invalid | throws |

```typescript
.withProps((p) => ({
  title: p.string(),
  count: p.number(),
  open:  p.boolean(),
  size:  p.oneOf(["s", "m", "l"]),
}))
```

Pass `null` as fallback to make a prop nullable (inferred type becomes `T | null`):

```typescript
.withProps((p) => ({
  label: p.string(null),                // string | null
  size:  p.oneOf(["s", "m", "l"], null), // "s" | "m" | "l" | null
}))
```

Props use [Standard Schema](https://github.com/standard-schema/standard-schema) internally, so any compatible validator works as a custom prop schema.

#### JSON Props

For complex data, use `p.json()` with a Standard Schema validator:

```typescript
import * as v from "valibot";

.withProps((p) => ({
  items: p.json(v.array(v.object({ id: v.number(), name: v.string() })), []),
  config: p.json(v.object({ theme: v.string() })),  // defaults to null → T | null
}))
```

JSON props are **not** observed attributes. They hydrate once on connect from a `<script type="application/json">` tag (preferred) or a kebab-case attribute, and the setter writes directly to the atom:

```html
<x-list>
  <script type="application/json" data-prop="items">
    [{ "id": 1, "name": "Alice" }, { "id": 2, "name": "Bob" }]
  </script>
</x-list>
```

```typescript
el.items = [{ id: 3, name: "Charlie" }]; // updates atom, no DOM attribute
```

#### Property-only Props

Set `attribute: false` to create a prop that lives only as a JS property and a Nano Stores atom — no HTML attribute. Defined on the element in the **constructor**, available immediately after `document.createElement()`:

```typescript
.withProps((p) => ({
  label: p.string(),                               // attribute-backed
  value: { schema: p.string(""), attribute: false }, // property-only
}))
```

### Refs

Declare typed element references via `withRefs`. Refs query the component's own DOM, skipping elements inside nested custom elements  elements by default.

`r.one()` returns a single element (throws if missing), `r.many()` returns an array (throws if empty). When you pass a tag name, it's used for both **type inference** and **runtime validation**:

```typescript
.withRefs((r) => ({
  trigger: r.one("button"),   // HTMLButtonElement — validated
  items:   r.many("li"),      // HTMLLIElement[]   — validated
}))
```

By default, refs match `[data-ref="name"]`. Non-tag strings (containing `.`, `#`, `[`, etc.) are treated as CSS selectors:

```typescript
.withRefs((r) => ({
  custom: r.one(".my-trigger"),                       // Element
  typed:  r.one<HTMLButtonElement>(".my-trigger"),   // HTMLButtonElement (type-only)
  any:    r.many<HTMLElement>(),                      // HTMLElement[] (no tag validation)
}))
```

#### Ref Scoping and Owned Refs

Refs are **scoped** — elements inside nested custom elements are skipped. This keeps components independent.

For **slot-based composition** (e.g. Astro components passed into structural wrappers), prefix `data-ref` with the owning component's tag name to collect refs deeply:

```html
<x-code-example>
  <x-resizable-panes>
    <button data-ref="x-code-example:tabs">...</button>
  </x-resizable-panes>
</x-code-example>
```

The JS definition stays the same — each ref automatically checks both `[data-ref="name"]` (shallow) and `[data-ref="x-component:name"]` (deep). You can mix owned and unowned refs freely.

### Setup Return Value (Mixin)

Returning an object from `setup` assigns its members to the element instance, fully typed on the constructor. Mixin methods are available only after the element is connected (i.e. after `setup` runs):

```typescript
const Timer = define("x-timer").setup((ctx) => {
  let id: number;
  return {
    start() { id = setInterval(() => ctx.emit("tick"), 1000); },
    stop()  { clearInterval(id); },
  };
});

document.body.appendChild(new Timer());
document.querySelector("x-timer")!.start(); // typed
```

## Setup Context

The `setup` function receives a context object (`ctx`) with the following properties and methods.

**Properties:**

- `ctx.host` — the component's `HTMLElement`
- `ctx.props` — reactive prop stores, each prefixed with `$` (e.g. `ctx.props.$count`)
- `ctx.refs` — resolved element references
- `ctx.contexts` — resolved context values (when using `withContexts`)

### Reactivity

#### `effect(store, callback)` / `effect([storeA, storeB], callback)`

Subscribe to one or more Nano Stores atoms. Callback fires immediately with current value(s). Unsubscribes on disconnect.

```typescript
ctx.effect(ctx.props.$count, (count) => {
  ctx.refs.display.textContent = String(count);
});

ctx.effect([storeA, storeB], (a, b) => { /* ... */ });
```

#### `bind(store, element, options?)`

Two-way binds a DOM control to a Nano Stores atom. The store is the source of truth.

**No options** — auto-detects control type:

| Control | Property | Listens to |
|---------|----------|------------|
| `input[type=checkbox]` | `.checked` | `change` |
| `input[type=number\|range]` | `.valueAsNumber` | `input` |
| `input` / `textarea` | `.value` | `input` |
| `select` | `.value` | `change` |
| Custom element with `.value` | `.value` | `change` |

```typescript
ctx.bind($name, ctx.refs.nameInput);
ctx.bind($agreed, ctx.refs.checkbox);
```

**With options** — bind to any element property. Omit `event` for one-way (store &rarr; element):

```typescript
ctx.bind($theme, el, { prop: "theme" });                  // one-way
ctx.bind($val, el, { prop: "value", event: "change" });   // two-way
```

> **Note:** When binding to a custom element, `.value` (or the target property) must be defined via `withProps`, not as a mixin return value. Props are available from the constructor, while mixin members only exist after `connectedCallback` — `bind` needs the property to be there immediately.

### Events

#### `on(target, type, listener, options?)`

Attach event listeners with automatic cleanup. Accepts a single element, an array, `document`, or `window`. Event types are fully inferred for each target (`HTMLElementEventMap`, `DocumentEventMap`, `WindowEventMap`):

```typescript
ctx.on(ctx.refs.trigger, "click", (e) => { /* ... */ });
ctx.on([...ctx.refs.items], "mouseenter", (e) => { /* ... */ });
ctx.on(document, "keydown", (e) => { /* ... */ });
```

#### `emit(event)` / `emit(name, detail?, options?)`

Dispatch an existing `Event` or construct and dispatch a bubbling `CustomEvent`:

```typescript
ctx.emit(new CustomEvent("reset"));
ctx.emit("change", { value: 42 });
```

### DOM Queries

Typed wrappers around `querySelector`/`querySelectorAll` that **throw when nothing matches**. Since nano-wc targets static markup, a missing element is usually a bug.

```typescript
ctx.getElement("input");              // HTMLInputElement (throws if missing)
// Custom parent, especially useful for rendering templates
ctx.getElement(customParent, ".item");    // Element
ctx.getElements("button");           // HTMLButtonElement[]
```

For nullable results, use `ctx.host.querySelector()` directly.

### `onCleanup`

Register arbitrary teardown logic to run on disconnect:

```typescript
const raf = requestAnimationFrame(tick);
ctx.onCleanup(() => cancelAnimationFrame(raf));
```

## Extra APIs

### Context

Cross-component communication via event-based context — similar to React's `useContext`. Import from `nano-wc/context` (~0.4 KB).

```typescript
import { createContext } from "nano-wc/context";

const tabsCtx = createContext<TabsAPI>("tabs");
```

**Provider** — call `provide` in the parent's setup:

```typescript
define("x-tabs").setup((ctx) => {
  const $active = atom(0);
  tabsCtx.provide(ctx, {
    $active,
    register(tab: HTMLElement) { /* ... */ },
  });
});
```

**Consumer** — declare required contexts with `withContexts`. Setup is deferred until all contexts resolve:

```typescript
define("x-tab")
  .withContexts({ tabs: tabsCtx })
  .setup((ctx) => {
    ctx.contexts.tabs.register(ctx.host);
    ctx.effect(ctx.contexts.tabs.$active, (index) => { /* ... */ });
  });
```

If a context never resolves (no provider ancestor), setup never runs. For dynamic/conditional access, use `consume()` directly:

```typescript
tabsCtx.consume(ctx, (value) => { /* ... */ });
```

**How it works:** `provide()` listens for `context-request` events on the host. `consume()` dispatches a `context-request` event that bubbles up. If the provider isn't upgraded yet, a document-level handler stores the pending request and resolves it when the provider calls `provide()`.

Based on the [Web Components Community Group Context Protocol](https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md).

### Render

Keyed reconciliation for dynamic content. Import from `nano-wc/render` (~0.4 KB).

#### `renderList(container, template, options)`

Reconcile a data array against DOM by key. Creates, updates, removes, and reorders — without recreating the whole list. Skips `update` when the item reference hasn't changed (`===`).

```html
<ul data-ref="list">
  <template data-ref="rowTpl">
    <li><span class="name"></span></li>
  </template>
</ul>
```

```typescript
import { renderList } from "nano-wc/render";

ctx.effect($users, (users) => {
  renderList(ctx.refs.list, ctx.refs.rowTpl, {
    data: users,
    key: (user) => user.id,
    update: (el, user) => {
      ctx.getElement(el, ".name").textContent = user.name;
    },
  });
});
```

Options: `data` (readonly array), `key(item, index)` (unique key), `update(el, item)` (called on create and when item ref changes).

#### `render(container, template, options?)`

Single-item rendering. Options are optional — omit for static templates:

```typescript
import { render } from "nano-wc/render";

render(container, loadingTpl);                          // static
render(container, profileTpl, {                         // data-driven
  data: user,
  update: (el, u) => { el.setAttribute("name", u.name); },
});
```

Switching templates replaces the previous element.

Both `render` and `renderList` **own the entire container** — any child not part of the current cycle is removed.

## Component Communication

Parents pass data down through props. Children notify parents via custom events (`ctx.emit` / `ctx.on`). When a child needs ongoing access to parent state, use the context protocol (`nano-wc/context`). Unrelated components share [Nano Stores](https://github.com/nanostores/nanostores) atoms directly.

### Parent &rarr; Child

The primary channel. A parent sets attributes or properties on its children, and each child reacts via its own prop stores:

```typescript
// Parent sets attribute — child's $mode atom updates automatically
childEl.setAttribute("mode", "dark");

// Or via property
childEl.mode = "dark";
```

### Child &rarr; Parent

Standard DOM events. The child dispatches with `ctx.emit`, the parent listens with `ctx.on`:

```typescript
// Child
ctx.emit("tab:select", { index: 2 });

// Parent
ctx.on(ctx.refs.tabs, "tab:select", (e) => {
  console.log(e.detail.index); // 2
});
```

### Child needs parent state or API

Use the [Context protocol](#context). The parent exposes a value via `provide()`, descendants receive it via `consume()` or `withContexts`. This avoids tight coupling and works regardless of DOM depth.

### Siblings or unrelated components

Share a Nano Stores atom directly. Import the same store in both components and react via `ctx.effect`:

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

You can also combine both approaches — provide a Nano Stores atom through the Context protocol so that siblings under the same parent share state without a global import:

```typescript
// parent provides a shared store via context
const filterCtx = createContext<WritableAtom<string>>("filter");

define("x-filter-panel").setup((ctx) => {
  const $filter = atom("");
  filterCtx.provide(ctx, $filter);
});

// child A writes to the store
define("x-search-input")
  .withRefs((r) => ({ input: r.one('input') }))
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

## Tips & Tricks

### Attachments

Reusable functions that receive `ctx` and wire up behavior — effects, listeners, cleanup — without creating a new component. Think composable mixins:

```typescript
export function attachRovingFocus(
  ctx: SetupContext,
  container: HTMLElement,
  items: HTMLElement[],
) {
  let active = 0;
  items.forEach((item, i) => item.setAttribute("tabindex", i === 0 ? "0" : "-1"));

  ctx.on(container, "keydown", (e) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    active = (active + dir + items.length) % items.length;
    items.forEach((item, i) => item.setAttribute("tabindex", i === active ? "0" : "-1"));
    items[active].focus();
  });
}
```

```typescript
define("x-tabs")
  .withRefs((r) => ({ tablist: r.one("div"), tabs: r.many("[role=tab]") }))
  .setup((ctx) => {
    attachRovingFocus(ctx, ctx.refs.tablist, ctx.refs.tabs);
  });
```

Since attachments receive `ctx`, listeners and effects are automatically cleaned up on disconnect.

### Typed Events

`TypedEvent<Target, Detail>` is a type-only helper that narrows `CustomEvent` to a specific `target` and `detail`. Combine with `HTMLElementEventMap` augmentation for app-wide type-safe events:

```typescript
import type { TypedEvent } from "nano-wc";

type TabsChangedEvent = TypedEvent<InstanceType<typeof XTabs>, { index: number }>;

declare global {
  interface HTMLElementEventMap {
    "tabs:changed": TabsChangedEvent;
  }
}

// Emitting:
ctx.emit("tabs:changed", { index: 2 });

// Listening:
ctx.on(tabsEl, "tabs:changed", (e) => {
  e.target;  // XTabs instance
  e.detail;  // { index: number }
});
```

### Augmenting HTMLElementTagNameMap

Register your element so that refs (`r.one`/`r.many`), `ctx.getElement`, `ctx.getElements` return properly typed instances:

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

## FAQ

**Why no Shadow DOM?**

Shadow DOM brings encapsulation at the cost of complexity: styling piercing, slotting quirks, form participation hacks. nano-wc targets server-rendered or static markup where global CSS is already the norm. Keeping elements in the light DOM means your existing styles, CSS frameworks, and dev tools work as expected.

**How does it compare to Lit / Stencil / vanilla CE?**

nano-wc is intentionally minimal. It doesn't ship a template engine, virtual DOM, or lifecycle beyond connect/disconnect. If you need those, use Lit. If you want a thin reactivity layer over standard custom elements with TypeScript-first DX, nano-wc is a good fit.

**Does it work with SSR frameworks?**

Yes. nano-wc is designed for hydration — render markup on the server (Astro, PHP, Rails, static HTML), then hydrate on the client. Props are read from attributes, refs are resolved from existing DOM.

**What happens when a context provider is missing?**

When `withContexts` is used, setup is deferred until all declared contexts resolve. If a provider never appears, setup never runs and the element stays inert. Use `consume()` directly for contexts that may or may not be available.

## License

MIT
