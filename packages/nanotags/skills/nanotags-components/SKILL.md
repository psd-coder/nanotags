---
name: nanotags-components
description: Rules for writing idiomatic nanotags components (Custom Elements + nanostores). Use when creating, reviewing, or refactoring anything that calls define(), withProps, withRefs, withContexts, setup(ctx), ctx.effect, ctx.bind, ctx.emit, renderList, or createContext. Also use when porting hand-written DOM code to nanotags, or when component code reaches for manual querySelector, addEventListener, dispatchEvent, store.subscribe/listen, classList toggling, element maps, or setTimeout reconciliation.
---

# Writing nanotags components

## The one rule

**State lives in atoms. Effects write the DOM. Handlers only change state.**

Component logic is a nanotags component plus nanostores atoms plus `ctx.effect`, never a hand-rolled DOM controller. No element `Map`s, no manual `classList` reconciliation, no `setTimeout` sync passes, no hand-written subscribe/unsubscribe. Prefer a built-in `ctx` method over logic you write yourself.

```typescript
// Wrong: handler mutates the DOM, state is a local `let`
let open = false;
ctx.on(trigger, "click", () => {
  open = !open;
  panel.classList.toggle("isOpen", open);
  trigger.setAttribute("aria-expanded", String(open));
});

// Right: handler flips state, one effect projects it
const $open = atom(false);
ctx.on(trigger, "click", () => $open.set(!$open.get()));
ctx.effect($open, (open) => {
  panel.dataset.state = open ? "open" : "closed";
  trigger.setAttribute("aria-expanded", String(open));
});
```

The DOM is written in exactly one place per concern. That is what makes the component readable, testable, and correct after a reconnect.

## Anatomy

Order inside `setup`: atoms, then named functions, then `ctx.on` handlers, then `ctx.effect`, then the returned mixin.

```typescript
import { define } from "nanotags";
import { atom, computed } from "nanostores";

declare global {
  interface HTMLElementTagNameMap {
    "x-disclosure": InstanceType<typeof XDisclosure>;
  }
}

const XDisclosure = define("x-disclosure")
  .withProps((p) => ({
    open: p.boolean(false),
    label: p.string(""),
  }))
  .withRefs((r) => ({
    trigger: r.one("button"),
    panel: r.one("div"),
  }))
  .setup((ctx) => {
    const { trigger, panel } = ctx.refs;

    function toggle() {
      ctx.props.$open.set(!ctx.props.$open.get());
    }

    ctx.on(trigger, "click", toggle);

    ctx.effect(ctx.props.$open, (open) => {
      panel.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
    });

    return {
      get isOpen() {
        return ctx.props.$open.get();
      },
      toggle,
    };
  });
```

- `const XDisclosure = ...` exists so `InstanceType<typeof XDisclosure>` can be named.
- The `declare global` block sits in the same module as `define()`, above it.
- Destructure `ctx.refs` on the first line of `setup`.

## Props

**Everything configurable is a prop.** Not a module constant, not an inline `style=`, not a hardcoded value read out of `dataset`.

**`ctx.props.$x` is already a `WritableAtom`. Never mirror it into a local atom.**

```typescript
// Wrong
const $count = atom(ctx.props.$initial.get());

// Right
ctx.props.$value.set(ctx.props.$value.get() + 1);
```

A prop named `initial`, `default`, or `initialX` is a smell for exactly this mistake. Rename it to what it is (`value`) and use the prop atom as the state.

Other rules:

- Use the built-in builders (`p.string`, `p.number`, `p.boolean`, `p.oneOf`, `p.json`). Do not import valibot/zod for scalars: nanotags dropped valibot as a runtime dependency in 0.14, and passing a schema for a plain string drags it back in. Reserve Standard Schema for genuinely structural JSON payloads.
- **Always give `p.oneOf` a fallback.** Without one it throws when the attribute is absent.
- A fallback applies **only when the value is `null`** (attribute absent). `label=""` yields `""`, not the fallback.
- Passing `null` as the fallback makes the prop nullable (`T | null`).
- Prop keys are camelCase; attributes are kebab-case (`defaultSize` -> `default-size`).
- **`$prop.set()` is how a component writes its own prop.** It updates the store and deliberately does not touch the attribute: the attribute is an _input_ channel (server markup, or a parent). The property setter is the parent's way in (`childEl.bars = next`), not yours, unless the value has to survive a move (see Cleanup).
- Because of that, **don't write CSS selectors against the attribute of a prop you `.set()`**: the attribute keeps its initial value while the store moves on, so the selector matches stale state. Mirror the state into an `aria-*` or `data-*` attribute from an effect and select on that. A prop attribute is a safe CSS hook only when the prop is set once by the server and never changes (`[direction="horizontal"]`).

  ```typescript
  ctx.on(header, "click", () => ctx.props.$expanded.set(!ctx.props.$expanded.get()));
  ctx.effect(ctx.props.$expanded, (expanded) => {
    header.setAttribute("aria-expanded", String(expanded));
  });
  ```

