---
title: API
description: Complete API reference for nano-wc
order: 2
---

## Builder API

`define(name)` returns a `ComponentBuilder` with a fluent, immutable chain. Each step returns a new builder instance, accumulating type information along the way:

```typescript
define("x-my-comp")            // → ComponentBuilder (entry point)
  .withProps((p) => ({ ... })) // → new ComponentBuilder with prop types added
  .withRefs((r) => ({ ... }))  // → new ComponentBuilder with ref types added
  .setup((ctx) => { ... });    // → ComponentCtor (terminates the chain, registers the element)
```

For simple components that don't need props or refs, pass the setup function directly as the second argument — skipping the builder chain entirely:

```typescript
const Logger = define("x-logger", (ctx) => {
  console.log("connected:", ctx.host.tagName);
});
```

In the fluent form, `withProps` and `withRefs` are optional and can appear in any order. `setup` ends the chain — it calls `customElements.define` under the hood and returns a typed constructor you can use for `consume`/`instanceof`/`typeof` checks.

## Props

Declare validated, reactive attributes via `withProps`. Each prop becomes:

- An observed HTML attribute (auto-synced via `attributeChangedCallback`)
- A nanostores `WritableAtom` at `ctx.props.$propName`
- A typed getter/setter on the element instance

Every prop is exposed as a nanostore for a uniform, lightweight API — even props that don't strictly need reactivity. This keeps the surface area consistent: subscribe when you need updates, call `store.get()` when you just need the current value once.

