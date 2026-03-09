import { define } from "nano-wc";
import { attachResizing } from "../../attachments/attachResizing";
import { invariant } from "../../utils/invariant";

define("x-resizable-panes")
  .withProps((p) => ({
    direction: p.oneOf(["horizontal", "vertical"]),
    minSize: p.number(5),
    maxSize: p.number(95),
  }))
  .withRefs((r) => ({
    panes: r.many("div"),
  }))
  .setup((ctx) => {
    invariant(ctx.refs.panes.length === 2, "ResizablePanes support exactly 2 panes");

    const startPane = ctx.refs.panes[0]!;
    let startBasis = 0;
    let containerSize = 0;

    const { handle } = attachResizing(ctx, {
      position: "after",
      element: startPane,
      direction: ctx.props.$direction.get(),
      onDragStart(info) {
        startBasis = info.elementSize;
        containerSize = info.containerSize;
      },
      onDrag(delta) {
        const min = ctx.props.$minSize.get();
        const max = ctx.props.$maxSize.get();
        const pct = Math.min(max, Math.max(min, ((startBasis + delta) / containerSize) * 100));
        startPane.style.flexBasis = `${pct}%`;
      },
    });

    ctx.effect(ctx.props.$direction, (direction) => {
      handle.dataset["direction"] = direction;
    });
  });