### JSON props

`p.json()` is not an observed attribute: it reads its seed on connect, and again on every reconnect unless the property has been written since.

```html
<x-chart>
  <script type="application/json" data-prop="bars">
    [{ "label": "a", "value": 1 }]
  </script>
</x-chart>
```

`data-prop` uses the **camelCase prop key verbatim**. After connect, push new data through the **property**, never `setAttribute`:

```typescript
chartEl.bars = nextBars; // right
chartEl.setAttribute("bars", JSON.stringify(nextBars)); // silently ignored
```

Pre-upgrade property assignments are captured, so the parent can set `.bars` before the child's module has even loaded. That is why parent -> child reactive data is a JSON prop plus a property assignment, and never a custom event.

## Refs

A ref is a **hard contract**: `r.one` and `r.many` throw at connect when nothing matches.

| Situation                                                             | Use                                                             |
| --------------------------------------------------------------------- | --------------------------------------------------------------- |
| Element is always present                                             | `withRefs` + `data-ref="name"`                                  |
| Element is conditional                                                | `ctx.host.querySelector(...)` + a null guard                    |
| Homogeneous repeated set, always non-empty                            | `r.many`                                                        |
| Dynamic set, always non-empty, or elements inside a rendered template | `ctx.getElements(root, selector)` (throws when nothing matches) |
| Set that can be empty                                                 | `ctx.host.querySelectorAll(...)`                                |

For a conditional element, do not even give it `data-ref`. Use a distinct hook like `data-prev` so it can never be mistaken for a ref.

```typescript
// Wrong: prev/next only exist when there is more than one slide
.withRefs((r) => ({ prev: r.one("button"), next: r.one("button") }))

// Right
const prev = ctx.host.querySelector<HTMLButtonElement>("[data-prev]");
if (prev) ctx.on(prev, "click", goPrev);
```

**The tag argument is type inference plus a runtime `tagName` check. The query is still `[data-ref="key"]`.** A string that is not a bare tag name (`/^[a-z][a-zA-Z0-9-]*$/`) is treated as a real selector instead and gets no tag validation: `.`, `#`, `[`, `:`, `>`, a space or `*` all make it one.

- You own the markup -> name the tag: `r.one("dialog")`, `r.one("button")`.
- You do not own the tag (slotted, third-party) -> `r.one<HTMLElement>()`.
- `r.many("[role=tab]")` infers `Element[]`; write `r.many<HTMLElement>("[role=tab]")` when you need the wider type.

**Refs never cross a nested custom-element boundary.** Resolution skips anything whose path to the host passes through a hyphenated tag, upgraded or not. To reach an element inside another custom element anyway, prefix its `data-ref` with the tag of the host that owns the ref (`<host-tag>:<key>`):

```html
<x-share-button>
  <x-tooltip>
    <button data-ref="x-share-button:button">Share</button>
  </x-tooltip>
</x-share-button>
```

Try restructuring first so the element sits directly under one host. The prefixed form is an escape hatch: it hardcodes the outer component's tag into markup that lives inside another component, so use it deliberately.

**`ctx.refs` is private to its component.** Never read `other.refs.x`. If a parent needs a child's element, the child publishes it from its mixin as a getter:

```typescript
// child
return {
  get trigger() {
    return ctx.refs.trigger;
  },
};

// parent
roving.focus(item.trigger);
```

## State

Escalate only as far as you need:

1. **Prop atom**: the value is part of the component's public API.
2. **Local `atom` / `computed` in setup**: internal state. `computed` for anything derived; never recompute derived values by hand inside an effect.
3. **Module-level store**: coordination between instances or unrelated islands.
4. **Context**: a descendant needs an ancestor's imperative handle or scoped store.

Any store factory wired to external state (URL, `window` events, timers) **must be lazy**: register nothing at creation, do all subscription work inside `onMount($store, () => { ...; return () => teardown })`. Inside `onMount` use `onNotify`/`onSet` for self-reactions, never `$store.listen`: a `.listen` bumps the listener count and the store can never unmount.

### Context

- `withContexts({ menu })` when the component **cannot function** without it. Setup is deferred until every declared context resolves; with no provider the element stays inert forever. That is the point.
- `key.consume(ctx, cb)` when the context is genuinely optional.
- Context resolution is **one-shot**. For ongoing updates, pass a store through the context, not a value.

