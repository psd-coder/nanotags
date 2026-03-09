import { nanoid } from "nanoid";
import { define } from "nano-wc";
import { attachResizing } from "../../attachments/attachResizing";

declare global {
  interface HTMLElementTagNameMap {
    "x-collapsible-pane": InstanceType<typeof XCollapsiblePane>;
  }
}

const XCollapsiblePane = define("x-collapsible-pane")
  .withProps((p) => ({
    expanded: p.boolean(false),
    expandedSize: p.number(50),
    maxSize: p.number(95),
  }))
  .withRefs((r) => ({ header: r.one("header"), body: r.one("div") }))
  .setup((ctx) => {
    let lastHeightPx: number | null = null;
    const header = ctx.refs.header;
    const body = ctx.refs.body;

    const bodyId = nanoid();
    body.id = bodyId;
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");
    header.setAttribute("aria-controls", bodyId);

    function getHeaderHeight() {
      return header.getBoundingClientRect().height;
    }

    function toggle() {
      ctx.props.$expanded.set(!ctx.props.$expanded.get());
    }

    ctx.on(header, "click", toggle);
    ctx.on(header, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });

    ctx.effect(ctx.props.$expanded, (expanded) => {
      header.setAttribute("aria-expanded", String(expanded));
      if (expanded) {
        if (lastHeightPx !== null) {
          ctx.host.style.flexBasis = `${lastHeightPx}px`;
        } else {
          ctx.host.style.flexBasis = `${ctx.props.$expandedSize.get()}%`;
        }
      } else {
        ctx.host.style.flexBasis = `${getHeaderHeight()}px`;
      }

      ctx.emit(
        "toggle",
        new ToggleEvent("toggle", {
          newState: expanded ? "open" : "closed",
          oldState: expanded ? "closed" : "open",
        }),
      );
    });

    const minThreshold = 4;
    const maxSize = ctx.props.$maxSize.get();
    let startHeight = 0;
    let containerHeight = 0;
    let wasAtMin = false;

    attachResizing(ctx, {
      position: "before",
      element: ctx.host,
      direction: "vertical",
      onDragStart(info) {
        startHeight = info.elementSize;
        containerHeight = info.containerSize;
        wasAtMin = startHeight <= getHeaderHeight() + minThreshold;
      },
      onDrag(delta) {
        const minSize = getHeaderHeight() + minThreshold;
        const maxPx = (maxSize / 100) * containerHeight;
        const newHeight = Math.min(maxPx, Math.max(minSize, startHeight + delta));

        const isAtMin = newHeight <= minSize;
        if (!isAtMin) {
          ctx.host.style.flexBasis = `${newHeight}px`;
          lastHeightPx = newHeight;
        }

        if (isAtMin && !wasAtMin) {
          if (ctx.props.$expanded.get()) ctx.props.$expanded.set(false);
        } else if (!isAtMin && wasAtMin) {
          if (!ctx.props.$expanded.get()) ctx.props.$expanded.set(true);
        }
        wasAtMin = isAtMin;
      },
    });
  });
