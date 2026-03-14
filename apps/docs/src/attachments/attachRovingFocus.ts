import type { SetupContext } from "nano-wc";

type RovingFocusOptions = {
  orientation?: "horizontal" | "vertical" | "both";
  wrap?: boolean;
  homeEnd?: boolean;
  onActivate?: (item: HTMLElement, index: number) => void;
};

export function attachRovingFocus(
  ctx: SetupContext<{}, {}>,
  items: () => HTMLElement[],
  options?: RovingFocusOptions,
): {
  setActive: (index: number) => void;
  getActive: () => number;
} {
  const orientation = options?.orientation ?? "horizontal";
  const wrap = options?.wrap ?? true;
  const homeEnd = options?.homeEnd ?? true;
  const onActivate = options?.onActivate;

  let activeIndex = 0;

  const nextKeys =
    orientation === "vertical"
      ? ["ArrowDown"]
      : orientation === "both"
        ? ["ArrowRight", "ArrowDown"]
        : ["ArrowRight"];

  const prevKeys =
    orientation === "vertical"
      ? ["ArrowUp"]
      : orientation === "both"
        ? ["ArrowLeft", "ArrowUp"]
        : ["ArrowLeft"];

  function updateTabindices(list: HTMLElement[], index: number) {
    for (let i = 0; i < list.length; i++) {
      list[i]?.setAttribute("tabindex", i === index ? "0" : "-1");
    }
  }

  function activate(index: number) {
    const list = items();
    const item = list[index];
    if (!item) return;

    activeIndex = index;
    updateTabindices(list, index);
    item.focus();
    onActivate?.(item, index);
  }

  function move(delta: number) {
    const list = items();
    if (list.length === 0) return;

    let next = activeIndex + delta;
    if (wrap) {
      next = ((next % list.length) + list.length) % list.length;
    } else {
      next = Math.max(0, Math.min(next, list.length - 1));
    }
    activate(next);
  }

  ctx.on(ctx.host, "keydown", (e) => {
    const key = (e as KeyboardEvent).key;
    let handled = false;

    if (nextKeys.includes(key)) {
      move(1);
      handled = true;
    } else if (prevKeys.includes(key)) {
      move(-1);
      handled = true;
    } else if (homeEnd && key === "Home") {
      activate(0);
      handled = true;
    } else if (homeEnd && key === "End") {
      activate(items().length - 1);
      handled = true;
    }

    if (handled) {
      e.preventDefault();
    }
  });

  ctx.on(ctx.host, "focusin", (e) => {
    const target = e.target as HTMLElement;
    const list = items();
    const index = list.indexOf(target);
    if (index !== -1 && index !== activeIndex) {
      activeIndex = index;
      updateTabindices(list, index);
      onActivate?.(target, index);
    }
  });

  return {
    setActive(index: number) {
      const list = items();
      if (index < 0 || index >= list.length) return;
      activeIndex = index;
      updateTabindices(list, index);
    },
    getActive() {
      return activeIndex;
    },
  };
}
