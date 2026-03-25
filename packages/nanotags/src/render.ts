type RenderListOptions<T, E extends Element = Element> = {
  data: readonly T[];
  key: (item: T, index: number) => string | number;
  update: (el: E, item: T) => void;
};

const elementData = new WeakMap<Element, unknown>();
const elementKeys = new WeakMap<Element, string | number>();
export function renderList<T, E extends Element = Element>(
  container: Element,
  template: HTMLTemplateElement,
  options: RenderListOptions<T, E>,
): void {
  const { data, key: getKey, update } = options;

  // Collect existing elements by their keys
  const existingByKey = new Map<string | number, Element>();
  for (const child of Array.from(container.children)) {
    const key = elementKeys.get(child);
    if (key !== undefined) existingByKey.set(key, child);
  }

  // Remove elements that are no longer in the data
  const dataKeys = new Set<string | number>(data.map(getKey));
  for (const child of Array.from(container.children)) {
    const key = elementKeys.get(child);
    if (key === undefined || !dataKeys.has(key)) {
      child.remove();
      elementKeys.delete(child);
      elementData.delete(child);
    }
  }

  // Render new and existing elements in the correct order
  let prev: Element | null = null;
  for (let i = 0; i < data.length; i++) {
    const item = data[i]!;
    const key = getKey(item, i);
    let el = existingByKey.get(key);

    // If the element doesn't exist, clone it from the template
    if (!el) {
      const fragment = template.content.cloneNode(true) as DocumentFragment;
      el = fragment.firstElementChild!;
      elementKeys.set(el, key);
    }

    // Update the element if the data has changed
    if (elementData.get(el) !== item) {
      update(el as E, item);
      elementData.set(el, item);
    }

    // Position with minimum DOM moves: if el is already right after prev or first child when prev is null, skip; otherwise move it there.
    // Example: [A, B, C, D, E] → [C, D, B, E, A]
    //   i=0, C: expected=firstChild(A), C≠A → prepend C     → [C,A,B,D,E], prev=C
    //   i=1, D: expected=C.next(A),     D≠A → C.after(D)    → [C,D,A,B,E], prev=D
    //   i=2, B: expected=D.next(A),     B≠A → D.after(B)    → [C,D,B,A,E], prev=B
    //   i=3, E: expected=B.next(A),     E≠A → B.after(E)    → [C,D,B,E,A], prev=E
    //   i=4, A: expected=E.next(A),     A=A → skip,                         prev=A
    const expected: Element | null = prev ? prev.nextElementSibling : container.firstElementChild;
    if (el !== expected) {
      if (prev) {
        prev.after(el);
      } else {
        container.prepend(el);
      }
    }

    prev = el;
  }
}

type RenderOptions<T, E extends Element = Element> = {
  data?: T;
  update?: (el: E, item: T) => void;
};

const tplIds = new WeakMap<HTMLTemplateElement, number>();
const getId = (() => {
  let id = 0;
  return () => id++;
})();

export function render<T, E extends Element = Element>(
  container: Element,
  template: HTMLTemplateElement,
  options?: RenderOptions<T, E>,
): void {
  renderList(container, template, {
    data: [options?.data ?? (null as T)],
    key: () => {
      let id = tplIds.get(template);
      if (id === undefined) {
        id = getId();
        tplIds.set(template, id);
      }
      return id;
    },
    update: options?.update ?? (() => {}),
  });
}
