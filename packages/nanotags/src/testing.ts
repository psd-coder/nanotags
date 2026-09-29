/**
 * Testing helpers for nanotags components. Needs a DOM environment such as jsdom or happy-dom,
 * and works with any test runner.
 */

// Types only: a runtime import would put a chunk shared with this module into every runtime bundle.
import type { Context, __ctx } from "./setup-context";
import type { AttrPropKeys, Infer, InferRef, PropDef, PropsSchema } from "./types";

// The key the runtime stores a component's setup context under.
const CTX: unique symbol = Symbol.for("nanotags:ctx");

const tracked = new Set<ChildNode>();
const places = new WeakMap<Element, { parent: Element; next: Node | null }>();
const provided = new Set<VoidFunction>();

// That same brand carries the component's props and refs schemas in its type, which is what
// lets `mount` and `ref` check names and values against the definition.
type ContextOf<E> = E extends { readonly [__ctx]: infer C } ? C : never;
type PropsOf<E> = ContextOf<E> extends Context<infer P, infer _R, infer _C> ? P : never;
type RefsOf<E> = ContextOf<E> extends Context<infer _P, infer R, infer _C> ? R : never;

// Resolves to `never` for a nanotags component, so an untyped overload refuses one and a
// misspelt name cannot fall through to it.
type Untyped<E> = [ContextOf<E>] extends [never] ? unknown : never;
// A tag the map knows has an overload of its own to be checked against.
type UnknownTag<S> = S extends keyof HTMLElementTagNameMap ? never : unknown;

type RefName<E, List extends boolean> = [ContextOf<E>] extends [never]
  ? never
  : {
      [K in keyof RefsOf<E>]: RefsOf<E>[K] extends { readonly __list: true }
        ? List extends true
          ? K
          : never
        : List extends true
          ? never
          : K;
    }[keyof RefsOf<E>] &
      string;

type AttrValue = string | number | boolean | null | undefined;
type ExtraAttrName = "id" | "class" | `data-${string}` | `aria-${string}`;

// Only a prop with its own `get` reads a seed; the default one reads the attribute.
type SeedKeys<P extends PropsSchema> = Exclude<
  {
    [K in keyof P]: P[K] extends { get: PropDef["get"] & {} } ? K : never;
  }[keyof P],
  AttrPropKeys<P>
>;

/**
 * Props of `h`: a component's attribute props (plus `id`, `class`, `data-*`, `aria-*`) become
 * attributes, its JSON props become `data-prop` seeds. Anything goes on an untyped element.
 */
export type MarkupProps<E> = [ContextOf<E>] extends [never]
  ? Record<string, unknown>
  : { [K in AttrPropKeys<PropsOf<E>> | ExtraAttrName]?: AttrValue } & {
      [K in SeedKeys<PropsOf<E>>]?: Infer<PropsOf<E>[K]> | undefined;
    };

/** Raw HTML, or markup built by `h`. */
export type Child = string | Markup<Element>;

/**
 * HTML built by `h`, typed with the element its root builds so `mount` and `create` return it
 * typed. Inside a template literal it interpolates as its HTML.
 */
export class Markup<E extends Element = HTMLElement> {
  /** Type-only: the element the root of this markup builds. */
  declare readonly element: E;
  readonly html: string;

  constructor(html: string) {
    this.html = html;
  }

  toString(): string {
    return this.html;
  }
}

