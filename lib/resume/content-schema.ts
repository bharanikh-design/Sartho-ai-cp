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
const bulletSchema = z.object({
  id: z.string().trim().max(64).default(""),
  text: z.string().trim().min(1).max(2_000),
  evidenceIds: z.array(z.string().max(64)).max(40).default([]),
  edited: z.boolean().default(false),
});

export const resumeContentSchema = z.object({
  name: z.string().trim().max(200).default(""),
  targetRole: z.string().trim().max(200).default(""),
  /*
   * Every contact field is optional and every one may be empty. A résumé
   * stating a phone number nobody supplied is worse than one stating none, so
   * a blank arrives as a blank rather than being rejected or filled in.
   */
  contact: z.object({
    email: z.string().trim().max(320).default(""),
    phone: z.string().trim().max(60).default(""),
    location: z.string().trim().max(160).default(""),
    linkedin: z.string().trim().max(300).default(""),
    website: z.string().trim().max(300).default(""),
  }).default({ email: "", phone: "", location: "", linkedin: "", website: "" }),
  summary: z.string().trim().max(4_000).default(""),
  /*
   * Dates are strings on purpose. A CV says "2019", "Jan 2022", "Present";
   * a date type would invent a precision nobody supplied and then print it
   * back as though somebody had.
   */
  roles: z.array(z.object({
    id: z.string().trim().max(64).default(""),
    title: z.string().trim().max(200).default(""),
    employer: z.string().trim().max(200).default(""),
    location: z.string().trim().max(160).default(""),
    start: z.string().trim().max(60).default(""),
    end: z.string().trim().max(60).default(""),
    current: z.boolean().default(false),
    bullets: z.array(bulletSchema).max(40).default([]),
  })).max(30).default([]),
  sections: z.array(z.object({
    id: z.string().trim().max(64).default(""),
    heading: z.string().trim().max(200).default(""),
    bullets: z.array(bulletSchema).max(60).default([]),
  })).max(20).default([]),
  skills: z.array(z.string().trim().min(1).max(80)).max(60).default([]),
  education: z.array(z.object({
    id: z.string().trim().max(64).default(""),
    qualification: z.string().trim().max(200).default(""),
    institution: z.string().trim().max(200).default(""),
    year: z.string().trim().max(60).default(""),
  })).max(15).default([]),
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