## Effects and binding

`ctx.effect(store, cb)` subscribes, fires immediately with the current value, and unsubscribes on disconnect. It returns `void`. The callback may return a cleanup function: it runs before the next call and on disconnect, which is the place to release a resource the previous run acquired.

```typescript
ctx.effect($open, (open) => {
  if (!open) return;
  const timer = setInterval(poll, 1000);
  return () => clearInterval(timer);
});
```

`ctx.bind(store, control)`: **store is always the first argument.**

**Passing any options object drops the auto-detected event**, making the binding one-way:

```typescript
ctx.bind($value, input); // two-way
ctx.bind($disabled, toggle, { prop: "disabled" }); // one-way, by design
ctx.bind($value, slider, { prop: "value", event: "input" }); // two-way, explicit
```

When binding to a custom element, bind to a prop declared with `withProps`. Its accessor exists from the constructor, and a value written before the child upgrades is captured. A mixin member is only defined when the child's setup runs, so if the parent binds first (the child's `define()` runs later, or the child waits on a context the parent provides), the initial value is silently lost and the child shows its default until the store changes.

```typescript
// Wrong: `value` only exists once x-rating's setup has run
define("x-rating", () => {
  const $value = atom(0);
  return {
    get value() {
      return $value.get();
    },
    set value(next: number) {
      $value.set(next);
    },
  };
});

// Right: the accessor exists from the constructor
define("x-rating")
  .withProps((p) => ({ value: p.number(0) }))
  .setup((ctx) => {
    ctx.effect(ctx.props.$value, (value) => {
      ctx.host.style.setProperty("--rating", String(value));
    });
  });

// Parent
ctx.bind($score, ctx.refs.rating);
```

## Events and boundaries

- **Prefer native event names.** `change`, `close`, `toggle` over `toggle-group:change`. A namespaced event is a smell that the component is inventing a private protocol.
- **Do not emit speculatively.** No listener, no event.
- **A parent's setup must not call into a child's mixin.** The child's members exist only once it has set up, which depends on import order. Provide state through a context and let the child react; call child methods from later events, never from setup or a first effect run.
- **Do not annotate the event type at the call site**: `ctx.on` infers it, including `currentTarget`.
- Augment **`HTMLElementEventMap`**, not `ElementEventMap`.
- `ctx.on` accepts an array of targets directly; `ctx.refs.items` needs no spread.
- `ctx.emit` dispatches on `ctx.host` with `{ bubbles: true, composed: true }` by default.

**A component must not know about its container.** Depend on the platform primitive, not on your app's wrapper:

```typescript
// Wrong: the form now only works inside this app's modal
const modal = ctx.host.closest("x-modal");

// Right: works inside any dialog, and is testable in a bare <dialog>
const dialog = ctx.host.closest("dialog");
if (dialog) ctx.on(dialog, "close", reset);
```

**Data flows down as props, intent flows up as events.** A child never writes a parent's prop atom:

```typescript
// child
const handleChange = () => ctx.emit("change");

// parent
ctx.effect([ctx.props.$value, ctx.props.$disabled], (value, disabled) => {
  ctx.refs.items.forEach((item) => {
    item.disabled = disabled;
    item.active = item.value === value;
  });
});
ctx.on(ctx.refs.items, "change", (e) => ctx.props.$value.set(e.currentTarget.value));
```

Communication matrix:

| Direction                                          | Mechanism                                            |
| -------------------------------------------------- | ---------------------------------------------------- |
| Parent -> child                                    | attribute / property (JSON prop for structured data) |
| Child -> parent                                    | `ctx.emit` + parent's `ctx.on`                       |
| Descendant needs ancestor's handle or scoped store | context                                              |
| Siblings / unrelated islands                       | shared module-level atom                             |

## Cleanup

Auto-cleaned on disconnect: `ctx.on`, `ctx.effect`, `ctx.bind`, `ctx.onCleanup`, and context provide/consume.

**Not** auto-cleaned. Wrap every one in `ctx.onCleanup`:

- `setTimeout`, `setInterval`, `requestAnimationFrame`
- `MutationObserver`, `ResizeObserver`, `IntersectionObserver`
- `AbortController`, in-flight `fetch`
- raw `addEventListener` (do not use it; use `ctx.on`)
- manual `store.subscribe` / `store.listen` (do not use them; use `ctx.effect`)
- third-party instances (Chart.js, CodeMirror, floating-ui `autoUpdate`)

