# API reference and exact semantics

The gotchas are the parts that bite in review.

## Entry points

| Import | Exports | Budget |
|---|---|---|
| `nanotags` | `define`, `__ctx`, all types | ~2.4 KB |
| `nanotags/render` | `render`, `renderList` | ~0.4 KB |
| `nanotags/context` | `createContext`, type `ContextKey` | ~0.4 KB |
| `nanotags/testing` | `h`, `mount`, `create`, `connect`, `disconnect`, `cleanup`, `ref`, `refs`, `provideContext`, `stubElement`, `uniqueTag` | none (dev-only, never bundled) |

ESM only. Peer dependency `nanostores ^1.1.1`.

## Builder

```typescript
define(name)                     // -> ComponentBuilder
define(name, setupFn)            // short form, registers immediately, no props/refs

builder.withProps((p) => ({ ... }))       // p = prop builders
builder.withRefs((r) => ({ ... }))        // r = { one, many }
builder.withContexts({ key: ctxKey })     // plain object, not a factory
builder.setup((ctx) => mixin | void)      // calls customElements.define, returns the ctor
```

- Every `with*` returns a **new** builder; order is free; repeated `withProps`/`withRefs` calls merge.
- `withContexts` takes an object literal, not a factory function.
- Unknown keys on a `PropDef` literal are a compile error.

## Prop builders

```typescript
p.string(fallback?)                 // null fallback -> string | null
p.number(fallback?)                 // throws "Invalid number" on NaN
p.boolean(fallback?)                // "false" -> false; "" or truthy -> true
p.oneOf(options, fallback?)         // throws on a value not in options
p.json(schema, fallback?)           // attribute: false, read on connect; no fallback -> null
```

Coercion when the attribute is absent and no fallback is given:

| Builder | Result |
|---|---|
| `p.string()` | `""` |
| `p.number()` | `0` |
| `p.boolean()` | `false` |
| `p.oneOf(opts)` | **throws** |

**Fallback rule**: applied only when the incoming value is `null` (attribute absent or removed). `<el label="">` yields `""`, never the fallback. Passing `null` as the fallback makes the prop nullable.

### Wiring

- Store is created in the **constructor** from the attribute, parsed through the schema.
- The instance accessor is `enumerable` and `configurable`, so a test can stub it. A mixin key that reuses a prop name throws `reserved mixin: <key>` at connect.
- **Two write channels, and only one of them reflects to the DOM.** For an attribute-backed prop the property setter writes the *attribute* (`setAttribute`, or `removeAttribute` on `null`); `attributeChangedCallback` then parses it into the store. `$prop.set(v)` writes the store directly and touches nothing else, so the attribute goes stale.

  ```typescript
  el.getAttribute("size");     // "sm"
  ctx.props.$size.set("lg");
  el.size;                     // "lg"  (store)
  el.getAttribute("size");     // "sm"  (unchanged)
  ```

  `attributeChangedCallback` early-returns when `oldValue === newValue`, which turns the desync permanent: once the store is ahead, assigning the property back to the attribute's current value is a no-op and the store never catches up.

  ```typescript
  ctx.props.$size.set("lg");
  el.size = "sm";              // attribute is already "sm" -> callback returns early
  ctx.props.$size.get();       // still "lg"
  ```

  This is by design: the attribute is the **input** channel (server markup, or a parent writing the property); `$prop.set` is the component's own write. So never drive one prop from both channels: once the component has called `.set()`, a parent assigning the attribute's current value is silently ignored, as shown above.

  `setAttribute` and the property setter are equivalent entry points into the attribute channel. For `p.json` and `attribute: false` props the setter writes the store directly and no attribute is involved.
- camelCase key -> kebab-case attribute for `observedAttributes`, the initial read, the setter, and the JSON attribute fallback.
- Pre-upgrade plain property assignments are captured and seeded into the store.
- Reserved prop names: any name whose prototype-chain descriptor is a function or non-configurable (`getAttribute`, `click`, ...) throws `Error: reserved prop`. Configurable accessors like `title` or `lang` are allowed.

### `p.json` specifics

Read order: inline `<script type="application/json" data-prop="KEY">`, then the kebab-case attribute, then the fallback.

