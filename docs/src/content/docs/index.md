---
title: Getting Started
description: Introduction, installation and first component
order: 1
---

## Why nano-wc?

Thin Web Components wrapper with [nanostores](https://github.com/nanostores/nanostores) reactivity. No Shadow DOM — your markup stays in the regular DOM, styled with normal CSS. Typesafe fluent builder, props/refs, automatic cleanup, store sync, and DOM binding — all in 3.5 KB.

Shines with statically rendered markup — pair it with [Astro](https://astro.build/), server-rendered HTML, or any static-first setup to hydrate lightweight interactive islands.

### Core principles

- **No Shadow DOM** — elements live in the regular DOM, styled with normal CSS
- **Reactive props** — each prop is a nanostores atom, auto-synced with attributes
- **Typed refs** — query scoped DOM elements with runtime validation
- **Automatic cleanup** — listeners, effects, syncs, bindings — all disposed on disconnect
- **Fluent builder** — immutable chain accumulates type information step by step
- **Tiny** — core in 3.5 KB, rendering utilities in a separate entry

## Installation

```bash
npm install nano-wc nanostores
```

## First Component

Start with markup — nano-wc hydrates existing DOM rather than rendering from scratch:

```html
<x-counter count="0">
  <span data-ref="display">0</span>
  <button data-ref="increment">+1</button>
</x-counter>
```

Then define the component:

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

What's happening here:

1. **`define("x-counter")`** — starts the builder chain, names the custom element
2. **`.withProps`** — declares a `count` attribute, parsed as number, exposed as `ctx.props.$count` atom
3. **`.withRefs`** — declares typed refs resolved via `[data-ref="name"]` selectors
4. **`.setup`** — wires event listeners and reactive effects; everything is auto-cleaned on disconnect

For simple components without props or refs, pass setup directly:

```typescript
const Logger = define("x-logger", (ctx) => {
  console.log("connected:", ctx.host.tagName);
});
```

## FAQ

### Why no Shadow DOM?

Shadow DOM brings encapsulation at the cost of complexity: styling piercing, slotting quirks, form participation hacks. nano-wc targets server-rendered or static markup where global CSS is already the norm. Keeping elements in the light DOM means your existing styles, CSS frameworks, and dev tools work as expected.

### How does it compare to Lit / Stencil / vanilla CE?

nano-wc is intentionally minimal. It doesn't ship a template engine, virtual DOM, or lifecycle beyond connect/disconnect. If you need those, use Lit. If you want a thin reactivity layer over standard custom elements with TypeScript-first DX, nano-wc is a good fit.

### Can I use it without nanostores?

The reactivity methods (`effect`, `sync`, `bind`) use structural store types — any object with `get()`, `set()`, and `subscribe()` works. You're not locked into nanostores, but it's the recommended companion.

### Does it work with SSR frameworks?

Yes. nano-wc is designed for hydration — render markup on the server (Astro, PHP, Rails, static HTML), then hydrate on the client. Props are read from attributes, refs are resolved from existing DOM.