```typescript
const observer = new MutationObserver(() => { ... });
observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
ctx.onCleanup(() => observer.disconnect());
```

**Setup runs again on every reconnect.** Moving an element in the DOM disconnects and reconnects it. On each reconnect, props are re-read, refs are looked up again, and `setup` runs from scratch. Write setup so it is safe to run many times, and don't keep state in a `let` that has to survive a move.

A move also undoes `$prop.set()`, because the prop is re-read from its attribute or inline JSON. To keep a value across a move, write it where the component reads its input from. This is the one case where a component writes its own input instead of calling `$prop.set()`:

- Attribute prop: set the attribute (`ctx.host.setAttribute("size", "lg")`). The store follows.
- JSON or property-only prop: assign the host property. The value is then kept and not re-read on reconnect. `ctx.host` is typed `HTMLElement`, so cast it to the component's instance type first.

## Rendering lists

`render` and `renderList` **own their container** and delete any child they do not manage. Never render into a container that also holds static markup.

```typescript
import { renderList } from "nanotags/render";

ctx.effect($items, (items) => {
  renderList(ctx.refs.list, ctx.refs.itemTpl, {
    data: items,
    key: (item) => item.id,
    update: (el: HTMLLIElement, item) => {
      ctx.getElement(el, "[data-label]").textContent = item.label;
    },
  });
});
```

- The `<template>` must have exactly one root element.
- `key` is required for `renderList`.
- `update` re-runs on a **reference** change, so mutating an item in place will not re-render.
- Never build a `computed()` that returns DOM, and never hand the result to another component's ref. Render into an element you own.

## Reusable behavior: attachments

When behavior needs listeners or effects and is reused, extract an **attachment**—a function taking `ctx` first—not a plain helper. A plain helper that calls `addEventListener` leaks; an attachment using `ctx.on` never does. Interaction and accessibility patterns are the archetypal case: roving tabindex, focus return, overlay and dialog wiring, menu keyboard handling.

```typescript
import type { SetupContext } from "nanotags";

export function attachRovingFocus(
  ctx: SetupContext<{}, {}>,
  items: () => HTMLElement[],
  options?: RovingFocusOptions,
) {
  ctx.on(ctx.host, "keydown", (e) => { ... });
  return { setActive, getActive };
}
```

- First parameter is `ctx`. Type it as `SetupContext<{}, {}>` so it composes with any component. `SetupContext` with no type arguments does not compile. An attachment that reads `ctx.refs` needs a narrowed type that carries them instead: `AttachmentContext<Refs>` (see Accessibility).
- Pass collections as a **thunk** (`() => HTMLElement[]`), not a snapshot, so the attachment re-reads live DOM.
- Configure via an options object; return a handle only if callers need one.
- The attachment owns teardown of anything it creates: DOM it inserted, listeners it registered outside `ctx`.
- Pure logic with no lifecycle belongs in a sibling module, not an attachment.

## Anti-pattern reference

| Anti-pattern                                               | Fix                                                |
| ---------------------------------------------------------- | -------------------------------------------------- |
| `let open = false` for changing state                      | `atom(false)`                                      |
| DOM mutation inside an event handler                       | handler sets state, `ctx.effect` writes DOM        |
| `const $x = atom(ctx.props.$x.get())`                      | use `ctx.props.$x` directly                        |
| `document.addEventListener` + `querySelectorAll` init loop | one `define()` per element + `ctx.on`              |
| `store.subscribe(...)` / `.listen(...)`                    | `ctx.effect`                                       |
| `element.addEventListener`                                 | `ctx.on`                                           |
| `Object.defineProperties(ctx, ...)` to expose an API       | `return` the mixin from `setup`                    |
| `other.refs.x`                                             | child returns `get x() { return ctx.refs.x }`      |
| child writes `parent.props.$value.set(...)`                | child emits, parent pushes props down              |
| `key.consume(ctx, ...)` for a required parent              | `withContexts({ key })`                            |
| `interface ElementEventMap`                                | `interface HTMLElementEventMap`                    |
| `ctx.on(el, "x", (e: SomeEventMap["x"]) => ...)`           | drop the annotation, `ctx.on` infers               |
| `"my-thing:change"` custom event                           | native `change`                                    |
| emitting an event nobody listens to                        | delete it                                          |
| `r.one()` for a conditional element                        | `querySelector` + guard, and a non-`data-ref` hook |
| `r.one("h2")` for a tag you do not control                 | `r.one<HTMLElement>()`                             |
| `r.one<HTMLDialogElement>()` for markup you own            | `r.one("dialog")`                                  |
| valibot/zod for a scalar prop                              | `p.string()` / `p.oneOf([...], fallback)`          |
| `p.oneOf([...])` with no fallback                          | always supply a fallback                           |
| `el.setAttribute` to update a JSON prop                    | `el.prop = value`                                  |
| `computed()` returning DOM                                 | `ctx.effect` + `render`/`renderList`               |
| leaked observer / timer / third-party instance             | pair every one with `ctx.onCleanup`                |
| a "controller" module doing manual reconciliation          | `define()` + atoms + `ctx.effect`                  |
| an extra wrapper layer nobody asked for                    | make the existing component conditional            |
| imperative DOM patch-up in `setup` (`btn.type = "submit"`) | fix the template                                   |