- `data-prop` uses the prop key **verbatim** (camelCase); the attribute fallback is kebab-case. `myData` -> `data-prop="myData"` or `my-data="..."`.
- Not an observed attribute: after connect, `setAttribute` is ignored. Push updates via the property setter.
- Read on every connect, so a move re-reads the seed and undoes a `$prop.set()`. A value written through the property setter is kept and the seed is not read again.
- With no seed, no attribute and no fallback the value is `null`, and `null` goes through the schema: a non-nullable schema throws at connect. Give a fallback or a schema that accepts `null`.
- The `<script>` tag is not removed after hydration.
- Invalid JSON or a schema failure throws during `connectedCallback`.

### Property-only props (`{ schema, attribute: false }`)

- The accessor exists from construction; the **value is `undefined` until connect**, unless the property was assigned before the element upgraded (that value is captured and kept).
- With the default `get`, the kebab-case attribute is still read on connect, and an absent attribute passes `null` through the schema. `p.string()`, `p.number()` and `p.boolean()` coerce it (`""`, `0`, `false`); `p.oneOf` without a fallback and custom schemas that reject `null` throw. `attribute: false` means "not observed, setter does not reflect", not "attribute ignored".
- Use for large values, imperative resources, and any property a parent will `ctx.bind` to.

## Ref builders

```typescript
r.one()                      // Element
r.one("button")              // tag: type inference + runtime tagName check
r.one<HTMLElement>()         // element generic, type-only
r.one(".selector")           // real selector, no tag validation
r.many(...)                  // same six overloads, array result
```

There are exactly two kinds: `one` and `many`. No optional/nullable ref API.

- A string matching `/^[a-z][a-zA-Z0-9-]*$/` is a **tag**. The lookup selector stays `[data-ref="key"]`; the tag is only inference plus a runtime check.
- Any other string is a **selector** and becomes the query: `.`, `#`, `[`, `:`, `>`, a space, `*` or an uppercase first letter all make it one.
- Custom-element tags match the tag pattern, so `r.many("x-toggle")` works and, with `HTMLElementTagNameMap` augmented, types to the component instance.
- For tags in both HTML and SVG maps (`a`, `script`, `title`, `style`) the HTML type wins; use `r.one<SVGAElement>("a")` for the SVG one.
- Results are in DOM order.

### Resolution and scoping

```
selector      = __selector ?? `[data-ref="${key}"]`
ownedSelector = `[data-ref="${hostTag}:${key}"]`
```

- A candidate is kept if it matches the owned selector, or if no intermediate tag between it and the host contains a hyphen. **Refs never cross a nested custom-element boundary**, upgraded or not.
- The owned form (`data-ref="x-owner:key"`) bypasses scoping at any depth. The JS declaration is unchanged; both selectors are always tried.
- Refs resolve fresh on every connect, and **before** contexts resolve, so a missing ref throws even when setup is going to be deferred.

### Failure messages

| Case | Error |
|---|---|
| missing `r.one`s | `<TAG> component. Missing elements for refs "a, b"` (all collected, thrown together) |
| empty `r.many` | `<TAG> component. Missing elements for list ref "key"` |
| tag mismatch | `TypeError: <TAG> component. Ref "key": invalid value ...: Expected <button>` |

## `ctx` surface

Complete. There is nothing else on it, and it has no `HTMLElement` members.

| Member | Notes |
|---|---|
| `ctx.host` | the element |
| `ctx.props` | `$`-prefixed `WritableAtom`s |
| `ctx.refs` | resolved elements / arrays |
| `ctx.contexts` | resolved context values |
| `ctx.onCleanup(cb)` | teardown registration |
| `ctx.on(target, type, listener, options?)` | element, array of elements, `Document`, or `Window` |
| `ctx.emit(event)` / `ctx.emit(name, detail?, options?)` | dispatched on `ctx.host` |
| `ctx.getElement(sel)` / `(root, sel)` | throws when nothing matches |
| `ctx.getElements(sel)` / `(root, sel)` | real `Array`, throws when empty |
| `ctx.effect(store \| stores[], cb)` | immediate call, then on change |
| `ctx.bind(store, control, options?)` | store first |

- `ctx.on` narrows `currentTarget` to the exact target type. Arrays register one cleanup per element; `ctx.refs.items` needs no spread. A custom event name compiles via the string overload, but `e` is a bare `Event` without `HTMLElementEventMap` augmentation.
- `ctx.emit(name, detail)` defaults to `{ bubbles: true, composed: true }`; `options` can override `bubbles` but `detail` in `options` never overrides the argument.
- `ctx.getElement(s)` default root is `ctx.host` and applies **no ref scoping**: plain `querySelectorAll`, so nested custom elements are included. This differs from `withRefs`.
- `ctx.effect` returns `void`. The callback may return a cleanup function, which runs before the next call and on disconnect (nanostores `effect` semantics).

