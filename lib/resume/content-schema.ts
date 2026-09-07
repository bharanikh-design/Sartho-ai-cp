import { z } from "zod";
import { DEFAULT_TEMPLATE, RESUME_TEMPLATE_IDS } from "@/lib/resume/templates";

/*
 * The document, as it arrives from a browser.
 *
 * Bounded at every level, because these are the routes a person can post
 * arbitrary structure to. It lives here rather than beside one route because
 * two of them take the same document — saving a version and downloading a file
 * — and a schema copied into both is a schema that will disagree with itself
 * the first time either is changed.
 *
 * Kept out of lib/resume/content.ts on purpose: that module is imported by the
 * editor, and there is no reason for a validation library to travel to the
 * browser for a type the browser only constructs.
 */
export const resumeContentSchema = z.object({
  headline: z.string().trim().max(400).default(""),
  summary: z.string().trim().max(4_000).default(""),
  sections: z.array(z.object({
    id: z.string().trim().max(64).default(""),
    heading: z.string().trim().max(200).default(""),
    bullets: z.array(z.object({
      id: z.string().trim().max(64).default(""),
      text: z.string().trim().min(1).max(2_000),
      evidenceIds: z.array(z.string().max(64)).max(40).default([]),
      edited: z.boolean().default(false),
    })).max(60).default([]),
  })).max(20).default([]),
  /*
   * Unrecognised or absent falls back to Classic rather than being rejected.
   *
   * Read from the template list rather than spelled out again. Written out, it
   * was a second list that had to be remembered: adding a template without
   * touching this line would have let somebody pick it on screen, watch it save
   * successfully, and find Classic waiting for them on reload — with no error
   * anywhere, because `.catch()` is doing exactly what it was asked to.
   */
  template: z.enum(RESUME_TEMPLATE_IDS).catch(DEFAULT_TEMPLATE).default(DEFAULT_TEMPLATE),
});
