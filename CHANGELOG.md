# Changelog

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
- Replace `clone`/`cloneList` with `renderList` and `render` in `nano-wc/render`

### Features

- Extract `render`/`renderList` into separate `nano-wc/render` entry
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