/**
 * Build the markup a server would render for an element, the way `createElement` builds a
 * React element: `h(tag, props, ...children)`.
 *
 * On a component, attribute props are written as attributes (camelCase keys kebab-cased) and
 * JSON props as the `data-prop` scripts `p.json()` reads. `undefined` is skipped everywhere;
 * `null` and `false` skip an attribute and `true` writes it empty. String children are raw HTML.
 *
 * On a component typed through `HTMLElementTagNameMap`, or passed as a constructor, props are
 * checked against its definition, so nested components get typed seeds too.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: MarkupProps<HTMLElementTagNameMap[K]> | null,
  ...children: Child[]
): Markup<HTMLElementTagNameMap[K]>;
export function h<E extends HTMLElement>(
  ctor: new () => E,
  props?: MarkupProps<E> | null,
  ...children: Child[]
): Markup<E>;
export function h<S extends string>(
  tag: S & UnknownTag<S>,
  props?: Record<string, unknown> | null,
  ...children: Child[]
): Markup;
export function h(
  target: string | (new () => HTMLElement),
  props?: Record<string, unknown> | null,
  ...children: Child[]
): Markup {
  return new Markup(build(target, props ?? {}, children, "h"));
}

function build(
  target: string | (new () => HTMLElement),
  props: Record<string, unknown>,
  children: Child[],
  caller: string,
): string {
  const tag = tagOf(target, caller);
  const observed = observedAttributes(tag);
  const entries = Object.entries(props).filter(([, value]) => value !== undefined);
  const isAttrProp = (key: string) => observed.includes(camelToKebab(key));
  const others = entries.filter(([key]) => !isAttrProp(key));
  const probe =
    others.length > 0 && tag.includes("-")
      ? construct(
          tag,
          entries.filter(([key]) => isAttrProp(key)),
        )
      : undefined;
  let attrs = "";
  let seeds = "";

  for (const [key, value] of entries) {
    if (isAttrProp(key)) attrs += attribute(camelToKebab(key), value);
    else if (probe && Object.hasOwn(probe, key)) seeds += jsonProp(key, value);
    // Any other key is an attribute name already, `viewBox` included.
    else attrs += attribute(key, value);
  }

  return `<${tag}${attrs}>${seeds}${children.join("")}</${tag}>`;
}

function attribute(name: string, value: unknown): string {
  if (value === null || value === false) return "";

  return value === true ? ` ${name}` : ` ${name}="${escapeAttr(String(value))}"`;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function observedAttributes(tag: string): string[] {
  const ctor = customElements.get(tag);
  const observed: unknown = ctor && "observedAttributes" in ctor ? ctor.observedAttributes : [];

  return Array.isArray(observed) ? observed : [];
}

// A component defines every prop on the instance as it is constructed, so an instance tells which
// keys are props. It gets its attribute props first, since their schemas may reject a missing one.
function construct(tag: string, attrProps: [string, unknown][]): Element {
  const attrs = attrProps.map(([key, value]) => attribute(camelToKebab(key), value)).join("");
  let el: Element | null = null;
  throwFirst(trap(() => (el = parseHtml(`<${tag}${attrs}></${tag}>`).firstElementChild)));
  if (!el) throw new Error(`h: <${tag}> could not be constructed`);

  return el;
}

type Target = string | Markup<Element> | (new () => HTMLElement);

/**
 * Insert markup and connect it: the component under test, or the DOM around it (the nav a scroll
 * spy tracks, the container a controls element drives, the link that opens a modal).
 *
 * Takes a tag name or a constructor for a bare host, markup from `h`, or a raw HTML string.
 * Everything is parsed detached, so children, attributes and JSON seeds exist before any
 * `connectedCallback` runs, then goes in with one insertion, so a component sets up with every
 * sibling already in place, the way it does on a parsed page. Appends to `document.body` unless
 * a parent is given. Returns the first element, typed from the tag, constructor or `h` markup.
 */
export function mount<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  parent?: Element,
): HTMLElementTagNameMap[K];
export function mount<E extends HTMLElement>(
  target: (new () => E) | Markup<E>,
  parent?: Element,
): E;
export function mount<E extends Element = HTMLElement>(html: string, parent?: Element): E;
export function mount(target: Target, parent: Element = document.body): Element {
  const nodes = [...parseHtml(toHtml(target, "mount")).childNodes];
  const root = nodes.find((node) => node instanceof Element);
  if (!root) throw new Error("mount: markup has no root element");

  if (!parent.isConnected) {
    throw new Error("mount: the parent is not in the document, so nothing would connect");
  }

  for (const node of nodes) tracked.add(node);
  throwFirst(trap(() => parent.append(...nodes)));

  return root;
}

/**
 * Build a single element the way `mount` would, but leave it detached; `connect(host, parent?)`
 * connects it. Use when something has to happen between building and `connectedCallback`:
 * stubbing a peer element, faking layout geometry, connecting a child before its parent.
 */
export function create<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
export function create<E extends HTMLElement>(target: (new () => E) | Markup<E>): E;
export function create<E extends Element = HTMLElement>(html: string): E;
export function create(target: Target): Element {
  const roots = [...parseHtml(toHtml(target, "create")).children];
  const root = roots[0];
  if (roots.length !== 1 || !root) {
    throw new Error("create: markup must have exactly one root element");
  }

  root.remove();

  return root;
}

