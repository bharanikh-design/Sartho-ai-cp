import { z } from "zod";

export const jobInputSchema = z.object({
  title: z.string().trim().min(2).max(240),
  employer: z.string().trim().max(240).optional().default(""),
  location: z.string().trim().max(240).optional().default(""),
  sourceUrl: z.union([z.literal(""), z.string().url().startsWith("https://").max(2000)]).optional().default(""),
  description: z.string().trim().min(120).max(80_000),
});
