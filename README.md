# nano-wc

[![npm version](https://img.shields.io/npm/v/nano-wc.svg)](https://www.npmjs.com/package/nano-wc)
[![Bundle size](https://img.shields.io/badge/Bundle_size-from_2906_B-brightgreen)](https://github.com/psdcoder/nano-wc/blob/main/package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Thin, Web Components wrapper with [nanostores](https://github.com/nanostores/nanostores) reactivity. No Shadow DOM — your markup stays in the regular DOM, styled with normal CSS. Typesafe fluent builder, props/refs, automatic cleanup, and two-way store binding — all under 3 KB.

Shines with statically rendered markup — pair it with [Astro](https://astro.build/), server-rendered HTML, or any static-first setup to hydrate lightweight interactive islands.

## Install

```bash
npm install nano-wc nanostores
```

## Quick Start

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

For simple components without props or refs, pass setup directly:

```typescript
const Logger = define("x-logger", (ctx) => {
  console.log("connected:", ctx.host.tagName);
});
```

## Builder API

`define(name)` returns a `ComponentBuilder` with a fluent, immutable chain. Each step returns a new builder instance, accumulating type information along the way:

```typescript
define("x-my-comp")          // → ComponentBuilder (entry point)
  .withProps((p) => ({ ... }))  // → new ComponentBuilder with prop types added
  .withRefs((r) => ({ ... }))   // → new ComponentBuilder with ref types added
  .setup((ctx) => { ... });     // → ComponentCtor (terminates the chain, registers the element)
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

Three built-in validators coerce raw attribute strings to typed values:

- `p.string()` — coerces any value to string (`null` → `""`)
- `p.number()` — parses to number (`null` → `0`, throws on non-numeric)
- `p.boolean()` — `"true"` / `""` (bare attr) → `true`, `"false"` / `null` → `false`

```typescript
.withProps((p) => ({
  title: p.string(),
  count: p.number(),
  open:  p.boolean(),
}))
```

Props use [Standard Schema](https://github.com/standard-schema/standard-schema) internally, so any compatible validator (Valibot, Zod, ArkType) works as a custom prop schema too.

## Refs

Declare typed element references via `withRefs`. Refs query the component's own DOM, skipping elements inside nested custom elements to respect component boundaries.

Both `r.one()` and `r.many()` are generic. When you pass a tag name, it's used for both **type inference** (via `HTMLElementTagNameMap`) and **runtime validation** (checks that matched element's tag actually matches):

```typescript
.withRefs((r) => ({
  trigger: r.one("button"),   // HTMLButtonElement — validated at runtime
  items:   r.many("li"),      // HTMLLIElement[]   — validated at runtime
}))
```

By default, refs match `[data-ref="name"]`. When you need a custom CSS selector, pass an options object instead. The return type falls back to `Element` since there's no tag name to infer from:

```typescript
.withRefs((r) => ({
  custom: r.one({ selector: ".my-trigger" }),  // Element (no runtime tag check)
}))
```

To get proper typing with a custom selector, pass the tag name as a generic parameter — though this is type-only, no runtime tag validation:

```typescript
.withRefs((r) => ({
  custom: r.one<"button">({ selector: ".my-trigger" }),  // HTMLButtonElement (no runtime tag check)
}))
```

This also works with custom element tag names — if you [augment `HTMLElementTagNameMap`](#augmenting-htmlelementtagnamemap), refs to your own components are fully typed:

```typescript
r.one("x-child")  // typed as InstanceType<typeof XChild>, validated at runtime
```

Both builders throw if refs can't be resolved:
- `r.one()` — throws if the element is missing
- `r.many()` — throws if no elements found

### Cross-component refs

Refs inside nested custom elements are ignored by default, keeping components independent. But when a component is composed of sub-components (e.g. `x-tabs` + `x-tab`), the parent needs to reach into its children. Whitelist them with `includeComponents`:

```typescript
// x-tabs needs to find <button> refs rendered by each <x-tab>
tabs: r.many("button", { includeComponents: ["x-tab"] })
```

## Setup Context

The `setup` function receives a context object with the following properties and methods:

### Properties

- `ctx.host` — the component's `HTMLElement` itself, useful for appending content or reading layout
- `ctx.props` — reactive prop stores, each prefixed with `$` (e.g. `ctx.props.$count`). See [Props](#props)
- `ctx.refs` — resolved element references. See [Refs](#refs)

### Reactivity

#### `effect(store, callback)` / `effect([storeA, storeB], callback)`

Subscribe to one or more nanostores. Callback fires immediately with current value(s). Unsubscribes on disconnect.

```typescript
ctx.effect(ctx.props.$count, (count) => {
  ctx.refs.display.textContent = String(count);
});

ctx.effect([storeA, storeB], (a, b) => { /* ... */ });
```

#### `bind(prop, store, options?)`

Two-way sync between an external store and a component prop. Changes propagate in both directions with `Object.is` equality guard to prevent loops.

```typescript
const $name = atom("initial");
ctx.bind("title", $name);

// With transforms across the boundary
ctx.bind("count", $offset, {
  get: (offset) => offset * 2,      // store → prop
  set: (count) => count / 2,        // prop → store
});
```

### Events

#### `on(target, type, listener, options?)`

Attach event listeners with automatic cleanup on disconnect. Accepts a single element, an array of elements, `document`, or `window`.

```typescript
ctx.on(ctx.refs.trigger, "click", (e) => { /* ... */ });
ctx.on([...ctx.refs.items], "mouseenter", (e) => { /* ... */ });
ctx.on(document, "keydown", (e) => { /* ... */ });
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

### Templates

The framework is designed to work with server-rendered or statically present markup. But sometimes content needs to be built dynamically — for that, define `<template>` elements inside your component and use these methods to clone and populate them.

- `render(name, data?, fill?)` — clone a `<template name="...">`, optionally populate via `fill`
- `renderList(name, items, fill)` — clone a template once per item, return a single `DocumentFragment`

```html
<x-user-list>
  <ul data-ref="list"></ul>
  <template name="row">
    <li><span class="name"></span></li>
  </template>
</x-user-list>
```

```typescript
const UserList = define("x-user-list")
  .withRefs((r) => ({ list: r.one("ul") }))
  .setup((ctx) => {
    // $users is a nanostores store with an array of user objects. Whenever it updates, re-render the list:
    ctx.effect($users, (users) => {
      const fragment = ctx.renderList("row", users, (tpl, user) => {
        ctx.getElement(tpl, ".name").textContent = user.name;
      });
      ctx.refs.list.replaceChildren(fragment);
    });
  });
```

For cases where `replaceChildren` causes flickering, consider DOM-diffing libraries like [micromorph](https://github.com/natemoo-re/micromorph), [morphdom](https://github.com/patrick-steele-idem/morphdom), or [nanomorph](https://github.com/choojs/nanomorph).

### Misc

#### `consume(ComponentCtor)`

Find the nearest ancestor component of the given type — similar to React's `useContext`. Useful for cross-component communication when a component is composed of sub-components. Throws if no ancestor found.

```typescript
// x-tab consumes its parent x-tabs to register itself
const XTabs = define("x-tabs").setup((ctx) => {
  const tabs: HTMLElement[] = [];
  return {
    register(tab: HTMLElement) { tabs.push(tab); },
  };
});

define("x-tab").setup((ctx) => {
  const tabs = ctx.consume(XTabs); // fully typed, has .register()
  tabs.register(ctx.host);
});
```

#### `withCache(key, compute)`

Memoize a value for the component's connected lifecycle. Cache clears on disconnect.

```typescript
const parsed = ctx.withCache("config", () => JSON.parse(heavy));
```

#### `onCleanup(callback)`

Register arbitrary teardown logic to run on disconnect.

```typescript
const raf = requestAnimationFrame(tick);
ctx.onCleanup(() => cancelAnimationFrame(raf));
```

## Setup Return Value (Mixin)

Returning an object from `setup` assigns its members to the element instance, fully typed on the constructor:

```typescript
const Timer = define("x-timer").setup((ctx) => {
  let id: number;
  return {
    start() { id = setInterval(() => ctx.emit("tick"), 1000); },
    stop()  { clearInterval(id); },
  };
});

const el = new Timer();
el.start(); // typed
```

## TypeScript

### Typed events

`TypedEvent<Target, Detail>` is a helper type for `CustomEvent` with typed `target` and `detail`. Combine it with `HTMLElementEventMap` augmentation to make custom events type-safe across the whole app:

```typescript
import type { TypedEvent } from "nano-wc";

type TabsChangedEvent = TypedEvent<InstanceType<typeof XTabs>, { index: number }>;

declare global {
  interface HTMLElementEventMap {
    "tabs:changed": TabsChangedEvent;
  }
}

// emitting — inside x-tabs setup:
ctx.emit("tabs:changed", { index: 2 });

// listening — anywhere in the app:
ctx.on(tabsEl, "tabs:changed", (e) => {
  e.target;  // XTabs instance
  e.detail;  // { index: number }
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

1. **Constructor** — reactive prop stores created, getters/setters defined
2. **connectedCallback** — descendants upgraded (`customElements.upgrade`), `setup` runs, mixin applied
3. **attributeChangedCallback** — attribute change validated and pushed to prop store
4. **disconnectedCallback** — cache cleared, all cleanups run (listeners, effects, bindings)

Re-connecting a component runs `setup` again with a fresh cache and new cleanup scope.

## License

MIT
