import { z } from "zod";

export const directionSchema = z.object({
  headline: z.string().trim().max(240),
  summary: z.string().trim().max(4000),
  location: z.string().trim().max(160),
  workAuthorisation: z.string().trim().max(1000),
  strengths: z.array(z.string().trim().min(1).max(120)).max(30),
  lanes: z.array(z.object({ id: z.string(), name: z.string().trim().min(1).max(180), weight: z.number().int().min(0).max(100), active: z.boolean() })).max(20),
}).superRefine((value, context) => {
  const names = value.lanes.map((lane) => lane.name.toLocaleLowerCase());
  if (new Set(names).size !== names.length) {
    context.addIssue({ code: "custom", path: ["lanes"], message: "Target profile names must be unique." });
  }
});
