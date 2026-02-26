// oxlint-disable max-classes-per-file
import { atom } from "nanostores";

import type { AnySchema, Infer, InferRefs, PropsSchema, ReactiveProps, RefsSchema } from "./types";
import { UIComponent, type ComponentCtor, type SetupFn } from "./UIComponent";

export function invariant(condition: unknown, message: string | Error): asserts condition {
  if (!condition) {
    throw message instanceof Error ? message : new Error(message);
  }
}

function hasBlockingCustomElementAncestor(
  element: Element,
  host: HTMLElement,
  allowedTags?: readonly string[],
): boolean {
  const allowed = allowedTags?.map((t) => t.toUpperCase());
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== host) {
    if (ancestor.tagName.includes("-") && !allowed?.includes(ancestor.tagName)) return true;
    ancestor = ancestor.parentElement;
  }
  return false;
}

export function parseWithSchema<S extends AnySchema>(
  schema: S,
  value: unknown,
  context: string,
): Infer<S> {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) {
    throw new TypeError(`${context}: async schemas not supported`);
  }
  if (result.issues) {
    throw new TypeError(
      `${context}: invalid value ${JSON.stringify(value)} — ${result.issues.map((i) => i.message).join(", ")}`,
    );
  }
  return result.value as Infer<S>;
}

type PropUpdaters<Schema extends PropsSchema> = {
  [Key in keyof Schema]: (value: string | null) => void;
};

type ReactivePropsResult<Schema extends PropsSchema> = {
  stores: ReactiveProps<Schema>;
  updaters: PropUpdaters<Schema>;
};

export function createReactiveProps<Schema extends PropsSchema>(
  host: HTMLElement,
  schema: Schema,
): ReactivePropsResult<Schema> {
  const stores = {} as ReactiveProps<Schema>;
  const updaters = {} as PropUpdaters<Schema>;

  for (const key of Object.keys(schema) as (keyof Schema & string)[]) {
    const propSchema = schema[key];
    invariant(propSchema, `${host.tagName} component. No schema found for prop "${key}"`);
    const parseValue = (value: string | null) =>
      parseWithSchema(propSchema, value, `${host.tagName} component. Prop "${key}"`);

    const store = atom(parseValue(host.getAttribute(key)));
    const updater = (value: string | null) => store.set(parseValue(value));

    (stores as Record<string, unknown>)[`$${key}`] = store;
    updaters[key] = updater;

    Object.defineProperty(host, key, {
      enumerable: true,
      get() {
        return store.get();
      },
      set(value: string | null) {
        if (value === null) {
          host.removeAttribute(key);
        } else {
          host.setAttribute(key, String(value));
        }
      },
    });
  }

  return { stores, updaters };
}

export function collectRefs<Refs extends RefsSchema>(
  host: HTMLElement,
  schema: Refs,
): InferRefs<Refs> {
  const result = {} as InferRefs<Refs>;
  const missingSingleRefs: string[] = [];

  for (const key of Object.keys(schema) as (keyof Refs & string)[]) {
    const entry = schema[key];
    invariant(entry, `${host.tagName} component. No schema found for ref "${key}"`);
    const isListRef = "__list" in entry && entry.__list === true;
    const selector = entry.__options?.selector ?? `[data-ref="${key}"]`;

    if (isListRef) {
      const elements = Array.from(host.querySelectorAll(selector)).filter(
        (el) => !hasBlockingCustomElementAncestor(el, host, entry.__options?.includeComponents),
      );
      invariant(
        elements.length > 0,
        `${host.tagName} component. Missing elements for list ref "${key}"`,
      );
      result[key] = elements.map((el) =>
        parseWithSchema(entry.schema, el, `${host.tagName} component. List ref "${key}"`),
      ) as InferRefs<Refs>[typeof key];
    } else {
      const refElement = Array.from(host.querySelectorAll(selector)).find(
        (el) => !hasBlockingCustomElementAncestor(el, host, entry.__options?.includeComponents),
      );
      if (!refElement) {
        missingSingleRefs.push(key);
        continue;
      }
      result[key] = parseWithSchema(
        entry.schema,
        refElement,
        `${host.tagName} component. Ref "${key}"`,
      ) as InferRefs<Refs>[typeof key];
    }
  }

  if (missingSingleRefs.length > 0) {
    throw new Error(
      `${host.tagName} component. Missing elements for refs "${missingSingleRefs.join(", ")}"`,
    );
  }

  return result;
}

export function createComponent<
  const Name extends string,
  Props extends PropsSchema,
  Refs extends RefsSchema,
  Mixin = Record<string, never>,
>(
  name: Name,
  propsSchema: Props,
  refsSchema: Refs,
  setupFn: SetupFn<Props, Refs>,
): ComponentCtor<Name, Props, Refs, Mixin> {
  if (customElements.get(name)) {
    console.warn(`${name} already defined, reusing existing class`);
    return customElements.get(name) as ComponentCtor<Name, Props, Refs, Mixin>;
  }

  class Component extends UIComponent<Props, Refs> {
    static readonly elementName = name;
    #props!: ReactivePropsResult<Props>;

    get host(): HTMLElement {
      return this;
    }

    get refs(): InferRefs<Refs> {
      return this.withCache("refs", () => collectRefs(this, refsSchema));
    }

    get props(): ReactiveProps<Props> {
      return this.#props.stores;
    }

    static get observedAttributes() {
      return Object.keys(propsSchema) as (keyof Props & string)[];
    }

    constructor() {
      super();
      this.#props = createReactiveProps(this, propsSchema);
    }

    attributeChangedCallback(attrName: string, oldValue: string | null, newValue: string | null) {
      if (oldValue === newValue) return;
      const updater = this.#props.updaters[attrName as keyof Props];
      invariant(
        updater,
        `${this.constructor.name} component. No prop updater found for attribute "${attrName}"`,
      );
      updater(newValue);
    }

    connectedCallback() {
      // Force-upgrade descendants so refs resolve to fully initialized component instances
      // during SPA-style DOM swaps where parent elements upgrade before children (tree order).
      customElements.upgrade(this);
      const result = setupFn(this);
      if (result) Object.assign(this, result);
    }
  }

  // Cast to string to avoid HTMLElementTagNameMap circular reference during type inference
  customElements.define(name as string, Component);
  return Component as unknown as ComponentCtor<Name, Props, Refs, Mixin>;
}
