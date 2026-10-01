# Changelog

## Unreleased

### 0.17.0

- Ship the `nanotags-components` agent skill in the package (`skills/nanotags-components`): rules for idiomatic components plus references for the exact API, Astro integration and testing.

## 0.16.0

### Added

- Add `nanotags/testing` entry point for testing components in a DOM environment (jsdom or happy-dom, neither bundled) with any test runner. Dev-only: no runtime entry imports it and it shares no chunk with them, so it only reaches a bundle that imports it directly, and it stays outside the size budget.
- `h(tag, props, ...children)` builds the markup a server renders for an element, in the shape of React's `createElement`: on a component, attribute props become attributes and `p.json()` props become `data-prop` seed scripts. String children are raw HTML; nested `h` calls seed nested components.
- `mount` parses `h` markup, a bare tag or constructor, or raw HTML while it is detached, then connects it into `document.body` or a given parent in one insertion, so children and seeds exist before `connectedCallback` runs and a component sees its later siblings, as on a parsed page (happy-dom still connects root by root). `create` builds a single element and leaves it detached for `connect`.
- On a component typed through `HTMLElementTagNameMap`, or passed as a constructor, the helpers read its own definition: `h` checks props and seeds against its props, `mount` and `create` return the element type, and `ref`/`refs` accept only its `r.one`/`r.many` names and return the element each declares. Once the host has set up, `ref`/`refs` return what the component resolved at connect, selector-declared refs included. A misspelt name fails to compile; an explicit type argument opts a lookup out.
- `mount`, `create`, `connect`, `disconnect`, `cleanup` and `provideContext` rethrow what a component's constructor, setup or teardown throws, which jsdom would otherwise report as a window `error` event and lose. `cleanup` removes everything the helpers inserted, finishes first and rethrows several failures as an `AggregateError`. `disconnect` followed by `connect` puts a host back where it was, for reconnect tests.
- The helpers throw instead of dropping input: `h` on a string that is not a tag name, `h`, `mount` and `create` on an undefined dashed tag or an unregistered class, `mount` on a parent that is not in the document. Raw HTML goes in as is. `h` rethrows when it cannot construct a component to learn its props, and `stubElement` throws when a component's pending setup would replace a stubbed method.
- `provideContext` stands in for a context provider, `stubElement` stands in for a peer element's props and methods and records writes and calls, and `uniqueTag` names fixture components.
- Add a Testing section to the Cookbook, covering both testing strategies, peer stubs, the jsdom and happy-dom capability gaps with ready-made shims, and the upgrade-order caveat.

### Changed

- `p.json()` is typed as the new `JsonPropDef`, whose `get` is required, so `h` can tell a prop that reads a seed from a property-only prop.
- The per-instance setup context key is now the registered `Symbol.for("nanotags:ctx")`, so `nanotags/testing` can tell whether setup ran without importing the runtime.

### Fixed

- Define component props as `configurable`. Redefining one threw `Cannot redefine property`, so nothing could stand in for the props of a registered component. A setup return key that reuses a prop name throws `reserved mixin: <key>` instead of replacing the prop.

## 0.15.2

### Added

- Add SVG element support in ref builders and setup context.

## 0.15.1

### Fixed

- Allow store with narrower type than control value in `bind()`.

## 0.15.0

### Bug Fixes

- Fix `renderOne` skipping update callback on subsequent calls without data (shared null reference caused identity check to short-circuit)

### Refactoring

- Align `getElement`/`getElements` generics with `one`/`many` pattern: separate overloads for tag-name and element-type instead of `E extends keyof HTMLElementTagNameMap`

## 0.14.0

### Refactoring

- Replace valibot with minimal inline StandardSchemaV1 schemas, move valibot to devDependencies

## 0.13.1

- Fix publish script to include README.md to the published files

## 0.13.0

- Rename package to "nanotags"

## 0.12.0

### Breaking Changes

- Replace `UIComponent` abstract class with plain context object: `ctx` is now a separate object with a `host` ref instead of being the element itself
- Remove `ctx.sync()`, replace with unified `ctx.bind(store, element)`: store is always the first argument
- Rename `PropDef.sync` to `attribute` for controlling HTML attribute reflection
- Move props/refs into Context, expose via `__ctx` symbol instead of host element getters
- Replace static `elementName` with `customElements.getName()`, add `ComponentBrand` type for type-safe `consume()`
- Revert to nanostores `ReadableAtom`/`WritableAtom` types instead of local store types (local types lacked `listen()` causing runtime crash with `effect()`)
- Split context protocol into separate `nanotags/context` entry point
- Drop tag-name generics and array-of-tags from ref builders: use `r.one<HTMLButtonElement>` instead of `r.one<"button">`

### Features

- Add `withContexts()` builder method: declares required contexts on the builder chain, setup defers until all resolve, eliminating callback nesting from `consume()`
- Type `currentTarget` in `ctx.on()` overloads for exact element type in callbacks

### Bug Fixes

- Support native boolean values (`true`/`false`) in boolean prop schema
- Skip attribute init for props already set via property setter
- Handle pre-upgrade properties on not-yet-upgraded custom element children

### Refactoring

- Simplify `invariant` to only accept string messages
- Reuse `getElements` in `getElement` to reduce bundle size
- Remove `composed: true` from emitted `CustomEvent`s (unnecessary without Shadow DOM)

### Dependencies

- Bump `valibot` to `^1.3.1`

## 0.11.0

### Breaking Changes

- Redesign `render`/`renderList` API: template is now a separate argument instead of options property
- Rename `getKey` to `key` in `renderList` options
- `render`/`renderList` now own entire container — unmanaged children are removed
- `render` replaces previous content instead of appending, returns the rendered element
- `render` accepts either `HTMLTemplateElement` or callback returning `Element`
- Remove `withCache` from public API

### Refactoring

- Replace internal `withCache` usage with private `#refs` field for refs caching

## 0.10.0

### Breaking Changes

- Replace `includeComponents` with prefix-based ref ownership
- Replace options object with flat string API for refs (`one`/`many`)
- Rename `bind` to `sync`, add `bind` for DOM controls
- Replace `clone`/`cloneList` with `renderList` and `render` in `nanotags/render`

### Features

- Extract `render`/`renderList` into separate `nanotags/render` entry
- Replace `JsonPropMarker` with `PropDef` for unified prop hydration
- Add null fallback overloads and rename `list` to `oneOf` in props
- Auto-convert camelCase prop keys to kebab-case HTML attributes
- Add `Element` generic and array-of-tags overloads to ref builders
- Add optional fallback support to prop builders

### Bug Fixes

- Expose string-event overload for `ctx.on()`
- Preserve getter/setter descriptors when attaching setup mixin
- Replace `Record<string, never>` defaults with `{}` to prevent index signature leak
- Allow safe prototype prop overrides like `lang` and `className`

### Refactoring

- Decouple store types from nanostores-specific atoms
- Widen `getElement`/`getElements` root param to accept `Element`

### Docs

- Add Attachments section to README
