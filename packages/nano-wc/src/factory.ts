// oxlint-disable max-classes-per-file
import { atom, type WritableAtom } from "nanostores";

import type {
  PropEntry,
  AnySchema,
  AttrPropKeys,
  ComponentProps,
  Infer,
  InferRefs,
  PropDef,
  PropsSchema,
  ReactiveProps,
  RefsSchema,
  FullPropDef,
} from "./types";
import { UIComponent, type ComponentCtor, type SetupFn } from "./UIComponent";
import { camelToKebab, invariant } from "./utils.ts";

function belongsTo(element: Element, host: HTMLElement): boolean {
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== host) {
    if (ancestor.tagName.includes("-")) return false;
    ancestor = ancestor.parentElement;
  }
  return true;
}

function refSelector(ref: string, hostTag?: string): string {
  return `[data-ref="${hostTag ? `${hostTag}:` : ""}${ref}"]`;
}

function isDangerousPrototypeProp(host: HTMLElement, key: string): boolean {
  let proto = Object.getPrototypeOf(host);
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, key);
    if (desc) {
      return typeof desc.value === "function" || !desc.configurable;
    }
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

export function isPropDef(entry: PropEntry): entry is PropDef {
  return !("~standard" in entry);
}

const defaultDef = {
  sync: true,
  get: (host: HTMLElement, key: string) => host.getAttribute(camelToKebab(key)),
};
function normalizeProp(entry: PropEntry): FullPropDef {
  if (isPropDef(entry)) return { ...defaultDef, ...entry };
  return { ...defaultDef, schema: entry };
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
  [Key in AttrPropKeys<Schema>]: (value: string | null) => void;
};

type ReactivePropsResult<Schema extends PropsSchema> = {
  stores: ReactiveProps<Schema>;
  updaters: PropUpdaters<Schema>;
  hydrateProps: (host: HTMLElement) => void;
};

export function createReactiveProps<Schema extends PropsSchema>(
  host: HTMLElement,
  schema: Schema,
): ReactivePropsResult<Schema> {
  const stores: Record<string, WritableAtom<any>> = {};
  const updaters: Record<string, ((value: string | null) => void) | null> = {};
  const keys = Object.keys(schema) as (keyof Schema & string)[];
  const normalized = new Map(
    keys.map((key) => {
      const entry = schema[key];
      invariant(entry, `${host.tagName} component. No schema found for prop "${key}"`);
      invariant(!isDangerousPrototypeProp(host, key), `reserved prop: ${key}`);
      return [key, normalizeProp(entry)] as const;
    }),
  );

  normalized.forEach((def, key) => {
    const ctx = `${host.tagName} component. Prop "${key}"`;
    const attrName = camelToKebab(key);
    const store = def.sync
      ? atom(parseWithSchema(def.schema, host.getAttribute(attrName), ctx))
      : atom<unknown>(undefined);
    const updateFromAttr = def.sync
      ? (v: string | null) => store.set(parseWithSchema(def.schema, v, ctx))
      : null;
    const updateFromProp = def.sync
      ? function (this: HTMLElement, v: string | null) {
          if (v === null) this.removeAttribute(attrName);
          else this.setAttribute(attrName, String(v));
        }
      : (v: unknown) => store.set(v);

    stores[`$${key}`] = store;
    updaters[key] = updateFromAttr;
    Object.defineProperty(host, key, {
      enumerable: true,
      get: () => store.get(),
      set: updateFromProp,
    });
  });

  return {
    stores: stores as ReactiveProps<Schema>,
    updaters: updaters as PropUpdaters<Schema>,
    hydrateProps(h: HTMLElement) {
      for (const [key, def] of normalized) {
        const store = (stores as Record<string, import("nanostores").WritableAtom>)[`$${key}`]!;
        const raw = def.get ? def.get(h, key) : undefined;
        store.set(parseWithSchema(def.schema, raw, `${h.tagName} component. Prop "${key}"`));
      }
    },
  };
}

export function collectRefs<Refs extends RefsSchema>(
  host: HTMLElement,
  schema: Refs,
): InferRefs<Refs> {
  const result = {} as InferRefs<Refs>;
  const missingSingleRefs: string[] = [];
  const hostTag = host.tagName.toLowerCase();

  for (const key of Object.keys(schema) as (keyof Refs & string)[]) {
    const entry = schema[key];
    invariant(entry, `${host.tagName} component. No schema found for ref "${key}"`);
    const isListRef = "__list" in entry && entry.__list === true;
    const sel = entry.__selector ?? refSelector(key);
    const ownedSel = refSelector(key, hostTag);
    const all = host.querySelectorAll(`${sel},${ownedSel}`);
    const shallow: Element[] = [];
    all.forEach((el) => {
      if (el.matches(ownedSel) || belongsTo(el, host)) shallow.push(el);
    });

    if (isListRef) {
      invariant(
        shallow.length > 0,
        `${host.tagName} component. Missing elements for list ref "${key}"`,
      );
      result[key] = shallow.map((el) =>
        parseWithSchema(entry.schema, el, `${host.tagName} component. List ref "${key}"`),
      ) as InferRefs<Refs>[typeof key];
    } else {
      if (!shallow[0]) {
        missingSingleRefs.push(key);
        continue;
      }
      result[key] = parseWithSchema(
        entry.schema,
        shallow[0],
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
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Mixin = {},
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

  const attrPropKeys = Object.keys(propsSchema).filter((k) => {
    const entry = propsSchema[k];
    return entry !== undefined && (!isPropDef(entry) || entry.sync);
  });
  const attrToPropKey: Record<string, string> = Object.fromEntries(
    attrPropKeys.map((k) => [camelToKebab(k), k]),
  );

  class Component extends UIComponent<Props, Refs> {
    static readonly elementName = name;
    #props!: ReactivePropsResult<Props>;
    #refs: InferRefs<Refs> | undefined;

    get host(): HTMLElement & ComponentProps<Props> {
      return this as HTMLElement & ComponentProps<Props>;
    }

    get refs(): InferRefs<Refs> {
      if (!this.#refs) {
        customElements.upgrade(this);
        this.#refs = collectRefs(this, refsSchema);
      }
      return this.#refs;
    }

    get props(): ReactiveProps<Props> {
      return this.#props.stores;
    }

    static get observedAttributes() {
      return attrPropKeys.map(camelToKebab);
    }

    constructor() {
      super();
      this.#props = createReactiveProps(this, propsSchema);
    }

    attributeChangedCallback(attrName: string, oldValue: string | null, newValue: string | null) {
      if (oldValue === newValue) return;
      const propKey = attrToPropKey[attrName] as AttrPropKeys<Props> | undefined;
      if (propKey) this.#props.updaters[propKey]?.(newValue);
    }

    connectedCallback() {
      this.#refs = undefined;
      this.#props.hydrateProps(this);
      const result = setupFn(this);
      if (result) {
        const proto = Object.getPrototypeOf(this);
        const descriptors = Object.getOwnPropertyDescriptors(result);
        for (const key of Object.keys(descriptors)) {
          invariant(!(key in proto), `reserved mixin: ${key}`);
        }
        Object.defineProperties(this, descriptors);
      }
    }
  }

  // Cast to string to avoid HTMLElementTagNameMap circular reference during type inference
  customElements.define(name as string, Component);
  return Component as unknown as ComponentCtor<Name, Props, Refs, Mixin>;
}
