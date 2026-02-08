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
  OpenTabMessageSchema,
]);

// -- Inferred types --

export type TabInfo = z.infer<typeof TabInfoSchema>;
export type TabsMessage = z.infer<typeof TabsMessageSchema>;
export type MemoMessage = z.infer<typeof MemoMessageSchema>;
export type OpenTabMessage = z.infer<typeof OpenTabMessageSchema>;
export type DropboxMessage = z.infer<typeof DropboxMessageSchema>;