// A bare tag name or constructor is shorthand for `h(target)`; any other string is raw HTML.
function toHtml(target: Target, caller: string): string {
  if (target instanceof Markup) return target.html;
  if (typeof target === "string" && !TAG_RE.test(target)) return target;

  return build(target, {}, [], caller);
}

/**
 * Append an element built with `create`, running its `connectedCallback`.
 *
 * Without a parent it goes back where `disconnect` took it from, or into `document.body`.
 * Registers the element for `cleanup`.
 */
export function connect<E extends Element>(host: E, parent?: Element): E {
  const place = parent ? undefined : places.get(host);
  const target = parent ?? place?.parent ?? document.body;
  if (!target.isConnected) {
    throw new Error("connect: the parent is not in the document, so the host would never connect");
  }

  const next = place?.next?.parentNode === target ? place.next : null;
  tracked.add(host);
  throwFirst(trap(() => target.insertBefore(host, next)));

  return host;
}

/**
 * Remove an element, running its `disconnectedCallback`, with any teardown error rethrown here.
 *
 * `connect(host)` afterwards puts it back where it was, which is how to test reconnection.
 */
export function disconnect<E extends Element>(host: E): E {
  if (host.parentElement) places.set(host, { parent: host.parentElement, next: host.nextSibling });
  tracked.delete(host);
  throwFirst(trap(() => host.remove()));

  return host;
}

/**
 * Run a DOM mutation with anything a custom element reaction throws collected, not lost.
 *
 * DOM implementations disagree here: happy-dom lets the exception propagate out of the mutation,
 * jsdom and browsers report it as a window `error` event instead. Left alone, a setup or teardown
 * that throws (a missing ref, a prop that fails its schema) hands the test a silently inert
 * element and shows up much later as a baffling assertion.
 */
function trap(mutation: () => void): unknown[] {
  const failures: unknown[] = [];
  const onError = (event: ErrorEvent) => {
    failures.push(event.error ?? new Error(event.message));
    event.preventDefault();
  };

  globalThis.addEventListener("error", onError);
  try {
    mutation();
  } catch (error) {
    failures.push(error);
  } finally {
    globalThis.removeEventListener("error", onError);
  }

  return failures;
}

function throwFirst(failures: unknown[]): void {
  if (failures.length > 0) throw failures[0];
}

const TAG_RE = /^[a-zA-Z][\w.-]*$/;

function tagOf(target: string | (new () => HTMLElement), caller: string): string {
  const tag = typeof target === "string" ? target : customElements.getName(target);
  if (!tag) throw new Error(`${caller}: constructor is not a registered custom element`);
  // Without this a typo'd tag silently produces an inert element and the test fails later,
  // somewhere unrelated.
  if (!TAG_RE.test(tag)) throw new Error(`${caller}: "${tag}" is not a tag name`);
  if (tag.includes("-") && !customElements.get(tag)) {
    throw new Error(
      `${caller}: <${tag}> is not defined. Import the module that calls define("${tag}") first.`,
    );
  }

  return tag;
}

// Parse detached, in the main document, so custom elements pick up their definition but stay
// unconnected until the test appends them.
function parseHtml(html: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  return wrapper;
}