## Naming and registration

- Custom element names must contain a hyphen. Pick one prefix per project and hold it; `x-*` is the convention by default.
- Name the element for the **behavior**, not for the file that renders it: a `Textarea.astro` that counts characters registers `x-char-count`.
- One custom element per behavior. Do not create near-duplicate elements per surface (`x-toc` and `x-mobile-toc` is one element, not two).
- Re-`define()`ing a tag logs a warning and **silently discards the new setup**. Register once, from one module.
- Register a peer element with an annotated side-effect import. It pulls in both the registration and the `HTMLElementTagNameMap` augmentation you need for `r.one("x-modal")`:

  ```typescript
  // Side-effect import registers x-modal and augments HTMLElementTagNameMap for the ref below.
  import "../modal/modal";
  ```

- Never call `define()` from a blocking inline script placed above the markup: the element can upgrade before its children are parsed and `collectRefs` will throw. Module scripts are deferred, which is why they are safe.

## Accessibility

- Reach for the native element first. `<dialog>` + `showModal()`, real radio inputs, the Popover API. You inherit focus handling and semantics for free, and there is then no focus-trap code to maintain.
- Ship correct initial ARIA in the markup, not from an effect after hydration.
- Every state effect writes its ARIA counterpart in the same place it writes the visual state.
- Do not invent roles. A list of links is not `role="menu"`.
- Restore focus with `focus({ focusVisible: true })` so the ring comes back after a close.
- **Reusable a11y patterns belong in an attachment, not copied between components.** Roving tabindex, focus return, overlay/dialog wiring, menu keyboard handling: these are exactly the behaviors that need listeners and effects, which is what an attachment is for. Written once as `attachRovingFocus(ctx, () => ctx.refs.tabs)`, the keyboard model is fixed in one place and every consumer inherits the fix.

  ```typescript
  const rover = attachRovingFocus(ctx, () => ctx.refs.tabs, {
    onActivate: (item) => ctx.props.$value.set(item.dataset.value ?? ""),
  });

  ctx.effect(ctx.props.$value, (value) => {
    rover.setActive(ctx.refs.tabs.findIndex((t) => t.dataset.value === value));
  });
  ```

  Layer them rather than writing one big one: an overlay attachment handles open/close state and focus, a dialog attachment adds modal semantics on top of it. Name your refs after what the attachment expects (`trigger`, `content`) and the call site collapses to one line. To read refs, an attachment needs a context type that carries them; `SetupContext<{}, {}>` has none, so narrow it:

  ```typescript
  export type AttachmentContext<R = {}> = Pick<
    SetupContext<{}, {}>,
    "host" | "on" | "emit" | "effect" | "onCleanup"
  > & { refs: R };

  // attachDialog.ts: modal semantics on top of the overlay (open/close state, aria-expanded)
  export function attachDialog(
    ctx: AttachmentContext<OverlayRefs & { content: HTMLDialogElement }>,
  ) {
    const overlay = attachOverlay(ctx, {
      show: () => ctx.refs.content.showModal(),
      hide: () => ctx.refs.content.close(),
    });
    ctx.on(ctx.refs.trigger, "click", () => overlay.open());
    ctx.on(ctx.refs.content, "cancel", (e) => {
      e.preventDefault();
      overlay.close();
    });
    return overlay;
  }

  // Component: refs carry the names the attachment expects
  define("x-modal")
    .withRefs((r) => ({ trigger: r.one("button"), content: r.one("dialog") }))
    .setup((ctx) => {
      attachDialog(ctx);
    });
  ```

  A11y logic that is pure—computing the next index, deciding whether an element is focusable—goes in a sibling module and gets unit-tested there.

## Framework notes

- **Astro**: see `references/astro.md` (host `display: contents`, `<script src>` for the registration module, SSR the initial state, JSON prop seeding, no `client:*` directives).
- **Testing**: see `references/testing.md`.
- **Exact signatures and coercion tables**: see `references/api.md`.
