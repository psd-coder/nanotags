# nanotags in Astro

nanotags is hydration-first: it upgrades statically rendered markup. There are **no `client:*` directives** involved. Hydration is the custom element upgrading, which happens as soon as its module runs.

## Registration module

Put `define()` calls in a module that exports nothing and is loaded only for its side effect. Never re-export it from a barrel file: the element is registered by loading the module, not by importing a symbol.

## Where the script goes

Inline `<script>` at the bottom of the `.astro` is fine for a single element owned by that one file. Move to a sibling registration module when any of these is true:

- the element family spans several `.astro` files
- the elements share module state (a `createContext` key, a module-level atom)
- the logic needs unit tests
- another component imports it for registration or typing

```astro
<x-tabs style="display: contents">
  <slot />
</x-tabs>

<script src="./tabs.ts"></script>
```

Keep the `<script src>` inside the component's own `.astro`. Components stay self-sufficient; a page never has to remember to register anything.

## Host element

**Give a wrapper host `display: contents`.** A custom element is `display: inline` by default and will otherwise break the layout of whatever it wraps. Omit it only when the custom element _is_ the visual or semantic box.

```astro
<!-- Tailwind -->
<x-tabs class="contents"><slot /></x-tabs>

<!-- Plain CSS: Astro scopes the style to this component's markup -->
<x-tabs><slot /></x-tabs>

<style>
  x-tabs {
    display: contents;
  }
</style>
```

If an ancestor component needs a ref to the wrapper, forward `data-ref` through props:

```astro
---
type Props = { "data-ref"?: string };
const { "data-ref": dataRef } = Astro.props;
---
<x-modal data-ref={dataRef} style="display: contents">...</x-modal>
```

## Two prop systems

Astro's `type Props` is the **authoring** API; `withProps` is the **runtime** element API. They are separate, and defaults are deliberately declared in both: the frontmatter default shapes the rendered attribute, the schema fallback covers a missing attribute at runtime.

Normalize in frontmatter so the attribute is always well-formed:

```astro
---
const { disabled, values } = Astro.props;
---
<x-toggle-group
  style="display: contents"
  disabled={disabled || undefined}
  values={values.join(",")}
>
```

Never use `define:vars` to hand data to a component. It inlines a non-module script and bypasses the prop system entirely.

## Seeding structured data

```typescript
// utils/toJsonSeed.ts: one shared helper in your project's utils, used by every JSON seed.
// `set:html` writes the string as is, so a "</script>" inside the data would end the tag early
// and inject markup. `\u003c` is still valid JSON and parses back to "<".
export function toJsonSeed(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
```

```astro
---
import { toJsonSeed } from "../../utils/toJsonSeed";

const { bars } = Astro.props;
---
<x-chart style="display: contents">
  <script
    is:inline
    type="application/json"
    data-prop="bars"
    set:html={toJsonSeed(bars)}
  />
  <div data-ref="list"></div>
</x-chart>
```

- **Never pass raw `JSON.stringify` to `set:html`.** Always go through the shared helper.
- `data-prop` is the **camelCase prop key verbatim**.
- `is:inline` keeps Astro from processing it as a module.
- Reduce CMS/API data to a plain serializable value in frontmatter before it becomes a prop.

After hydration, updates come from the property (`chartEl.bars = next`), never `setAttribute`. Pre-upgrade assignments are captured, so a parent can set `.bars` before the child's module has loaded. There is no registration-ordering dependency between them.

Reserve `is:inline` for exactly two things: JSON payloads, and a pre-hydration script that must run before paint (theme application). The latter is not processed by Astro, so write it in plain ES5-compatible syntax.

## Server-render the initial state

**No FOUC.** Whatever the component will show on its first effect must already be in the rendered HTML:

- the active tab already has `aria-selected` and its panel is visible
- a disabled control already has the `disabled` attribute
- a prop-driven CSS custom property has a CSS fallback so the correct value applies before hydration: `animation-duration: var(--ai-duration, 0.3s)`

A value that flashes then corrects itself means the server did not render the state.

## State belongs in attributes, styling in CSS

The contract between JS and CSS is a `data-*` or ARIA attribute the effect writes:

```typescript
ctx.effect($open, (open) => {
  panel.dataset.state = open ? "open" : "closed";
});
```

```css
[data-state="open"] { ... }
```

- Do not write a `<style>` block for anything the project's utility framework can express.
- If it can be CSS, it must not be JS. Delete `resize` listeners, viewport measurement, and class toggles that a media query or `100vw` already handles.
- Agnostic components must not bake in colors. Expose CSS custom-property seams (`var(--bar-fill, currentColor)`) and let the consumer map theme tokens onto the element.
- **`<template>`-cloned nodes do not reliably carry Astro's per-file scope attribute.** Style them with `<style is:global>` keyed off the custom-element tag: `x-chart .barFill { ... }`.

## Registering a peer element

```typescript
// Side-effect import registers x-modal and augments HTMLElementTagNameMap for the ref below.
import "../modal/modal";
```

Needed both to register the element and to pull in its `HTMLElementTagNameMap` augmentation so `r.one("x-modal")` types correctly.

## View transitions

Custom elements reconnect across a `ClientRouter` swap; plain module scripts do not re-run. Anything that must survive navigation belongs in a nanotags element rather than a top-level script.

Setup re-runs on every reconnect (see `SKILL.md`). An element with `transition:persist` is carried over with its old attributes, so avoid it on an element whose state comes from the current page: it keeps the previous page's value.
