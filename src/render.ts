type RenderListOptions<T> = {
  template: HTMLTemplateElement;
  data: readonly T[];
  getKey: (item: T, index: number) => string | number;
  update: (el: Element, item: T) => void;
};

type RenderOptions<T> = {
  template: HTMLTemplateElement;
  data: T | null;
  update: (el: Element, item: T) => void;
};

const managedElements = new WeakSet<Element>();
const elementKeys = new WeakMap<Element, string | number>();
const elementData = new WeakMap<Element, unknown>();

export function renderList<T>(container: Element, options: RenderListOptions<T>): void {
  const { template, data, getKey, update } = options;

  const existingByKey = new Map<string | number, Element>();
  for (const child of Array.from(container.children)) {
    if (!managedElements.has(child)) continue;
    const key = elementKeys.get(child);
    if (key !== undefined) existingByKey.set(key, child);
  }

  const newKeys = new Set<string | number>();
  for (let i = 0; i < data.length; i++) {
    newKeys.add(getKey(data[i]!, i));
  }

  for (const [key, el] of existingByKey) {
    if (!newKeys.has(key)) {
      el.remove();
      managedElements.delete(el);
      elementKeys.delete(el);
      elementData.delete(el);
    }
  }

  let prevManaged: Element | null = null;
  for (let i = 0; i < data.length; i++) {
    const item = data[i]!;
    const key = getKey(item, i);
    let el = existingByKey.get(key);

    if (!el) {
      const fragment = template.content.cloneNode(true) as DocumentFragment;
      el = fragment.firstElementChild!;
      managedElements.add(el);
      elementKeys.set(el, key);
    }

    if (elementData.get(el) !== item) {
      update(el, item);
      elementData.set(el, item);
    }

    const expectedAfter: Element | null = prevManaged
      ? prevManaged.nextElementSibling
      : container.firstElementChild;

    if (el !== expectedAfter) {
      if (prevManaged) {
        prevManaged.after(el);
      } else {
        container.prepend(el);
      }
    }

    prevManaged = el;
  }
}

export function render<T>(container: Element, options: RenderOptions<T>): void {
  const { template, data, update } = options;
  renderList(container, {
    template,
    data: data === null ? [] : [data],
    getKey: () => 0,
    update,
  });
}
