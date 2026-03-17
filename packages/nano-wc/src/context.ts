import { effect, type StoreValue } from "nanostores";
import { invariant } from "./utils.ts";

import type {
  BindOptions,
  ComponentProps,
  InferRefs,
  PropsSchema,
  ReactiveProps,
  WritableStore,
  RefsSchema,
  ReadableStore,
} from "./types.ts";

export type ReservedKeys = keyof HTMLElement | "props" | "refs";

type StoreValues<Stores extends ReadableStore<any>[]> = {
  [Index in keyof Stores]: StoreValue<Stores[Index]>;
};

export type SetupContext<Props extends PropsSchema, Refs extends RefsSchema> = Context<Props, Refs>;

export type SetupFn<Props extends PropsSchema, Refs extends RefsSchema> = (
  ctx: SetupContext<Props, Refs>,
) => Record<string, unknown> | void;

declare const __nano: unique symbol;
export type ComponentBrand = { readonly [__nano]: true };

export type ComponentCtor<
  Props extends PropsSchema,
  Refs extends RefsSchema,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Mixin = {},
> = (new () => HTMLElement &
  ComponentProps<Props> & { props: ReactiveProps<Props>; refs: InferRefs<Refs> } & Mixin) &
  ComponentBrand;

export class Context<Props extends PropsSchema, Refs extends RefsSchema> {
  host: HTMLElement & { props: ReactiveProps<Props>; refs: InferRefs<Refs> };
  /** Registers a cleanup function to be called when the component is disconnected. */
  onCleanup: (callback: VoidFunction) => void;

  constructor(
    host: HTMLElement & { props: ReactiveProps<Props>; refs: InferRefs<Refs> },
    onCleanup: (callback: VoidFunction) => void,
  ) {
    this.host = host;
    this.onCleanup = onCleanup;
  }

  get props(): ReactiveProps<Props> {
    return this.host.props;
  }

  get refs(): InferRefs<Refs> {
    return this.host.refs;
  }