Five built-in validators coerce raw attribute strings to typed values (plus `p.json()` for complex data — see [JSON props](#json-props)):

- `p.string()` — coerces any value to string (`null` → `""`)
- `p.number()` — parses to number (`null` → `0`, throws on non-numeric)
- `p.boolean()` — `"true"` / `""` (bare attr) → `true`, `"false"` / `null` → `false`
- `p.oneOf(options)` — picklist enum (`"a"` → `"a"`, throws on invalid)

```typescript
.withProps((p) => ({
  title: p.string(),
  count: p.number(),
  open:  p.boolean(),
  size:  p.oneOf(["s", "m", "l"]),
}))
```

Each validator accepts an optional fallback value used when the attribute is absent. Pass `null` as fallback to make the prop nullable — the inferred type becomes `T | null`:

```typescript
.withProps((p) => ({
  label: p.string(null),    // string | null — absent attr → null instead of ""
  count: p.number(null),    // number | null
  open:  p.boolean(null),   // boolean | null
  size:  p.oneOf(["s", "m", "l"], null),  // "s" | "m" | "l" | null
}))
```

Props use [Standard Schema](https://github.com/standard-schema/standard-schema) internally, so any compatible validator (Valibot, Zod, ArkType) works as a custom prop schema too.

### JSON props

For complex data that doesn't fit into a string attribute, use `p.json()`. It accepts any Standard Schema validator and an optional fallback:

```typescript
.withProps((p) => ({
  items: p.json(v.array(v.object({ id: v.number(), name: v.string() })), []),
  config: p.json(v.object({ theme: v.string() })),  // fallback defaults to null → T | null
}))
```

JSON props differ from attribute-backed props:

- **Not observed** — not in `observedAttributes`, no `attributeChangedCallback` re-parsing
- **Setter writes to atom directly** — no attribute created in the DOM
- **Hydrated once on connect** — reads from a `<script type="application/json">` tag, falls back to a kebab-case attribute

```html
<!-- preferred: script tag (no attribute bloat, no escaping) -->
<x-list>
  <script type="application/json" data-prop="items">
    [
      { "id": 1, "name": "Alice" },
      { "id": 2, "name": "Bob" }
    ]
  </script>
</x-list>

<!-- also works: inline attribute (JSON string) -->
<x-list items='[{"id":1,"name":"Alice"}]'></x-list>
```

After hydration the value can be set programmatically:

```typescript
el.items = [{ id: 3, name: "Charlie" }]; // updates atom directly, no DOM attribute
```

## Refs

Declare typed element references via `withRefs`. Refs query the component's own DOM, skipping elements inside nested custom elements to respect component boundaries.

Both `r.one()` and `r.many()` are generic. When you pass a tag name, it's used for both **type inference** (via `HTMLElementTagNameMap`) and **runtime validation** (checks that matched element's tag actually matches):

```typescript
.withRefs((r) => ({
  trigger: r.one("button"),   // HTMLButtonElement — validated at runtime
  items:   r.many("li"),      // HTMLLIElement[]   — validated at runtime
}))
```

By default, refs match `[data-ref="name"]`. When you need a custom CSS selector, pass it as a string — non-tag strings (containing `.`, `#`, `[`, etc.) are treated as selectors. The return type falls back to `Element` since there's no tag name to infer from:

```typescript
.withRefs((r) => ({
  custom: r.one(".my-trigger"),  // Element (no runtime tag check)
}))
```

To get proper typing with a custom selector, pass the tag name as a generic parameter — though this is type-only, no runtime tag validation:

```typescript
.withRefs((r) => ({
  custom: r.one<"button">(".my-trigger"),  // HTMLButtonElement (no runtime tag check)
}))
```

This also works with custom element tag names — if you [augment `HTMLElementTagNameMap`](#augmenting-htmlelementtagnamemap), refs to your own components are fully typed:

```typescript
r.one("x-child"); // typed as InstanceType<typeof XChild>, validated at runtime
```

### Typing refs to custom elements

When referencing custom elements that aren't in `HTMLElementTagNameMap`, you have two additional options:

**Direct Element generic** — pass an arbitrary Element subtype without any augmentation:

```typescript
.withRefs((r) => ({
  panes: r.many<HTMLElement>(),
  editor: r.one<HTMLElement & { getValue(): string }>(),
}))
```

No runtime tag validation — only type narrowing. Works with any `Element` subtype.

**Array of tags** — pass multiple tag names for a union type (requires `HTMLElementTagNameMap` augmentation for custom tags):

```typescript
.withRefs((r) => ({
  trigger: r.one(["button", "a"]),  // HTMLButtonElement | HTMLAnchorElement
  items:   r.many(["li", "dt"]),    // (HTMLLIElement | HTMLDListElement)[]
}))
```

No runtime tag validation for arrays — type inferred via `HTMLElementTagNameMap` union.

Both builders throw if refs can't be resolved:

- `r.one()` — throws if the element is missing
- `r.many()` — throws if no elements found

### Ref scoping and ownership

By default, refs are **scoped** — elements inside nested custom elements are skipped. This keeps components independent: an `x-tabs` component won't accidentally collect refs from a deeply nested `x-dialog`.

```html
<x-parent>
  <span data-ref="title">found ✓</span>
  <x-child>
    <span data-ref="subtitle">skipped ✗</span>
  </x-child>
</x-parent>
```

This works well for flat components, but breaks with **slot-based composition**. Frameworks like Astro compose UI by passing components into structural wrappers (split panes, collapsible sections) as slot content. These wrappers might be custom elements too, so they block ref resolution — even though the slotted content conceptually belongs to the parent:

```astro
<!-- x-code-example owns all these refs, but ResizablePanes blocks them -->
<x-code-example>
  <ResizablePanes>           <!-- ← custom element boundary blocks refs below -->
    <ResizablePane>
      <button data-ref="tabs">...</button>
      <CodeEditor data-ref="editor" />
    </ResizablePane>
  </ResizablePanes>
</x-code-example>
```

**Owned refs** solve this. Prefix `data-ref` with the owning component's tag name — the ref is collected deeply, ignoring any custom element boundaries:

```astro
<x-code-example>
  <ResizablePanes>
    <ResizablePane>
      <button data-ref="x-code-example:tabs">...</button>
      <CodeEditor data-ref="x-code-example:editor" />
    </ResizablePane>
  </ResizablePanes>
</x-code-example>
```

The JS definition stays exactly the same — no options needed:

```typescript
define("x-code-example").withRefs((r) => ({
  tabs: r.many("button"),
  editor: r.one("x-code-editor"),
}));
```

Each ref automatically checks both selectors: `[data-ref="name"]` (shallow, with blocking) and `[data-ref="x-component:name"]` (deep, no blocking). You can freely mix owned and unowned refs in the same component.

## Setup Context

The `setup` function receives a context object with the following properties and methods.

### Properties

- `ctx.host` — the component's `HTMLElement` itself, useful for appending content or reading layout
- `ctx.props` — reactive prop stores, each prefixed with `$` (e.g. `ctx.props.$count`). See [Props](#props)
- `ctx.refs` — resolved element references. See [Refs](#refs)

### Reactivity

All reactive methods (`effect`, `sync`, `bind`) use structural store types instead of nanostores-specific imports. This is intentional — it avoids coupling to nanostores internal API and makes the methods work with any store that matches the shape:

```typescript
type ReadableStore<V> = {
  get(): V;
  subscribe(cb: (value: V) => void): () => void;
};
type WritableStore<V> = ReadableStore<V> & { set(value: V): void };
```

Any nanostores atom satisfies these interfaces automatically. You can also pass custom objects — useful for adapting third-party state managers or creating ad-hoc bindings with custom `get`/`set` logic.

#### `effect(store, callback)` / `effect([storeA, storeB], callback)`

Subscribe to one or more stores. Callback fires immediately with current value(s). Unsubscribes on disconnect.

```typescript
ctx.effect(ctx.props.$count, (count) => {
  ctx.refs.display.textContent = String(count);
});

ctx.effect([storeA, storeB], (a, b) => {
  /* ... */
});
```

#### `sync(prop, store, options?)`

Two-way sync between a writable store and a component prop. Changes propagate in both directions with `Object.is` equality guard to prevent loops.

```typescript
const $name = atom("initial");
ctx.sync("title", $name);

// With transforms across the boundary
ctx.sync("count", $offset, {
  get: (offset) => offset * 2, // store → prop
  set: (count) => count / 2, // prop → store
});
```

#### `bind(control, store)`

Two-way binds a DOM control to a writable store. The store is the source of truth — the control is set from the store on bind. Works with native form controls and any custom element that exposes a `.value` property and emits `change` events.

**Native controls** (auto-detected):

- `input[type=checkbox]` — syncs `.checked` with a boolean store (listens to `change`)
- `input[type=number]` / `input[type=range]` — reads `.valueAsNumber` automatically (listens to `input`)
- `input[type=text|email|...]` / `textarea` — syncs `.value` with a string store (listens to `input`)
- `select` — syncs `.value` with a string store (listens to `change`)

**Custom elements** — any element with a `.value` property works. Default event is `change`:

```typescript
const $name = atom("Ada");
ctx.bind(ctx.refs.name, $name);

const $agreed = atom(false);
ctx.bind(ctx.refs.agree, $agreed);

// Custom element with .value + change event
ctx.bind(ctx.refs.colorPicker, $color);
```

### Events

#### `on(target, type, listener, options?)`

Attach event listeners with automatic cleanup on disconnect. Accepts a single element, an array of elements, `document`, or `window`.

```typescript
ctx.on(ctx.refs.trigger, "click", (e) => {
  /* ... */
});
ctx.on([...ctx.refs.items], "mouseenter", (e) => {
  /* ... */
});
ctx.on(document, "keydown", (e) => {
  /* ... */
});
```

#### `emit(name, detail?, options?)` / `emit(event)`

Dispatch a bubbling, composed `CustomEvent`, or re-dispatch an existing `Event`.

```typescript
ctx.emit("change", { value: 42 });
ctx.emit(new CustomEvent("reset"));
```

### DOM Queries

Typed wrappers around `querySelector`/`querySelectorAll` that **throw when nothing matches**. Since nano-wc targets static/server-rendered markup, a missing element is always a bug — fail fast instead of silently returning `null`. Tag-name selectors narrow the return type automatically.

If you prefer nullable results, use `querySelector`/`querySelectorAll` directly on `ctx.host`.

#### `getElement(selector)` / `getElement(root, selector)`

Query a single element. Throws if not found.

```typescript
const input = ctx.getElement("input"); // HTMLInputElement
const el = ctx.getElement(fragment, ".item"); // Element
```

#### `getElements(selector)` / `getElements(root, selector)`

Query all matching elements. Throws if none found.

```typescript
const buttons = ctx.getElements("button"); // HTMLButtonElement[]
```

### Misc

#### `consume(ComponentCtor)`

Find the nearest ancestor component of the given type — similar to React's `useContext`. Useful for cross-component communication when a component is composed of sub-components. Throws if no ancestor found.

```typescript
// x-tab consumes its parent x-tabs to register itself
const XTabs = define("x-tabs").setup((ctx) => {
  const tabs: HTMLElement[] = [];
  return {
    register(tab: HTMLElement) {
      tabs.push(tab);
    },
  };
});

define("x-tab").setup((ctx) => {
  const tabs = ctx.consume(XTabs); // fully typed, has .register()
  tabs.register(ctx.host);
});
```

#### `onCleanup(callback)`

Register arbitrary teardown logic to run on disconnect.

```typescript
const raf = requestAnimationFrame(tick);
ctx.onCleanup(() => cancelAnimationFrame(raf));
```

## Rendering

Keyed reconciliation utilities for dynamic content. Import from the separate `nano-wc/render` entry — only pay for them when you use them.

```typescript
import { renderList, render } from "nano-wc/render";
```

### `renderList(container, template, options)`

Reconcile a data array against existing DOM elements by key. Creates new elements from a template, updates existing ones, removes stale ones, and reorders as needed — without destroying/recreating the whole list. Skips `update` when the item reference hasn't changed (`===`).

```html
<x-user-list>
  <ul data-ref="list">
    <template data-ref="rowTpl">
      <li><span class="name"></span></li>
    </template>
  </ul>
</x-user-list>
```

```typescript
import { renderList } from "nano-wc/render";

const UserList = define("x-user-list")
  .withRefs((r) => ({ list: r.one("ul"), rowTpl: r.one("template") }))
  .setup((ctx) => {
    ctx.effect($users, (users) => {
      renderList(ctx.refs.list, ctx.refs.rowTpl, {
        data: users,
        key: (user) => user.id,
        update: (el, user) => {
          ctx.getElement(el, ".name").textContent = user.name;
        },
      });
    });
  });
```

Options:

- `data` — `readonly T[]` of items to render
- `key(item, index)` — returns a unique `string | number` key per item
- `update(el, item)` — called on create and on subsequent renders when the item reference changes

Both `render` and `renderList` **own the entire container** — any child not part of the current render cycle is removed. Containers must be dedicated to rendered content.

### `render(container, template, options?)`

Single-item rendering with optional data. `options` is optional — omit it for static templates (loading spinners, error states, empty placeholders).

```typescript
import { render } from "nano-wc/render";

// Static template — no data needed
render(container, loadingTpl);

// Data-driven
render(container, profileTpl, {
  data: user,
  update: (el, u) => {
    el.setAttribute("name", u.name);
  },
});
```

Switching templates correctly replaces the previous element:

```typescript
ctx.effect($state, (state) => {
  if (state.loading) {
    render(container, loadingTpl);
  } else if (state.error) {
    render(container, errorTpl);
  } else {
    render(container, itemTpl, {
      data: state.data,
      update: (el, d) => {
        /* ... */
      },
    });
  }
});
```

To clear: `container.replaceChildren()`.

Internally delegates to `renderList` with a single-element array.

## Setup Return Value (Mixin)

Returning an object from `setup` assigns its members to the element instance, fully typed on the constructor:

```typescript
const Timer = define("x-timer").setup((ctx) => {
  let id: number;
  return {
    start() {
      id = setInterval(() => ctx.emit("tick"), 1000);
    },
    stop() {
      clearInterval(id);
    },
  };
});

const el = new Timer();
el.start(); // typed
```

## Attachments

Attachments are reusable functions that receive the setup context and wire up behavior — effects, event listeners, cleanup — without creating a new component. Think of them as composable mixins for cross-cutting concerns like keyboard navigation, focus trapping, or drag handling.

```typescript
// attachRovingFocus.ts
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
    if (next !== -1) {
      e.preventDefault();
      setActive(next);
      items[next].focus();
      options.onFocus?.(items[next]);
    }
  });
}
```

Use it in any component's setup:

```typescript
import { attachRovingFocus } from "./attachRovingFocus";

define("x-tabs")
  .withRefs((r) => ({ tablist: r.one("div"), tabs: r.many("[role=tab]") }))
  .setup((ctx) => {
    attachRovingFocus(ctx, ctx.refs.tablist, ctx.refs.tabs, {
      onFocus: (el) => activate(el.dataset.value),
    });
  });
```

Since attachments receive `ctx`, any listeners or effects they register are automatically cleaned up on disconnect — no manual teardown needed. They can also return values to expose state or methods to the calling component.

## TypeScript

### Typed events

`TypedEvent<Target, Detail>` is a helper type for `CustomEvent` with typed `target` and `detail`. Combine it with `HTMLElementEventMap` augmentation to make custom events type-safe across the whole app:

```typescript
import type { TypedEvent } from "nano-wc";

type TabsChangedEvent = TypedEvent<
  InstanceType<typeof XTabs>,
  { index: number }
>;

declare global {
  interface HTMLElementEventMap {
    "tabs:changed": TabsChangedEvent;
  }
}

// emitting — inside x-tabs setup:
ctx.emit("tabs:changed", { index: 2 });

// listening — anywhere in the app:
ctx.on(tabsEl, "tabs:changed", (e) => {
  e.target; // XTabs instance
  e.detail; // { index: number }
});
```

### Augmenting HTMLElementTagNameMap

Register your element for type-safe `querySelector`/`createElement`:

```typescript
declare global {
  interface HTMLElementTagNameMap {
    "x-my-el": InstanceType<typeof MyEl>;
  }
}

const MyEl = define("x-my-el").withProps(/* ... */).setup(/* ... */);
```

## Lifecycle

1. **Constructor** — reactive prop stores created, getters/setters defined (attribute-backed props read their initial value; JSON props start as `undefined`)
2. **connectedCallback** — all props hydrated (each prop's `get` is called → parsed through schema → atom set), descendants upgraded, `setup` runs, mixin applied
3. **attributeChangedCallback** — attribute change validated and pushed to prop store (attribute-backed props only)
4. **disconnectedCallback** — cache cleared, all cleanups run (listeners, effects, syncs, bindings)

Re-connecting a component runs `setup` again with a fresh cache and new cleanup scope.
