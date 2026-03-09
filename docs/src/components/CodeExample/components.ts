import { define } from "nano-wc";
import { renderList } from "nano-wc/render";
import nanoWcUrl from "nano-wc?url";
import { atom, computed } from "nanostores";
import * as v from "valibot";
import { debouncedComputed } from "~/utils/debouncedComputed";
import { type LogLevel, fileEntrySchema } from "../LivePreview";
import styles from "./styles.module.css";

define("x-code-example")
  .withProps(({ number, json }) => ({
    files: json(v.array(fileEntrySchema), []),
    previewDelay: number(500),
  }))
  .withRefs(({ one }) => ({
    tabs: one("x-tabs"),
    editor: one("x-code-editor"),
    preview: one("x-live-preview"),
    logsPane: one("x-collapsible-pane"),
    logsClear: one("button"),
    logsContainer: one("div"),
    logsTemplate: one("template"),
    logsList: one("ul"),
  }))
  .setup((ctx) => {
    const { $files, $previewDelay } = ctx.props;
    const $debouncedFiles = debouncedComputed($files, $previewDelay);
    const $currentTab = atom<string | null>($files.get()[0]?.name ?? null);
    const $currentFileEntry = computed([$files, $currentTab], (files, currentTab) => {
      return files.find((entry) => entry.name === currentTab) ?? null;
    });
    const $currentFileEntryContent = computed(
      $currentFileEntry,
      (currentFileEntry) => currentFileEntry?.content ?? "",
    );
    const $logs = atom<{ level: LogLevel; message: string }[]>([]);

    function scrollLogsToBottom() {
      ctx.refs.logsContainer.scrollTop = ctx.refs.logsContainer.scrollHeight;
    }

    ctx.on(ctx.refs.preview, "log", (e) => {
      $logs.set([...$logs.get(), { level: e.detail.level, message: e.detail.args.join(" ") }]);
    });
    ctx.on(ctx.refs.logsPane, "toggle", (e) => {
      if (e.newState === "open") {
        requestAnimationFrame(() => scrollLogsToBottom());
      }
    });
    ctx.on(ctx.refs.logsClear, "click", (e) => {
      e.stopPropagation();
      $logs.set([]);
    });

    ctx.bind(ctx.refs.tabs, $currentTab);
    ctx.bind(ctx.refs.editor, {
      ...$currentFileEntryContent,
      set: (value: string) => {
        const currentTab = $currentTab.get();
        if (!currentTab) return;

        $files.set(
          $files.get().map((entry) => {
            if (entry.name !== currentTab) return entry;
            return { ...entry, content: value };
          }),
        );
      },
    });

    ctx.effect($currentTab, (currentTab) => {
      if (!currentTab) return;
      const entry = $files.get().find((e) => e.name === currentTab);
      if (!entry) return;
      ctx.refs.editor.value = entry.content;
      ctx.refs.editor.setAttribute("lang", entry.lang);
    });
    ctx.effect($debouncedFiles, (files) => {
      ctx.refs.preview.render(files, {
        imports: { "nano-wc": nanoWcUrl, valibot: "https://esm.sh/valibot@latest" },
      });
    });
    ctx.effect($logs, (logs) => {
      const scroll = ctx.refs.logsContainer;
      const isAtBottom = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 5;
      renderList(ctx.refs.logsList, {
        template: ctx.refs.logsTemplate,
        data: logs,
        getKey: (_item, i) => i,
        update: (el, logEntry) => {
          el.classList.add(styles[`logType_${logEntry.level}`]);
          ctx.getElement(el, "[data-level]").textContent = `[${logEntry.level}]: `;
          ctx.getElement(el, "[data-message]").textContent = logEntry.message;
        },
      });
      if (isAtBottom) scrollLogsToBottom();
    });
  });
