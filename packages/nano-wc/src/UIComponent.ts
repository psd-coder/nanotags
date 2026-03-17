import { effect, type StoreValue } from "nanostores";
import { invariant } from "./utils.ts";

import type {
  BindOptions,
  ComponentProps,
  InferRefs,
  Prettify,
  PropsSchema,
  ReactiveProps,
  WritableStore,
  RefsSchema,
  ReadableStore,
} from "./types";

export type ReservedKeys = keyof UIComponent<PropsSchema, RefsSchema>;

type StoreValues<Stores extends ReadableStore<any>[]> = {
  [Index in keyof Stores]: StoreValue<Stores[Index]>;
};

export type SetupContext<Props extends PropsSchema, Refs extends RefsSchema> = Omit<
  UIComponent<Props, Refs>,
  keyof HTMLElement
>;

export type SetupFn<Props extends PropsSchema, Refs extends RefsSchema> = (
  ctx: SetupContext<Props, Refs>,
) => Record<string, unknown> | void;

export type ComponentCtor<
  Name extends string,
  Props extends PropsSchema,
  Refs extends RefsSchema,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Mixin = {},
> = (new () => UIComponent<Props, Refs> & ComponentProps<Props> & Mixin) & {
  readonly elementName: Name;
};

export abstract class UIComponent<
  Props extends PropsSchema,
  Refs extends RefsSchema,
> extends HTMLElement {
  #cleanups: VoidFunction[] = [];

  abstract get refs(): Prettify<InferRefs<Refs>>;
  abstract get props(): Prettify<ReactiveProps<Props>>;
  abstract get host(): HTMLElement & ComponentProps<Props>;

  protected disconnectedCallback(): void {
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

  /** Registers a cleanup function to be called when the component is disconnected. */
  onCleanup(callback: VoidFunction): void {
    this.#cleanups.push(callback);
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
    if (nameOrEvent instanceof Event) return void this.dispatchEvent(nameOrEvent);
    this.dispatchEvent(
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
    const root = hasRoot ? (selectorOrRoot as DocumentFragment | Element) : this;
    const selector = (hasRoot ? maybeSelector : selectorOrRoot) as string;
    const element = root.querySelector<HTMLElementTagNameMap[E]>(selector);
    invariant(element, `${this.constructor.name}: missing ${selector} element`);
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
    const root = hasRoot ? (selectorOrRoot as DocumentFragment | Element) : this;
    const selector = (hasRoot ? maybeSelector : selectorOrRoot) as string;
    const elements = Array.from(root.querySelectorAll<HTMLElementTagNameMap[E]>(selector));
    invariant(elements.length > 0, `${this.constructor.name}: missing ${selector} elements`);
    return elements;
  }

  /**
   * Finds the nearest ancestor component matching `ctor.elementName` and returns it as the typed component.
   * Throws if no matching ancestor exists. Useful for child components to consume context from parent components without explicit prop passing or global state.
   */
  consume<T extends HTMLElement>(ctor: (new () => T) & { elementName: string }): T {
    const closest = this.closest(ctor.elementName) as T | null;
    invariant(
      closest,
      `${this.constructor.name} component: no ancestor found for consumed component ${ctor.elementName}`,
    );
    return closest;
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
   *
   * Native controls: auto-detects checkbox (`.checked`, `change`), number/range (`.valueAsNumber`, `input`),
   * text/textarea (`.value`, `input`), select (`.value`, `change`).
   *
   * Custom elements: any element with a `.value` property and `change` event works out of the box.
   * Pass `{ prop }` for one-way binding to any element property, or `{ prop, event }` for two-way.
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
