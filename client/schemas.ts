import { z } from "zod";

// -- Clerk → Box messages --

export const TabInfoSchema = z.object({
  id: z.number(),
  windowId: z.number(),
  url: z.string(),
  title: z.string(),
  active: z.boolean(),
  pinned: z.boolean(),
});

export const TabsMessageSchema = z.object({
  type: z.literal("tabs"),
  tabs: z.array(TabInfoSchema),
});

export const MemoMessageSchema = z.object({
  type: z.literal("memo"),
  text: z.string(),
  url: z.string().optional(),
  context: z
    .object({
      url: z.string().optional(),
      title: z.string().optional(),
      selectedText: z.string().optional(),
    })
    .optional(),
  timestamp: z.string().optional(),
});

export const SaveToBriefMessageSchema = z.object({
  type: z.literal("save-to-brief"),
  url: z.string(),
  title: z.string(),
  timestamp: z.string().optional(),
});

export const SavePageMessageSchema = z.object({
  type: z.literal("save-page"),
  intent: z.enum(["save", "do"]),
  url: z.string(),
  title: z.string(),
  siteName: z.string().optional(),
  byline: z.string().optional(),
  excerpt: z.string().optional(),
  markdown: z.string(),
  frozenHtml: z.string().optional(),
  selectedText: z.string().optional(),
  timestamp: z.string().optional(),
});

// -- Box → Clerk messages --

export const OpenTabMessageSchema = z.object({
  type: z.literal("open-tab"),
  url: z.string(),
  title: z.string(),
  message: z.string(),
});

// -- Union of all message types --

export const DropboxMessageSchema = z.discriminatedUnion("type", [
  TabsMessageSchema,
  MemoMessageSchema,
  SaveToBriefMessageSchema,
  SavePageMessageSchema,
  OpenTabMessageSchema,
]);

// -- Capture schemas --

export const CaptureFileSchema = z.object({
  name: z.string(),
  type: z.string(),
  startedAt: z.string(),
  size: z.number(),
  source: z.string(),
});

export const CaptureManifestSchema = z.object({
  sessionId: z.string(),
  channelId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  files: z.array(CaptureFileSchema),
});

export const CaptureSessionSummarySchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  status: z.string(),
  fileCount: z.number(),
  lastActivityAt: z.string().nullable(),
});

// -- Inferred types --

export type TabInfo = z.infer<typeof TabInfoSchema>;
export type TabsMessage = z.infer<typeof TabsMessageSchema>;
export type MemoMessage = z.infer<typeof MemoMessageSchema>;
export type SaveToBriefMessage = z.infer<typeof SaveToBriefMessageSchema>;
export type SavePageMessage = z.infer<typeof SavePageMessageSchema>;
export type OpenTabMessage = z.infer<typeof OpenTabMessageSchema>;
export type DropboxMessage = z.infer<typeof DropboxMessageSchema>;

export type CaptureFile = z.infer<typeof CaptureFileSchema>;
export type CaptureManifest = z.infer<typeof CaptureManifestSchema>;
export type CaptureSessionSummary = z.infer<typeof CaptureSessionSummarySchema>;
