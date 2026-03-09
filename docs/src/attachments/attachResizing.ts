import type { SetupContext } from "nano-wc";
import { atom } from "nanostores";
import styles from "./styles.module.css";

type AttachResizingOptions = {
  position: "before" | "after";
  element: HTMLElement;
  direction: "horizontal" | "vertical";
  onDragStart?: (info: { startPos: number; elementSize: number; containerSize: number }) => void;
  onDrag?: (delta: number) => void;
  onDragEnd?: () => void;
};

function createHandle(direction: "horizontal" | "vertical"): HTMLElement {
  const handle = document.createElement("div");
  handle.className = styles.handle;
  handle.dataset["direction"] = direction;
  return handle;
}

export function attachResizing(
  ctx: SetupContext<{}, {}>,
  options: AttachResizingOptions,
): { handle: HTMLElement } {
  const { position, element, direction, onDragStart, onDrag, onDragEnd } = options;

  const handle = createHandle(direction);
  element.insertAdjacentElement(position === "before" ? "beforebegin" : "afterend", handle);

  const $drag = atom({ isDragging: false, startPos: 0 });

  function onMouseMove(ev: MouseEvent) {
    const { startPos } = $drag.get();
    const currentPos = direction === "vertical" ? ev.clientY : ev.clientX;
    const rawDelta = currentPos - startPos;
    const delta = position === "before" ? -rawDelta : rawDelta;
    onDrag?.(delta);
  }

  function onMouseUp() {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    $drag.set({ ...$drag.get(), isDragging: false });
    onDragEnd?.();
  }

  ctx.on(handle, "mousedown", (ev) => {
    ev.preventDefault();
    const isVertical = direction === "vertical";
    const startPos = isVertical ? ev.clientY : ev.clientX;

    $drag.set({ isDragging: true, startPos });

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    const elementRect = element.getBoundingClientRect();
    const containerRect = element.parentElement?.getBoundingClientRect();
    onDragStart?.({
      startPos,
      elementSize: isVertical ? elementRect.height : elementRect.width,
      containerSize: containerRect
        ? isVertical
          ? containerRect.height
          : containerRect.width
        : Infinity,
    });
  });

  ctx.effect($drag, ({ isDragging }) => {
    handle.dataset["dragging"] = String(isDragging);

    const parent = element.parentElement;
    if (!parent) return;
    for (const child of parent.children) {
      if (child !== handle && child instanceof HTMLElement) {
        child.style.pointerEvents = isDragging ? "none" : "";
      }
    }
  });

  ctx.onCleanup(() => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    handle.remove();
  });

  return { handle };
}
