import { define, type TypedEvent } from "nano-wc";
import { atom, computed, onMount } from "nanostores";
import * as v from "valibot";
import { type FileEntry, type ImportMap, type LogMessage, logMessageSchema } from "./types";
import { buildHtml } from "./utils";

declare global {
  interface HTMLElementTagNameMap {
    "x-live-preview": InstanceType<typeof XLivePreview>;
  }

  interface HTMLElementEventMap {
    log: TypedEvent<InstanceType<typeof XLivePreview>, LogMessage>;
  }
}

const XLivePreview = define("x-live-preview")
  .withRefs(({ one }) => ({
    frame: one("iframe"),
  }))
  .setup((ctx) => {
    const $data = atom<{ files: readonly FileEntry[]; importOverrides?: ImportMap }>({ files: [] });
    const $html = computed($data, ({ files, importOverrides }) =>
      buildHtml(files, importOverrides),
    );
    const $blobUrl = computed($html, (html) =>
      URL.createObjectURL(new Blob([html], { type: "text/html" })),
    );

    // Cleanup old objectUrl after each changed, or on unmount
    onMount($blobUrl, () => {
      return $blobUrl.listen((_value, oldValue) => {
        return URL.revokeObjectURL(oldValue);
      });
    });

    ctx.on(window, "message", (ev) => {
      const parsed = v.safeParse(logMessageSchema, ev.data);
      if (parsed.success) {
        ctx.emit("log", parsed.output);
      }
    });
    ctx.effect($blobUrl, (blobUrl) => {
      ctx.refs.frame.src = blobUrl;
    });

    return { render: $data.set };
  });
