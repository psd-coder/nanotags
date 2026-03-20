import type { TypedEvent } from "./types";

type ContextLike = {
  readonly host: HTMLElement;
  readonly onCleanup: (cb: VoidFunction) => void;
};
type ContextRequestEvent<V> = TypedEvent<
  HTMLElement,
  { key: symbol; callback: (value: V) => void }
>;
type ContextProviderEvent = TypedEvent<HTMLElement, { key: symbol }>;

declare global {
  interface DocumentEventMap {
    "context-provider": ContextProviderEvent;
  }
  interface HTMLElementEventMap {
    "context-request": ContextRequestEvent<any>;
  }
}

export type ContextKey<T> = {
  provide(ctx: ContextLike, value: T): void;
  consume(ctx: ContextLike, callback: (value: T) => void): void;
};

type PendingEntry = {
  element: HTMLElement;
  key: symbol;
  callback: (value: any) => void;
};

let pending: PendingEntry[] | undefined;

function ensureDocumentHandler(): void {
  if (pending) return;
  pending = [];
  document.addEventListener("context-provider", (e: ContextProviderEvent) => {
    const { key } = e.detail;
    const remaining: PendingEntry[] = [];
    for (const entry of pending!) {
      if (
        entry.key !== e.detail.key ||
        !e.target.contains(entry.element) ||
        !entry.element.isConnected
      ) {
        remaining.push(entry);
        continue;
      }
      let resolved = false;
      entry.element.dispatchEvent(
        new CustomEvent("context-request", {
          bubbles: true,
          composed: true,
          detail: {
            key,
            callback: (value: unknown) => {
              resolved = true;
              entry.callback(value);
            },
          },
        }),
      );
      if (!resolved) remaining.push(entry);
    }
    pending = remaining;
  });
}

function registerPending<T>(element: HTMLElement, key: symbol, callback: (value: T) => void): void {
  ensureDocumentHandler();
  pending!.push({ element, key, callback });
}

function unregisterPending(element: HTMLElement, key: symbol): void {
  if (!pending) return;
  pending = pending.filter((e) => !(e.element === element && e.key === key));
}

export function createContext<T>(name?: string): ContextKey<T> {
  const key = Symbol(name);

  return {
    provide(ctx, value) {
      function handler(e: ContextRequestEvent<T>) {
        if (e.detail.key !== key) return;
        e.stopPropagation();
        e.detail.callback(value);
      }
      ctx.host.addEventListener("context-request", handler);
      ctx.onCleanup(() => ctx.host.removeEventListener("context-request", handler));

      ctx.host.dispatchEvent(
        new CustomEvent("context-provider", {
          bubbles: true,
          composed: true,
          detail: { key },
        }),
      );
    },

    consume(ctx, callback) {
      let resolved = false;
      const wrappedCallback = (value: T) => {
        resolved = true;
        callback(value);
      };

      ctx.host.dispatchEvent(
        new CustomEvent("context-request", {
          bubbles: true,
          composed: true,
          detail: { key, callback: wrappedCallback },
        }),
      );

      if (!resolved) {
        registerPending(ctx.host, key, wrappedCallback);
        ctx.onCleanup(() => unregisterPending(ctx.host, key));
        queueMicrotask(() => {
          if (!resolved) {
            console.warn(
              `${ctx.host.localName}: no provider found for context "${name ?? String(key)}"`,
            );
          }
        });
      }
    },
  };
}