function camelToKebab(str: string): string {
  return str.replaceAll(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * Remove every element mounted or connected since the last cleanup, firing disconnect, and undo
 * every `provideContext`.
 *
 * It goes through all of them even when a teardown throws, then rethrows: one error as is,
 * several as an `AggregateError`. A teardown that fails is a bug worth a red test, and one that
 * stopped the loop would leak the rest into the next test.
 */
export function cleanup(): void {
  const failures: unknown[] = [];

  try {
    for (const node of tracked) failures.push(...trap(() => node.remove()));
  } finally {
    tracked.clear();
    for (const dispose of provided) dispose();
    provided.clear();
  }

  if (failures.length > 1) {
    throw new AggregateError(failures, `cleanup: ${failures.length} teardowns threw`);
  }
  throwFirst(failures);
}

type ResolvedRefs = { refs: Record<string, Element | Element[] | undefined> };

function ctxOf(el: Element): ResolvedRefs | undefined {
  return (el as Element & { [CTX]?: ResolvedRefs })[CTX];
}

// The runtime declares the context key as a class field, so every instance has it from construction.
function isComponent(el: Element): boolean {
  return Object.hasOwn(el, CTX);
}

function isSetUp(el: Element): boolean {
  return ctxOf(el) !== undefined;
}

/** Structural shape of a `createContext` key. */
type ContextKeyLike<T> = {
  provide(ctx: { host: HTMLElement; onCleanup: (cb: VoidFunction) => void }, value: T): void;
};

/**
 * Stand in for the ancestor that would normally provide a context, so a component declaring
 * `withContexts` can be mounted on its own.
 *
 * Without this the only way to satisfy a consumer is to mount its real provider, which drags a
 * second component (its refs, markup and setup) into a test about one element.
 *
 * Order does not matter: a consumer that mounts first parks itself until a provider appears.
 * `cleanup` removes the provider along with everything mounted.
 */
export function provideContext<T>(host: HTMLElement, key: ContextKeyLike<T>, value: T): void {
  const disposers: VoidFunction[] = [];
  key.provide({ host, onCleanup: (cb) => disposers.push(cb) }, value);
  provided.add(() => {
    for (const dispose of disposers) dispose();
  });
}

// The `<script data-prop>` a server renders for a `p.json()` seed. `data-prop` takes the camelCase
// prop key verbatim, unlike the kebab-case attribute fallback.
function jsonProp(name: string, value: unknown): string {
  // `<` only ever occurs inside JSON strings, where `<` is the same character, and escaping
  // it keeps a `</script>` in the data from closing the tag early.
  const json = JSON.stringify(value).replaceAll("<", "\\u003c");

  return `<script type="application/json" data-prop="${name}">${json}</script>`;
}

// A component that has set up holds the refs it resolved, including ones declared with a selector,
// which nothing in the markup marks as refs.
function resolvedRefs(host: Element, name: string): Element[] | undefined {
  const found = ctxOf(host)?.refs[name];
  if (found === undefined) return undefined;

  return Array.isArray(found) ? found : [found];
}

function collect(host: Element, name: string): Element[] {
  const resolved = resolvedRefs(host, name);
  if (resolved) return resolved;

  const tag = host.tagName.toLowerCase();
  // Connected yet not set up means setup is parked on a context no ancestor provides. The DOM
  // looks intact, so without this the test fails later on an assertion that names no cause.
  if (host.isConnected && isComponent(host) && !isSetUp(host)) {
    throw new Error(
      `ref: <${tag}> is connected but its setup has not run. A component waits for every ` +
        "context it declares: provide it with provideContext() or render its provider around it.",
    );
  }

  const owned = `[data-ref="${tag}:${name}"]`;
  const all = host.querySelectorAll<HTMLElement>(`[data-ref="${name}"],${owned}`);

  return [...all].filter((el) => el.matches(owned) || belongsTo(el, host));
}

/**
 * Look up a ref the way the component itself does. Once the component has set up, that is the
 * element it resolved; before, it is the `data-ref` element by bare name or by the
 * `host-tag:name` form used to claim a ref across a nested custom element. A ref declared with a
 * selector only resolves once the host has set up.
 *
 * On a typed component the name must be one of its `r.one` refs and the element comes back
 * typed as the ref declares it. An explicit type argument opts out, for markup the test owns
 * rather than the component: `ref<HTMLElement>(host, "fixture")`.
 */
export function ref<H extends Element, K extends RefName<H, false>>(
  host: H,
  name: K,
): InferRef<RefsOf<H>[K]>;
export function ref<E extends Element = HTMLElement, H extends Element = Element>(
  host: H & Untyped<H>,
  name: string,
): E;
export function ref(host: Element, name: string): Element {
  const found = collect(host, name)[0];
  if (!found) throw new Error(refError(host, name));

  return found;
}

/**
 * The `r.many` counterpart of `ref`, in document order.
 *
 * Reaching for `querySelectorAll` instead silently crosses into nested custom elements and picks
 * up refs that belong to them. Throws when nothing matches, the way a list ref does at connect.
 */
export function refs<H extends Element, K extends RefName<H, true>>(
  host: H,
  name: K,
): InferRef<RefsOf<H>[K]>;
export function refs<E extends Element = HTMLElement, H extends Element = Element>(
  host: H & Untyped<H>,
  name: string,
): E[];
export function refs(host: Element, name: string): Element[] {
  const found = collect(host, name);
  if (found.length === 0) throw new Error(refError(host, name));

  return found;
}

function refError(host: Element, name: string): string {
  const message = `ref: no element with data-ref="${name}" inside <${host.tagName.toLowerCase()}>`;

  return isComponent(host) && !isSetUp(host)
    ? `${message}; a selector ref resolves once the host has set up`
    : message;
}

// Mirrors the runtime rule: a ref inside a nested custom element belongs to that element,
// not to this host, unless it is explicitly claimed with the `host-tag:` prefix.
function belongsTo(element: Element, host: Element): boolean {
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== host) {
    if (ancestor.tagName.includes("-")) return false;
    ancestor = ancestor.parentElement;
  }

  return true;
}

let tagCount = 0;

/**
 * A custom element name no other test has used, for a component defined inside a test.
 *
 * `customElements` cannot forget a definition, so a fixture component needs a fresh name every
 * time: a wrapper that runs an attachable behaviour in its setup, or a provider for a context.
 */
export function uniqueTag(prefix = "test"): string {
  tagCount += 1;

  return `x-${prefix}-${tagCount}`;
}

type AnyMethod = (...args: never[]) => unknown;

/** Keys whose stub value is a function, exposed as a recorded method rather than a property. */
type MethodKeys<T> = { [K in keyof T]-?: NonNullable<T[K]> extends AnyMethod ? K : never }[keyof T];
type ValueKeys<T> = Exclude<keyof T, MethodKeys<T>>;

export type StubbedElement<E extends Element, T extends Record<string, unknown>> = {
  /** The same element, typed as if it exposed the stubbed props and methods. */
  el: E & T;
  /** Current value of a stubbed property. */
  get<K extends ValueKeys<T>>(key: K): T[K];
  /** Every value assigned to a stubbed property, in order. */
  writes<K extends ValueKeys<T>>(key: K): T[K][];
  /** The arguments of every call to a stubbed method, in order. */
  calls<K extends MethodKeys<T>>(key: K): Parameters<Extract<T[K], AnyMethod>>[];
  /** Drop recorded writes and calls. Call after connect to ignore a component's initial effect. */
  reset(): void;
};

/**
 * Stand in for a peer custom element: expose the properties and methods it would, record what
 * the component writes and calls, and run whatever implementation the test supplies.
 *
 * Use instead of importing a real peer component: it keeps the test focused on one element
 * and removes any registration-order dependency between the two modules. To capture the
 * writes a setup makes on connect, build the host with `create` and stub before connecting.
 *
 * A function in `shape` becomes a method: the peer's mixin surface (`open()`, `close()`)
 * rather than its props. It is called with the element as `this`, and its return value is the
 * caller's, so a stub can drive the component back.
 */
export function stubElement<E extends Element, T extends Record<string, unknown>>(
  el: E,
  shape: T,
): StubbedElement<E, T> {
  const method = Object.keys(shape).find((key) => typeof shape[key] === "function");
  if (method && isComponent(el) && !isSetUp(el)) {
    throw new Error(
      `stubElement: <${el.localName}> has not set up yet, and its setup would replace the ` +
        `stubbed "${method}". Stub it once it has connected, or leave it unregistered.`,
    );
  }

  const values = { ...shape };
  const writes = new Map<keyof T, unknown[]>();
  const calls = new Map<keyof T, unknown[][]>();

  for (const key of Object.keys(shape) as (keyof T & string)[]) {
    const value = shape[key];

    if (typeof value === "function") {
      const recorded: unknown[][] = [];
      calls.set(key, recorded);
      Object.defineProperty(el, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: function (this: unknown, ...args: unknown[]) {
          recorded.push(args);
          return (value as (...a: unknown[]) => unknown).apply(this, args);
        },
      });
      continue;
    }

    writes.set(key, []);
    Object.defineProperty(el, key, {
      configurable: true,
      enumerable: true,
      get: () => values[key],
      set: (next: T[typeof key]) => {
        values[key] = next;
        writes.get(key)!.push(next);
      },
    });
  }

  return {
    el: el as E & T,
    get: (key) => values[key],
    writes<K extends ValueKeys<T>>(key: K): T[K][] {
      return (writes.get(key) ?? []) as T[K][];
    },
    calls<K extends MethodKeys<T>>(key: K): Parameters<Extract<T[K], AnyMethod>>[] {
      return (calls.get(key) ?? []) as Parameters<Extract<T[K], AnyMethod>>[];
    },
    reset: () => {
      for (const list of writes.values()) list.length = 0;
      for (const list of calls.values()) list.length = 0;
    },
  };
}
