# Changelog

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
