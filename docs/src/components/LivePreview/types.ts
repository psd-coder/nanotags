import * as v from "valibot";

export type ImportMap = {
  imports: Record<string, string>;
};

export const fileEntrySchema = v.object({
  name: v.string(),
  type: v.picklist(["html", "javascript", "css", "importmap"]),
  lang: v.picklist(["html", "javascript", "css"]),
  content: v.string(),
});

export type FileEntryType = "html" | "javascript" | "css" | "importmap";
export type FileEntryLang = "html" | "javascript" | "css";
export type FileEntry = v.InferOutput<typeof fileEntrySchema>;

export const logLevelSchema = v.picklist(["log", "warn", "error", "info", "debug"]);
export const logMessageSchema = v.object({
  type: v.literal("nano-wc-log"),
  level: logLevelSchema,
  args: v.array(v.string()),
});

export type LogLevel = v.InferOutput<typeof logLevelSchema>;
export type LogMessage = v.InferOutput<typeof logMessageSchema>;
