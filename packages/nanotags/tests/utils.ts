export function createHostWith(html: string): HTMLElement;
export function createHostWith(tag: string, html: string): HTMLElement;
export function createHostWith(tagOrHtml: string, maybeHtml?: string): HTMLElement {
  const tag = maybeHtml !== undefined ? tagOrHtml : "div";
  const html = maybeHtml ?? tagOrHtml;
  const el = document.createElement(tag);
  el.innerHTML = html;
  return el;
}
