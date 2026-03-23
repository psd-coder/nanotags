---
title: API
description: Complete API reference for nano-wc
order: 3
---

## Builder API

`define(name)` returns a `ComponentBuilder` with a fluent, immutable chain. Each step returns a new builder instance, accumulating type information along the way:

```typescript
define("x-my-comp") // ComponentBuilder (entry point)
  .withProps((p) => ({ ... })) // + prop types
  .withRefs((r) => ({ ... })) // + ref types
  .setup((ctx) => { ... }); // terminates chain, registers element
```

`withProps()`, `withRefs()`, and `withContexts()` are optional and can appear in any order. `setup()` ends the chain — it calls `customElements.define` under the hood and returns a typed constructor.

For simple components, pass setup directly as the second argument:

```typescript
const Logger = define("x-logger", (ctx) => {
  console.log("connected:", ctx.host.tagName);
});
```

### withProps

Declare validated, reactive attributes via `withProps()`. Each prop becomes:

- An observed HTML attribute (auto-synced via `attributeChangedCallback`)
- A [Nano Stores](https://github.com/nanostores/nanostores) `WritableAtom` at `ctx.props.$propName`
- A typed getter/setter on the element instance

Prop names are camelCase in JS and automatically mapped to kebab-case HTML attributes: `tabIndex` &rarr; `tab-index`, `isOpen` &rarr; `is-open`. The property setter reflects back to the attribute.

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

Each validator accepts an optional fallback. Pass `null` to make the prop nullable (inferred type becomes `T | null`):

```typescript
.withProps((p) => ({
  label: p.string(null), // string | null
  size:  p.oneOf(["s", "m", "l"], null), // "s" | "m" | "l" | null
}))
```

Props use [Standard Schema](https://github.com/standard-schema/standard-schema) internally, so any compatible validator (Valibot, Zod, ArkType) works as a custom prop schema.

#### JSON props

For complex data that doesn't fit into a string attribute, use `p.json()` with a Standard Schema validator:

```typescript
import * as v from "valibot";

.withProps((p) => ({
  items: p.json(v.array(v.object({ id: v.number(), name: v.string() })), []),
  config: p.json(v.object({ theme: v.string() })), // defaults to null
}))
```

JSON props differ from attribute-backed props:

- **Not observed** — not in `observedAttributes`, no `attributeChangedCallback`
- **Setter writes to atom directly** — no attribute created in the DOM
- **Hydrated once on connect** — reads from a `<script type="application/json">` tag, falls back to a kebab-case attribute

```html
<!-- preferred: script tag (no escaping needed) -->
<x-list>
  <script type="application/json" data-prop="items">
    [{ "id": 1, "name": "Alice" }, { "id": 2, "name": "Bob" }]
  </script>
</x-list>

<!-- also works: inline attribute -->
<x-list items='[{"id":1,"name":"Alice"}]'></x-list>
```

After hydration, set programmatically:

```typescript
el.items = [{ id: 3, name: "Charlie" }]; // updates atom, no DOM attribute
```

#### Property-only props

Set `attribute: false` to create a prop that exists only as a JS property and a Nano Stores atom — no HTML attribute. Defined in the **constructor**, available immediately after `document.createElement()`:

```typescript
.withProps((p) => ({
  label: p.string(), // attribute-backed
  value: { schema: p.string(""), attribute: false }, // property-only
}))
```

This is useful when:

- The value is large or complex (editor content, serialized state) — writing kilobytes to a DOM attribute is wasteful
- A component wraps an imperative resource (CodeMirror, canvas) and exposes its state as `.value`
- A parent uses `ctx.bind()` on a child — `bind()` needs the `.value` property to exist from construction time, before setup runs

The full `PropDef` shape:

```typescript
type PropDef<T> = {
  schema: StandardSchemaV1<unknown, T>;
  attribute?: boolean; // default: true
  get?: (host: HTMLElement, key: string) => unknown; // custom hydration reader
};
```

### withRefs

Declare typed element references. Refs query the component's own DOM, skipping elements inside nested custom elements by default.

`r.one()` returns a single element (throws if missing), `r.many()` returns an array (throws if empty). When you pass a tag name, it's used for both **type inference** and **runtime validation**:

```typescript
.withRefs((r) => ({
  trigger: r.one("button"), // HTMLButtonElement — validated
  items:   r.many("li"), // HTMLLIElement[] — validated
}))
```

By default, refs match `[data-ref="name"]`. Non-tag strings (containing `.`, `#`, `[`, etc.) are treated as CSS selectors:

```typescript
.withRefs((r) => ({
  custom: r.one(".my-trigger"), // Element
  typed:  r.one<HTMLButtonElement>(".my-trigger"), // HTMLButtonElement (type-only)
  any:    r.many<HTMLElement>(), // HTMLElement[] (no tag validation)
}))
```

#### Ref ownership

By default, a component **owns** only its direct refs — elements inside nested custom elements are skipped for proper encapsulation:

```html
<x-parent>
  <span data-ref="title">owned by x-parent</span>
  <x-child>
    <span data-ref="subtitle">owned by x-child, skipped by x-parent</span>
  </x-child>
</x-parent>
```

With **slot-based composition** (e.g. Astro components passed into structural wrappers), refs may end up inside other custom elements even though they conceptually belong to the outer component. To claim ownership, prefix the ref with the component's tag name — `<custom-element>:<ref-name>`:

```html
<x-code-example>
  <x-resizable-panes>
    <button data-ref="x-code-example:tabs">owned by x-code-example</button>
  </x-resizable-panes>
</x-code-example>
```

The JS definition stays the same — each ref automatically checks both `[data-ref="name"]` (direct ownership) and `[data-ref="x-component:name"]` (explicit ownership). You can mix both in the same component.

### withContexts

Declares required contexts on the builder. Setup is deferred until all contexts resolve:

```typescript
import { createContext } from "nano-wc/context";

const tabsCtx = createContext<TabsAPI>("tabs");

define("x-tab")
  .withContexts({ tabs: tabsCtx })
  .setup((ctx) => {
    ctx.contexts.tabs.register(ctx.host);
  });
```

If a context never resolves (no provider ancestor), setup never runs. For dynamic or conditional access, use `consume()` directly — see the [Context API guide](guides#context-api).


### setup

The `setup()` function receives a [SetupContext](api#setup-context) object and runs when the component connects. It wires up behavior: event listeners, reactive effects, bindings, and cleanup.

#### Mixin (return value)

Returning an object from `setup()` assigns its members to the element instance, fully typed on the constructor:

```typescript
const Timer = define("x-timer").setup((ctx) => {
  let id: number;
  return {
    start() { id = setInterval(() => ctx.emit("tick"), 1000); },
    stop()  { clearInterval(id); },
  };
});

document.body.appendChild(new Timer());
document.querySelector("x-timer")!.start();
```

Mixin members are available only after the element is connected (i.e. after `setup()` runs).

## Setup Context

The `setup()` function receives a context object (`ctx`) with properties and methods for building reactive components.

### host

The component's `HTMLElement` itself. Useful for reading layout, appending content, or passing to external APIs.

```typescript
ctx.host.classList.add("active");
```

### props

Reactive prop stores, each prefixed with `$`. Every prop declared via `withProps()` becomes a Nano Stores `WritableAtom`:

```typescript
ctx.props.$count.get(); // read current value
ctx.props.$count.set(42); // update value
ctx.effect(ctx.props.$count, (val) => { /* react */ });
```

### refs

Resolved element references declared via `withRefs()`:

```typescript
ctx.refs.trigger // HTMLButtonElement
ctx.refs.items // HTMLLIElement[]
```

### contexts

Resolved context values when `withContexts()` is used:

```typescript
ctx.contexts.tabs.register(ctx.host);
ctx.effect(ctx.contexts.tabs.$active, (active) => { /* ... */ });
```

### effect

`effect(store, callback)` / `effect([storeA, storeB], callback)`

Subscribe to one or more Nano Stores atoms. Callback fires immediately with current value(s). Unsubscribes on disconnect.

```typescript
ctx.effect(ctx.props.$count, (count) => {
  ctx.refs.display.textContent = String(count);
});

ctx.effect([storeA, storeB], (a, b) => {
  /* ... */
});
```

### bind

`bind(store, element, options?)`

Two-way binds a DOM control to a Nano Stores atom. The store is the source of truth — the control is set from the store on bind.

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
ctx.bind($theme, el, { prop: "theme" }); // one-way
ctx.bind($val, el, { prop: "value", event: "change" }); // two-way
```

When binding to a custom element, `.value` (or the target property) must be defined via `withProps()`, not as a mixin return value. Props are available from the constructor, while mixin members only exist after `connectedCallback`.

### on

`on(target, type, listener, options?)`

Attach event listeners with automatic cleanup. Accepts a single element, an array, `document`, or `window`. Event types are fully inferred for each target:

```typescript
ctx.on(ctx.refs.trigger, "click", (e) => { /* ... */ });
ctx.on([...ctx.refs.items], "mouseenter", (e) => { /* ... */ });
ctx.on(document, "keydown", (e) => { /* ... */ });
```

### emit

`emit(event)` / `emit(name, detail?, options?)`

Dispatch an existing `Event` or construct and dispatch a bubbling `CustomEvent`

```typescript
ctx.emit(new CustomEvent("reset"));
ctx.emit("change", { value: 42 });
```

### getElement

`getElement(selector)` / `getElement(root, selector)`

Asserts that the element exists and returns it with the correct type — no null checks, no casting. Tag-name selectors narrow the return type automatically. Throws if nothing matches.

```typescript
ctx.getElement("input"); // HTMLInputElement (throws if missing)
ctx.getElement(customParent, ".item"); // Element
// type-only, no runtime tag check
ctx.getElement<"input">(customRoot, ".my-input"); // HTMLInputElement
```

### getElements

`getElements(selector)` / `getElements(root, selector)`

Works the same as [`getElement()`](api#getelement) but returns **all** matching elements as a typed `Array` (not a `NodeList`). Throws if none found.

```typescript
ctx.getElements("button"); // HTMLButtonElement[]
// type-only, no runtime tag check
ctx.getElements<"input">(customRoot, ".field"); // HTMLInputElement[]
```

Both methods are primarily useful for dynamic queries inside [`renderList()`](api#renderlist) update callbacks or other imperative code. For static element references, prefer [refs](api#withrefs).

For nullable results, use `ctx.host.querySelector()/querySelectorAll()` directly.

### onCleanup

`onCleanup(callback)`

Register arbitrary teardown logic to run on disconnect:

```typescript
const raf = requestAnimationFrame(tick);
ctx.onCleanup(() => cancelAnimationFrame(raf));
```

## Context API

Cross-component communication for parent-child relationships. Import from the separate `nano-wc/context` entry point (~0.4 KB).

```typescript
import { createContext } from "nano-wc/context";
```

For a conceptual overview, see the [Context API guide](guides#context-api).

### createContext

`createContext<T>(name?)`

Creates a typed context key with `provide()` and `consume()` methods. The optional `name` is used as the `Symbol` description for debugging.

```typescript
type TabsAPI = {
  register: (el: Element) => void;
  $active: WritableAtom<string>;
};

const tabsContext = createContext<TabsAPI>("tabs");
```

### context.provide

`contextKey.provide(ctx, value)`

Registers the component as a context provider. Any descendant that consumes this context key will receive `value`.

The `ctx` parameter requires `host` (HTMLElement) and `onCleanup` — the setup context satisfies this. The provider's event listener is auto-cleaned on disconnect.

```typescript
define("x-tabs").setup((ctx) => {
  const $active = atom("");
  tabsContext.provide(ctx, {
    register: (el) => { /* ... */ },
    $active,
  });
});
```

On connect, `provide()` also dispatches a `context-provider` event to resolve any pending consumers that connected before the provider.

### context.consume

`contextKey.consume(ctx, callback)`

Requests the context value from the nearest ancestor provider. The callback receives the provided value.

```typescript
define("x-tab").setup((ctx) => {
  tabsContext.consume(ctx, (tabs) => {
    tabs.register(ctx.host);
    ctx.effect(tabs.$active, (active) => { /* ... */ });
  });
});
```

If a provider is already connected, the callback fires synchronously. If not, the request is queued and resolved when the provider calls `provide()`. Pending requests are cleaned up on disconnect.

## Rendering

Keyed reconciliation utilities for dynamic content. Import from the separate `nano-wc/render` entry point (~0.4 KB).

```typescript
import { render, renderList } from "nano-wc/render";
```

Both `render()` and `renderList()` **own the entire container** — any child not part of the current render cycle is removed. Containers must be dedicated to rendered content.

### render

`render(container, template, options?)`

Single-item rendering. Options are optional — omit for static templates (loading spinners, error states, empty placeholders):

```typescript
render(container, loadingTpl); // static
render(container, profileTpl, { // data-driven
  data: user,
  update: (el, u) => { el.setAttribute("name", u.name); },
});
```

Switching templates replaces the previous element.
Internally delegates to `renderList()` with a single-element array.

### renderList

`renderList(container, template, options)`

Reconcile a data array against DOM by key. Creates, updates, removes, and reorders elements — without recreating the whole list. Skips `update` when the item reference hasn't changed (`===`).

```html
<ul data-ref="list">
  <template data-ref="rowTpl">
    <li><span class="name"></span></li>
  </template>
</ul>
```

```typescript
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

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `data` | `readonly T[]` | Array of items to render |
| `key` | `(item: T, index: number) => string \| number` | Unique key per item |
| `update` | `(el: Element, item: T) => void` | Called on create and when the item reference changes |

## TypeScript

### TypedEvent

`TypedEvent<Target, Detail>`

A type-only helper that narrows `CustomEvent` to a specific `target` and `detail`. Useful for defining type-safe custom events:

```typescript
import type { TypedEvent } from "nano-wc";

type TabsChangedEvent = TypedEvent<
  InstanceType<typeof XTabs>,
  { index: number }
>;
```

Combine with `HTMLElementEventMap` augmentation for app-wide type safety — see [Typed custom events](recipes#typed-custom-events) and [Augmenting HTMLElementTagNameMap](recipes#augmenting-htmlelementtagnamemap) recipes.
