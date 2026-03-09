import { define, type TypedEvent } from "nano-wc";
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
    let blobUrl: string | undefined;

    function buildBlob(html: string) {
      cleanupBlobUrl();
      blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      return blobUrl;
    }

    function cleanupBlobUrl() {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = undefined;
      }
    }

    function render(files: readonly FileEntry[], importMapOverrides?: ImportMap) {
      cleanupBlobUrl();
      const html = buildHtml(files, importMapOverrides);

      ctx.refs.frame.src = buildBlob(html);
    }

    ctx.on(window, "message", (ev) => {
      const parsed = v.safeParse(logMessageSchema, ev.data);

      if (parsed.success) {
        ctx.emit("log", parsed.output);
      }
    });

    ctx.onCleanup(cleanupBlobUrl);

    return { render };
  });
