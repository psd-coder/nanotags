import { effect, type ReadableAtom, type StoreValue, type WritableAtom } from "nanostores";
import { invariant } from "./utils";

import type {
  BindOptions,
  ComponentProps,
  ContextsSchema,
  InferContexts,
  InferRefs,
  PropsSchema,
  ReactiveProps,
  RefsSchema,
} from "./types";

export const __ctx: unique symbol = Symbol("ctx");

export type ReservedKeys = keyof HTMLElement;

type StoreValues<Stores extends ReadableAtom<any>[]> = {
  [Index in keyof Stores]: StoreValue<Stores[Index]>;
};

export type SetupContext<
  Props extends PropsSchema,
  Refs extends RefsSchema,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Contexts extends ContextsSchema = {},
> = Context<Props, Refs, Contexts>;

export type SetupFn<
  Props extends PropsSchema,
  Refs extends RefsSchema,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Contexts extends ContextsSchema = {},
> = (ctx: SetupContext<Props, Refs, Contexts>) => Record<string, unknown> | void;

declare const __nano: unique symbol;
export type ComponentBrand = { readonly [__nano]: true };

export type ContextOptions<
  Props extends PropsSchema,
  Refs extends RefsSchema,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Contexts extends ContextsSchema = {},
> = {
  host: HTMLElement;
  props: ReactiveProps<Props>;
  refs: InferRefs<Refs>;
  onCleanup: (callback: VoidFunction) => void;
  contexts: InferContexts<Contexts>;
};

export type ComponentCtor<
  Props extends PropsSchema,
  Refs extends RefsSchema,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Mixin = {},
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Contexts extends ContextsSchema = {},
> = (new () => HTMLElement &
  ComponentProps<Props> & { readonly [__ctx]: Context<Props, Refs, Contexts> } & Mixin) &
  ComponentBrand;

export class Context<
  Props extends PropsSchema,
  Refs extends RefsSchema,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Contexts extends ContextsSchema = {},
> {
  readonly host: HTMLElement;
  /** Reactive property stores of the component. */
  readonly props: ReactiveProps<Props>;
  /** References to elements within the component. */
  readonly refs: InferRefs<Refs>;
  /** Resolved context values declared via withContexts. */
  readonly contexts: InferContexts<Contexts>;
  /** Registers a cleanup function to be called when the component is disconnected. */
  readonly onCleanup: (callback: VoidFunction) => void;

  constructor({ host, onCleanup, props, refs, contexts }: ContextOptions<Props, Refs, Contexts>) {
    this.host = host;
    this.onCleanup = onCleanup;
    this.props = props;
    this.refs = refs;
    this.contexts = contexts;
  }

  /**
   * Adds an event listener to one or more elements, Document, or Window and registers automatic cleanup on disconnect.
   */
  on<T extends HTMLElement, K extends keyof HTMLElementEventMap>(
    target: T,
    type: K,
    listener: (this: T, ev: HTMLElementEventMap[K] & { currentTarget: T }) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on<T extends HTMLElement, K extends keyof HTMLElementEventMap>(
    target: T[],
    type: K,
    listener: (this: T, ev: HTMLElementEventMap[K] & { currentTarget: T }) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (this: Document, ev: DocumentEventMap[K] & { currentTarget: Document }) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (this: Window, ev: WindowEventMap[K] & { currentTarget: Window }) => any,
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
    return this.getElements<E>(selectorOrRoot as any, maybeSelector as any)[0]!;
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
    invariant(elements.length > 0, `${this.host.localName}: missing ${selector}`);
    return elements;
  }

  /**
   * Subscribes `callback` to one store or an array of stores and registers automatic cleanup
   * on disconnect. Immediately invokes the callback with the current value(s).
   */
  effect<T>(store: ReadableAtom<T>, callback: (value: T) => void): void;
  effect<Stores extends ReadableAtom<any>[]>(
    stores: [...Stores],
    callback: (...values: StoreValues<Stores>) => void,
  ): void;
  effect(storeOrStores: any, callback: any): void {
    this.onCleanup(effect(storeOrStores, callback));
  }

  /**
   * Binds a writable atom to a DOM element property.
   * Store is the source of truth — element is set from the store on bind.
   *
   * No options → full auto-detect (native controls + custom `.value`/`change`), two-way.
   * Options present → `prop` defaults to auto-detected, `event` undefined = one-way.
   */
  bind(
    store: WritableAtom<any>,
    control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    opts?: BindOptions,
  ): void;
  bind<V>(
    store: WritableAtom<V>,
    control: HTMLElement & { value: NoInfer<V> },
    opts?: BindOptions,
  ): void;
  bind(store: WritableAtom<unknown>, control: HTMLElement, opts: BindOptions): void;
  bind(store: WritableAtom<unknown>, control: HTMLElement, opts?: BindOptions): void {
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

    event && this.on(control, event, () => store.set(el[prop]));
    this.effect(store, (value) => {
      el[prop] = value;
    });
  }
}
