// oxlint-disable max-classes-per-file
import { atom, type WritableAtom } from "nanostores";

import type {
  PropEntry,
  AnySchema,
  AttrPropKeys,
  ContextsSchema,
  Infer,
  InferRefs,
  PropDef,
  PropsSchema,
  ReactiveProps,
  RefsSchema,
  FullPropDef,
} from "./types";
import { Context, __ctx, type ComponentCtor, type SetupFn } from "./setup-context";
import { camelToKebab, invariant } from "./utils";

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
  attribute: true,
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
      `${context}: invalid value ${JSON.stringify(value)}: ${result.issues.map((i) => i.message).join(", ")}`,
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
  const storesInit: Record<string, boolean> = {};
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

    // Capture pre-upgrade own property before defining accessor
    const ownDesc = Object.getOwnPropertyDescriptor(host, key);
    const hasPre = ownDesc !== undefined && "value" in ownDesc;
    if (hasPre) delete (host as unknown as Record<string, unknown>)[key];

    const store = hasPre
      ? atom(def.attribute ? parseWithSchema(def.schema, ownDesc.value, ctx) : ownDesc.value)
      : def.attribute
        ? atom(parseWithSchema(def.schema, host.getAttribute(attrName), ctx))
        : atom<unknown>();
    if (hasPre) storesInit[key] = true;

    const updateFromAttr = def.attribute
      ? (v: string | null) => store.set(parseWithSchema(def.schema, v, ctx))
      : null;
    const updateFromProp = def.attribute
      ? function (this: HTMLElement, v: string | null) {
          if (v === null) this.removeAttribute(attrName);
          else this.setAttribute(attrName, String(v));
        }
      : (v: unknown) => {
          store.set(v);
          storesInit[key] = true;
        };

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
        if (storesInit[key]) {
          if (def.attribute) (h as any)[key] = store.get();
          continue;
        }
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
  Props extends PropsSchema,
  Refs extends RefsSchema,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Mixin = {},
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Contexts extends ContextsSchema = {},
>(
  name: string,
  propsSchema: Props,
  refsSchema: Refs,
  setupFn: SetupFn<Props, Refs, Contexts>,
  contextsSchema: Contexts = {} as Contexts,
): ComponentCtor<Props, Refs, Mixin, Contexts> {
  if (customElements.get(name)) {
    console.warn(`${name} already defined, reusing existing class`);
    return customElements.get(name) as ComponentCtor<Props, Refs, Mixin, Contexts>;
  }

  const attrPropKeys = Object.keys(propsSchema).filter((k) => {
    const entry = propsSchema[k];
    return entry !== undefined && (!isPropDef(entry) || entry.attribute);
  });
  const attrToPropKey: Record<string, string> = Object.fromEntries(
    attrPropKeys.map((k) => [camelToKebab(k), k]),
  );
  const ctxKeys = Object.keys(contextsSchema);

  class Component extends HTMLElement {
    #cleanups: VoidFunction[] = [];
    #props!: ReactivePropsResult<Props>;
    [__ctx]!: Context<Props, Refs, Contexts>;

    static get observedAttributes() {
      return attrPropKeys.map(camelToKebab);
    }

    constructor() {
      super();
      this.#props = createReactiveProps(this, propsSchema);
    }

    #onCleanup = (callback: VoidFunction): void => {
      this.#cleanups.push(callback);
    };

    disconnectedCallback(): void {
      let err: unknown;
      for (const fn of this.#cleanups) {
        try {
          fn();
        } catch (e) {
          err ??= e;
        }
      }
      this.#cleanups = [];
      if (err) throw err;
    }

    attributeChangedCallback(attrName: string, oldValue: string | null, newValue: string | null) {
      if (oldValue === newValue) return;
      const propKey = attrToPropKey[attrName] as AttrPropKeys<Props> | undefined;
      if (propKey) this.#props.updaters[propKey]?.(newValue);
    }

    connectedCallback() {
      this.#props.hydrateProps(this);
      const refs = collectRefs(this, refsSchema);

      if (ctxKeys.length === 0) {
        this.#runSetup(refs, {} as any);
        return;
      }

      const resolved: Record<string, unknown> = {};
      let remaining = ctxKeys.length;
      const ctxLike = { host: this as HTMLElement, onCleanup: this.#onCleanup };
      for (const k of ctxKeys) {
        contextsSchema[k]!.consume(ctxLike, (value: unknown) => {
          resolved[k] = value;
          if (--remaining === 0) {
            this.#runSetup(refs, resolved as any);
          }
        });
      }
    }

    #runSetup(refs: InferRefs<Refs>, contexts: any) {
      this[__ctx] = new Context<Props, Refs, Contexts>({
        host: this,
        onCleanup: this.#onCleanup,
        props: this.#props.stores,
        refs,
        contexts,
      });
      const mixin = setupFn(this[__ctx]);
      if (mixin) {
        const proto = Object.getPrototypeOf(this);
        const descriptors = Object.getOwnPropertyDescriptors(mixin);
        for (const key of Object.keys(descriptors)) {
          invariant(!(key in proto), `reserved mixin: ${key}`);
        }
        Object.defineProperties(this, descriptors);
      }
    }
  }

  // Cast to string to avoid HTMLElementTagNameMap circular reference during type inference
  customElements.define(name as string, Component);
  return Component as unknown as ComponentCtor<Props, Refs, Mixin, Contexts>;
}
