# Testing nanotags components

Rules and traps for testing nanotags components. For helper signatures and exact behavior, see the [Testing API](https://nanotags.psdcoder.dev/api#testing-api) and the cookbook's [Testing](https://nanotags.psdcoder.dev/cookbook#testing) section.

## Pick a strategy per component

- **Mostly glue:** move the real logic into a module next to the component and unit-test that module. The type check covers the wiring. If the logic needs elements, pass a function that returns them (`items: () => HTMLElement[]`), so the test needs no DOM.
- **The DOM behavior is the point** (reading initial data, updating when a property is set, reusing list items, switching state): mount the element with `nanotags/testing` in jsdom or happy-dom.

```typescript
import { afterEach, expect, it } from "vitest";
import { cleanup, h, mount, ref } from "nanotags/testing";

// Registers x-char-count and adds it to HTMLElementTagNameMap.
import "./char-count";

afterEach(cleanup);

it("counts characters as the user types", () => {
  // Same markup as the server template renders
  const host = mount(
    h(
      "x-char-count",
      null,
      h("textarea", { "data-ref": "field", maxlength: 10 }),
      h("span", { "data-ref": "count" }, "0"),
    ),
  );
  const field = ref(host, "field");

  field.value = "hello";
  field.dispatchEvent(new Event("input", { bubbles: true }));

  expect(ref(host, "count").textContent).toBe("5");
});
```

## Rules

- **Build and insert markup only with `h` and `mount`.** `mount` puts children, attributes and JSON seeds in place before `connectedCallback`, and rethrows errors from the constructor and setup. jsdom doesn't throw those errors: it reports them as a `window` `error` event, so without `mount` a broken component gives the test an element that silently does nothing. Setting `innerHTML` after appending makes the ref lookup throw with an error that blames the component.
- **`afterEach(cleanup)` is the whole teardown.** Mount surrounding markup (the nav a scroll spy tracks, the link that opens a modal) with `mount` too, so `cleanup` removes it. Never reset `document.body` by hand.
- **Read refs with `ref`/`refs`, not `querySelector`.** They follow the ownership rule (a `data-ref` inside a nested custom element belongs to that element) and return typed elements. `querySelectorAll` also picks up refs that belong to child components.
- **Copy the real markup and note which template it came from.** If the test's markup drifts from the real one, the test passes while the component is broken.
- **Pass optional values through as they are.** `h` skips `undefined` and leaves `null`/`false` attributes out, so a missing value tests the schema fallback with no `if`. `p.json` props are the exception: `null` and `false` go into the seed, and the schema gets them instead of the fallback.
- **Stub a peer element instead of importing its component.** `stubElement` records property writes and method calls, and the test doesn't depend on registration order. The peer's setup replaces stubbed methods, so stub methods only after it has set up. To record writes made during setup, `create` the host, stub, then `connect`.
- **Provide a context with `provideContext` instead of mounting the real provider.** Export the context key from the module that creates it; the key is part of the component's contract with its children. A consumer with no provider does nothing and looks broken; `ref` throws on such a host and names the missing provider.
- **Only assert what the DOM shows.** Never read the `__ctx` symbol.
- **For a keyed list, check that each node stays with its item, not just that the text matches.** A key that changes every render rebuilds nodes, losing focus, input state and running transitions. An index key keeps nodes but hands them to other items on a reorder, so that state moves to the wrong item. Reorder the data and assert that the node showing an item is the one that showed it before: `expect(list.querySelector('[data-id="b"]')).toBe(before)`.
- **Listen for events with the runner's spy.** Remove listeners on `document` or `window` in teardown. To check state at the moment an event fired, read it inside the listener.
- **A component defined inside a test gets `uniqueTag()`.** A tag can't be redefined, and a second `define()` with a taken name keeps the first setup.
- **With `vi.mock`, create what the factory needs with `vi.hoisted`.** Vitest moves `vi.mock` above all imports, so the factory can't use the file's variables.
- **Use `await vi.waitFor(...)` for async work.** With fake timers, assert just before and just after the timer fires.

## Things worth a test

- Every prop's fallback (attribute missing) and an explicit value.
- `p.oneOf` rejecting an invalid value: `expect(() => mount(h(...))).toThrow()`, with the `h` call inside the callback, since `h` may create the component itself and throw first. Under jsdom, a later `setAttribute` with a bad value doesn't throw; it's reported as a `window` `error` event.
- A JSON prop reading its seed, then updating through the property setter.
- **Disconnect:** mount, act, `disconnect(host)`, act again, and check that nothing changed. Catches a listener or timer that skipped `onCleanup`.
- **Reconnect:** `disconnect(host)`, then `connect(host)`, and check that it still works. Setup runs again from scratch, so this catches state kept in a `let`.
- A missing ref, when the markup contract matters: `r.one` throws at connect.

## Upgrade order is a design problem

On a real page the markup is parsed before module scripts run, so definition order (import order) decides setup order. In a test, `mount` inserts markup after the components are defined, so nested setup follows the DOM implementation instead: outer first in browsers and jsdom, inner first in happy-dom. A parent whose setup calls a child's mixin depends on one of these orders. If a test needs special steps to get that order right, fix the component, not the test: have the parent provide the state through a context and the child react to it. Contexts resolve in either order, so a plain `mount` covers it.

```typescript
// Coupled: the outlet's first effect calls into the modal.
ctx.effect($hash, (hash) => {
  if (!hash) ctx.refs.modal.close();
});

// Decoupled: the outlet provides the state, the modal follows it.
modalContext.provide(ctx, { $open: computed($hash, (hash) => hash !== "") });
```

## jsdom and happy-dom are not browsers

Checked against jsdom 29 and happy-dom 20:

| | jsdom | happy-dom |
|---|---|---|
| `dialog.showModal()` / `show()` / `close()` | missing | works, `close` fires |
| `ResizeObserver`, `IntersectionObserver`, `matchMedia`, `element.scrollTo` | missing | present |
| `showPopover()`, `element.animate`, `getAnimations()` | missing | missing |
| `element.inert` | missing | present |
| Layout (`clientWidth`, `getBoundingClientRect`) | `0` | `0` |
| Setup order of nested components | outer first, like a browser | inner first |
| `define()` runs after the markup exists, parent first | child upgraded in place | child replaced by a new node on upgrade |
| Component whose attribute prop has no fallback | created with its attributes set | created before its attributes are set, so the schema rejects `null` |

What this means for tests:

- **Coupled components can pass in happy-dom and fail in a browser**, because happy-dom sets up the child first. Another reason to decouple through a context.
- **In happy-dom, a parent can hold a dead child.** When markup is mounted before its components are defined (a fixture component defined in the test body, or raw HTML mounted first) and the parent is defined first, the parent keeps the child node from before the upgrade. Nothing it writes reaches the real child, not even `withProps` props. Define the child before the parent. Components registered by an import are defined before any markup exists, so they aren't affected.
- **Make a shim behave like the browser, not like whatever makes the test pass.** Under jsdom `el.inert ?? true` gives `true`; a shim with the real boolean changes that result. Keep shims in one shared module so every test uses the same fake, and cover only what the component uses.
- **Don't shim layout.** Define the sizes the component reads on the element it reads them from (`Object.defineProperty(el, "clientWidth", { value: 300, configurable: true })`). If a component needs so much fake geometry that the test stops meaning anything, test it end to end.
