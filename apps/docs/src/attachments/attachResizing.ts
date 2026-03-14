import type { SetupContext } from "nano-wc";
import { atom } from "nanostores";
import styles from "./styles.module.css";

type AttachResizingOptions = {
  position: "before" | "after";
  element: HTMLElement;
  direction: "horizontal" | "vertical";
  label?: string;
  minValue?: number;
  maxValue?: number;
  step?: number;
  initialValue?: number;
  onDragStart?: (info: { startPos: number; elementSize: number; containerSize: number }) => void;
  onDrag?: (delta: number) => void;
  onDragEnd?: () => void;
  onKeyResize?: (value: number) => void;
};

function createHandle(direction: "horizontal" | "vertical"): HTMLElement {
  const handle = document.createElement("div");
  handle.className = styles.handle;
  handle.dataset["direction"] = direction;
  handle.setAttribute("role", "separator");
  handle.setAttribute("tabindex", "0");
  return handle;
}

export function attachResizing(
  ctx: SetupContext<{}, {}>,
  options: AttachResizingOptions,
): { handle: HTMLElement; setAriaValue: (value: number) => void } {
  const {
    position,
    element,
    direction,
    label,
    minValue = 0,
    maxValue = 100,
    step = 1,
    initialValue = 50,
    onDragStart,
    onDrag,
    onDragEnd,
    onKeyResize,
  } = options;

  const handle = createHandle(direction);
  handle.setAttribute("aria-valuemin", String(minValue));
  handle.setAttribute("aria-valuemax", String(maxValue));
  handle.setAttribute("aria-valuenow", String(initialValue));
  if (label) {
    handle.setAttribute("aria-label", label);
  }

  element.insertAdjacentElement(position === "before" ? "beforebegin" : "afterend", handle);

  const $drag = atom({ isDragging: false, startPos: 0 });
  let valueBeforeCollapse: number | null = null;

  function setAriaValue(value: number) {
    handle.setAttribute("aria-valuenow", String(Math.round(value)));
  }

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

  ctx.on(handle, "keydown", (ev) => {
    const current = Number(handle.getAttribute("aria-valuenow"));
    let next: number | null = null;

    const isHorizontal = direction === "horizontal";
    const invert = position === "before";
    const decreaseKey = isHorizontal
      ? invert
        ? "ArrowRight"
        : "ArrowLeft"
      : invert
        ? "ArrowDown"
        : "ArrowUp";
    const increaseKey = isHorizontal
      ? invert
        ? "ArrowLeft"
        : "ArrowRight"
      : invert
        ? "ArrowUp"
        : "ArrowDown";

    switch (ev.key) {
      case decreaseKey:
        next = Math.max(minValue, current - step);
        break;
      case increaseKey:
        next = Math.min(maxValue, current + step);
        break;
      case "Home":
        next = invert ? maxValue : minValue;
        break;
      case "End":
        next = invert ? minValue : maxValue;
        break;
      case "Enter": {
        if (current > minValue) {
          valueBeforeCollapse = current;
          next = minValue;
        } else if (valueBeforeCollapse !== null) {
          next = valueBeforeCollapse;
          valueBeforeCollapse = null;
        }
        break;
      }
      default:
        return;
    }

    ev.preventDefault();
    if (next !== null && next !== current) {
      setAriaValue(next);
      onKeyResize?.(next);
    }
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

  return { handle, setAriaValue };
}
