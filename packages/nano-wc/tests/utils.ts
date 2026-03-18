let counter = 0;

export function uniqueTag(prefix = "test"): string {
  return `x-${prefix}-${++counter}`;
}

export function mount<T extends HTMLElement>(ctor: new () => T): T;
export function mount<R extends HTMLElement = HTMLElement>(html: string): R;
export function mount(ctorOrHtml: string | (new () => HTMLElement)) {
  const html =
    typeof ctorOrHtml === "string"
      ? ctorOrHtml
      : `<${customElements.getName(ctorOrHtml)!}></${customElements.getName(ctorOrHtml)!}>`;
  // Parse in disconnected wrapper so children exist before connectedCallback fires
  document.body.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const el = wrapper.firstElementChild!;
  document.body.append(el);
  return el;
}

export function createHostWith(html: string): HTMLElement;
export function createHostWith(tag: string, html: string): HTMLElement;
export function createHostWith(tagOrHtml: string, maybeHtml?: string): HTMLElement {
  const tag = maybeHtml !== undefined ? tagOrHtml : "div";
  const html = maybeHtml ?? tagOrHtml;
  const el = document.createElement(tag);
  el.innerHTML = html;
  return el;
}

export function cleanup(): void {
  document.body.innerHTML = "";
}