  /**
   * Adds an event listener to one or more elements, Document, or Window and registers automatic cleanup on disconnect.
   */
  on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement[],
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (this: Document, ev: DocumentEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on(
    target: HTMLElement | HTMLElement[] | Document | Window,
    type: string,
    listener: (this: HTMLElement | Document | Window, ev: Event) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on(
    target: HTMLElement | HTMLElement[] | Document | Window,
    type: string,
    listener: (this: HTMLElement | Document | Window, ev: Event) => any,
    options?: boolean | AddEventListenerOptions,
  ): void {
    const targets = Array.isArray(target) ? target : [target];
    for (const t of targets) {
      t.addEventListener(type, listener as EventListener, options);
      this.onCleanup(() => t.removeEventListener(type, listener as EventListener, options));
    }
  }

  /** Dispatches an existing Event, or creates and dispatches a bubbling CustomEvent. */
  emit(event: Event): void;
  emit<D>(name: string, detail?: D, options?: Omit<CustomEventInit<D>, "detail">): void;
  emit(nameOrEvent: string | Event, detail?: unknown, options?: CustomEventInit): void {
    if (nameOrEvent instanceof Event) return void this.host.dispatchEvent(nameOrEvent);
    this.host.dispatchEvent(
      new CustomEvent(nameOrEvent, {
        bubbles: true,
        composed: true,
        ...options,
        detail,
      }),
    );
  }

  /** Queries a single required element by CSS selector. Throws if not found. */
  getElement<E extends keyof HTMLElementTagNameMap>(selector: E | string): HTMLElementTagNameMap[E];
  getElement<E extends keyof HTMLElementTagNameMap>(
    root: DocumentFragment | Element,
    selector: E | string,
  ): HTMLElementTagNameMap[E];
  getElement<E extends keyof HTMLElementTagNameMap>(
    selectorOrRoot: E | string | DocumentFragment | Element,
    maybeSelector?: E | string,
  ): HTMLElementTagNameMap[E] {
    const hasRoot = maybeSelector !== undefined;
    const root = hasRoot ? (selectorOrRoot as DocumentFragment | Element) : this.host;
    const selector = (hasRoot ? maybeSelector : selectorOrRoot) as string;
    const element = root.querySelector<HTMLElementTagNameMap[E]>(selector);
    invariant(element, `${this.host.localName}: missing ${selector} element`);
    return element;
  }

  /** Queries all matching elements by CSS selector. Throws if none found. */
  getElements<E extends keyof HTMLElementTagNameMap>(
    selector: E | string,
  ): HTMLElementTagNameMap[E][];
  getElements<E extends keyof HTMLElementTagNameMap>(
    root: DocumentFragment | Element,
    selector: E | string,
  ): HTMLElementTagNameMap[E][];
  getElements<E extends keyof HTMLElementTagNameMap>(
    selectorOrRoot: E | string | DocumentFragment | Element,
    maybeSelector?: E | string,
  ): HTMLElementTagNameMap[E][] {
    const hasRoot = maybeSelector !== undefined;
    const root = hasRoot ? (selectorOrRoot as DocumentFragment | Element) : this.host;
    const selector = (hasRoot ? maybeSelector : selectorOrRoot) as string;
    const elements = Array.from(root.querySelectorAll<HTMLElementTagNameMap[E]>(selector));
    invariant(elements.length > 0, `${this.host.localName}: missing ${selector} elements`);
    return elements;
  }

  /**
   * Finds the nearest ancestor component and returns it as the typed component.
   * Throws if no matching ancestor exists.
   */
  consume<T extends HTMLElement>(ctor: (new () => T) & ComponentBrand): T {
    const name = customElements.getName(ctor);
    const el = name ? this.host.closest<T>(name) : null;
    invariant(el, `${this.host.localName}: no ancestor <${name}> found`);
    return el;
  }

  /**
   * Subscribes `callback` to one store or an array of stores and registers automatic cleanup
   * on disconnect. Immediately invokes the callback with the current value(s).
   */
  effect<T>(store: ReadableStore<T>, callback: (value: T) => void): void;
  effect<Stores extends ReadableStore<any>[]>(
    stores: [...Stores],
    callback: (...values: StoreValues<Stores>) => void,
  ): void;
  effect(storeOrStores: any, callback: any): void {
    this.onCleanup(effect(storeOrStores, callback));
  }

  /**
   * Binds a writable store to a DOM element property.
   * Store is the source of truth — element is set from the store on bind.
   *
   * No options → full auto-detect (native controls + custom `.value`/`change`), two-way.
   * Options present → `prop` defaults to auto-detected, `event` undefined = one-way.
   */
  bind(
    store: WritableStore<any>,
    control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    opts?: BindOptions,
  ): void;
  bind<V>(
    store: WritableStore<V>,
    control: HTMLElement & { value: NoInfer<V> },
    opts?: BindOptions,
  ): void;
  bind(store: WritableStore<unknown>, control: HTMLElement, opts: BindOptions): void;
  bind(store: WritableStore<unknown>, control: HTMLElement, opts?: BindOptions): void {
    const input = control instanceof HTMLInputElement ? control : undefined;
    let propEvent: [string, string] = ["value", "change"];

    if (input?.type === "checkbox") {
      propEvent = ["checked", "change"];
    } else if (input?.type === "number" || input?.type === "range") {
      propEvent = ["valueAsNumber", "input"];
    } else if (input || control instanceof HTMLTextAreaElement) {
      propEvent = ["value", "input"];
    }

    const prop = opts?.prop ?? propEvent[0];
    const event = opts ? opts?.event : propEvent[1];
    const el = control as any;
    invariant(prop in control, `has no .${prop} property`);

    el[prop] = store.get();
    event && this.on(control, event, () => store.set(el[prop]));
    this.effect(store, (value) => {
      el[prop] = value;
    });
  }
}
