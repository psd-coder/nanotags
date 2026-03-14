let counter = 0;

export function uniqueTag(prefix = "test"): string {
  return `x-${prefix}-${++counter}`;
}

export function mount<R extends HTMLElement = HTMLElement>(html: string): R {
  // Parse in disconnected wrapper so children exist before connectedCallback fires
  document.body.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const el = wrapper.firstElementChild!;
  document.body.appendChild(el);
  return el as R;
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
