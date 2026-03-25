import type { WritableAtom } from "nanostores";
import { define } from "nanotags";

type TabsElement = HTMLElement & { value: string | null };

export function defineCodePanels<T extends string>(tag: string, $store: WritableAtom<T>) {
  define(tag)
    .withRefs((r) => ({
      tabs: r.one<TabsElement>("x-tabs"),
      panels: r.many<HTMLDivElement>("div[data-value]"),
    }))
    .setup((ctx) => {
      ctx.on(ctx.refs.tabs, "change", () => {
        $store.set(ctx.refs.tabs.value as T);
      });

      ctx.effect($store, (value) => {
        ctx.refs.tabs.setAttribute("value", value);
        ctx.refs.panels.forEach((panel) => {
          panel.hidden = panel.dataset.value !== value;
        });
      });
    });
}
