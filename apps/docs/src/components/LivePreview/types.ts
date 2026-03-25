import * as v from "valibot";

export const importMapSchema = v.object({
  imports: v.optional(v.record(v.string(), v.string())),
});

export type ImportMap = v.InferOutput<typeof importMapSchema>;

export const fileEntrySchema = v.object({
  name: v.string(),
  type: v.picklist(["html", "javascript", "css", "importmap"]),
  lang: v.picklist(["html", "javascript", "css"]),
  content: v.string(),
});

export type FileEntry = v.InferOutput<typeof fileEntrySchema>;
export type FileEntryType = FileEntry["type"];
export type FileEntryLang = FileEntry["lang"];

export const logLevelSchema = v.picklist(["log", "warn", "error", "info", "debug"]);
export const logMessageSchema = v.object({
  type: v.literal("nanotags-log"),
  level: logLevelSchema,
  args: v.array(v.string()),
});

export type LogLevel = v.InferOutput<typeof logLevelSchema>;
export type LogMessage = v.InferOutput<typeof logMessageSchema>;