### `ctx.bind` auto-detection

| Control | prop | event |
|---|---|---|
| `input[type=checkbox]` | `checked` | `change` |
| `input[type=number\|range]` | `valueAsNumber` | `input` |
| other `input`, `textarea` | `value` | `input` |
| everything else (`select`, custom elements) | `value` | `change` |

**Passing any options object drops the auto-detected event.** `{ prop: "disabled" }` alone is one-way; add `event` to keep it two-way.

Direction: store -> element runs through `effect`, so the **store wins** over the HTML `value` attribute on bind. The target property on a custom element must come from `withProps`.

## Lifecycle

1. **constructor**: reserved-name guard, pre-upgrade capture, store creation, accessors. Attribute props already hold parsed values; JSON and property-only stores are `undefined`. `setup` has not run.
2. **connectedCallback**: `hydrateProps`, then `collectRefs` (throws on missing), then `#runSetup` immediately, or deferred until every declared context resolves.
3. **#runSetup**: builds a fresh `Context`, calls `setupFn(ctx)`, and if it returned an object, checks each key against the prototype chain (`Error: reserved mixin: <key>`) and defines them on the instance, preserving getters/setters.
4. **disconnectedCallback**: runs every cleanup even if one throws, then rethrows the first error.

**No idempotence guard on connect.** Moving an element re-runs everything: props re-hydrate, refs re-resolve, setup runs again, effects and listeners re-register, mixin members are reassigned, contexts are re-consumed. Re-hydration re-reads each attribute or seed, which undoes a `$prop.set()`; only a value written through the property setter survives.

Two ways to get a silently inert component:

- `withContexts` with no provider anywhere: setup never runs, `this[__ctx]` stays `undefined`, mixin members never appear. `__ctx` is the registered `Symbol.for("nanotags:ctx")`. In a test, `ref`/`refs` from `nanotags/testing` throw on such a host.
- A duplicate `define()` of the same tag: warns and reuses the old class.

## Context

```typescript
const key = createContext<T>(name?);
key.provide(ctx, value);
key.consume(ctx, (value) => { ... });
```

- `name` is only the symbol description. Identity is the symbol, so two `createContext("tabs")` calls are **different** contexts.
- Resolution is synchronous when the provider is already connected; a late provider still resolves.
- **Nearest provider wins** (the handler calls `stopPropagation`).
- The consume callback is **one-shot**: a closer provider appearing later will not re-notify. Pass a store through context for ongoing updates.
- `provide` only needs `{ host, onCleanup }`, so it works on non-nanotags hosts.
- `withContexts({})` runs setup immediately.

## Render

```typescript
render(container, template, { data?, update? });
renderList(container, template, { data, key, update });
```

- Both return `void`. The template must be an `HTMLTemplateElement` with **exactly one root element**.
- **Both own the whole container**: any element child without a tracked key is removed (text and comment nodes are left alone), including a `<template>` that lives inside it.
- `update` runs on create and whenever the item **reference** changes. Mutating an item in place will not re-render.
- Reordering skips elements already in place and moves the rest one by one, so it is not minimal: rotating `[A,B,C,D,E]` to `[B,C,D,E,A]` does four moves where one would do.
- `render` without `data` re-runs `update` every call; with `data`, an unchanged reference skips it. A fully static `render(container, tpl)` is idempotent.
- Nesting works: run the inner `renderList` inside the outer `update`, targeting a sub-container owned solely by the inner list.

## TypeScript

```typescript
import type { TypedEvent } from "nanotags";

type TabChangeEvent = TypedEvent<InstanceType<typeof XTabs>, { index: number }>;

declare global {
  interface HTMLElementTagNameMap {
    "x-tabs": InstanceType<typeof XTabs>;
  }
  interface HTMLElementEventMap {
    tabchange: TabChangeEvent;
  }
}
```

- `SetupContext` has **no defaults for `Props`/`Refs`**. Write `SetupContext<{}, {}>`; bare `SetupContext` does not compile.
- `ComponentBuilder`, the `Context` class, and `ComponentBrand` are not exported.
- Ref markers store the tag literal rather than the element type to avoid a circular reference once the component registers itself in the map.
- `interface` inside `declare global` and unassigned side-effect imports are expected in component modules and their tests.
