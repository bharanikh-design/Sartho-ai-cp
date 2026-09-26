"use client";

import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { ResumeContent } from "@/lib/resume/content";
import { resumeTemplate, type ResumeTemplatePdf } from "@/lib/resume/templates";

/*
 * One renderer, driven by the template's own tokens.
 *
 * What was here before was two hardcoded stylesheets and this:
 *
 *     const isTech = ["modern", "impact", "innovator"].includes(content.template);
 *
 * Ten templates therefore produced two documents. Systems, Engineering,
 * Classic, Executive, Editorial and Compact were byte-identical; "Innovator"
 * and "Atlas" describe a two-column design and rendered a single column;
 * "Compact" could not compact. The on-screen preview reads the tokens, so what
 * a person chose and previewed was not what they downloaded — the template
 * choice was discarded at the one moment it mattered, which is the same bug
 * lib/resume/templates.ts says at the top was already fixed. It was fixed for
 * the Word file and for the preview. Not here.
 *
 * Worse than the design drift: this renderer emitted only summary, roles,
 * education and a comma-joined skills line. `sections`, `skillGroups` and
 * `certifications` were dropped on the floor — so a person with a PE licence
 * or an AWS certification downloaded a PDF without it. The ATS Gate then read
 * the PDF back, could not find the certification it knew was in the document,
 * and reported "Files lose facts when parsed", blaming the parser for what
 * this file discarded.
 *
 * So: every token is read, every field is rendered, and the page size is no
 * longer hardcoded to A4 — a résumé for the US market is Letter.
 */

export type ResumePageSize = "A4" | "LETTER";

const SPACE = { section: 11, item: 9, bullet: 3.2 };

function contactLine(content: ResumeContent): string[] {
  const { email, phone, location, linkedin, website } = content.contact;
  return [phone, email, location, linkedin, website].map((part) => part?.trim()).filter(Boolean) as string[];
}

/** The date range as a résumé writes it, never as a parsed date. */
function dateRange(role: { start: string; end: string; current: boolean }): string {
  const start = role.start?.trim() ?? "";
  const end = role.current ? "Present" : (role.end?.trim() ?? "");
  if (start && end) return `${start} – ${end}`;
  return start || end;
}

/*
 * The five heading treatments the tokens describe. Each one is a real
 * difference on the page, which is the whole point of a template.
 */
function SectionHeading({ pdf, children }: { pdf: ResumeTemplatePdf; children: string }) {
  const label = pdf.headingCaps ? children.toUpperCase() : children;
  /*
   * No letterspacing on a heading, however well it would set.
   *
   * A PDF renders tracked text by positioning each glyph separately, and every
   * text extractor — including the one behind the ATS Gate, and whatever a real
   * applicant tracking system uses — then reads "CERTIFICATIONS" back as
   * "C E RT I F I C AT I O N S". Section headings are the landmarks a parser
   * navigates by, so they stay untracked. The name may still be tracked where
   * a template asks for it: that is one line, it is set as a design decision,
   * and the Word file beside it is the one the parser is given.
   */
  const base = {
    fontSize: pdf.headingSize,
    fontFamily: pdf.font,
    fontWeight: "bold" as const,
  };

  if (pdf.heading === "bar") {
    return (
      <View style={{ backgroundColor: pdf.accent, paddingVertical: 3, paddingHorizontal: 6, marginBottom: 6 }}>
        <Text style={{ ...base, color: "#ffffff" }}>{label}</Text>
      </View>
    );
  }

  if (pdf.heading === "edge") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <View style={{ width: 14, height: 2.4, backgroundColor: pdf.accent }} />
        <Text style={{ ...base, color: pdf.accent }}>{label}</Text>
      </View>
    );
  }

  if (pdf.heading === "doubleRule") {
    return (
      <View style={{ borderTopWidth: 0.8, borderBottomWidth: 0.8, borderColor: pdf.accent, paddingVertical: 2.5, marginBottom: 6 }}>
        <Text style={{ ...base, color: pdf.accent }}>{label}</Text>
      </View>
    );
  }

  if (pdf.heading === "rule") {
    return (
      <View style={{ borderBottomWidth: 0.8, borderColor: pdf.accent, paddingBottom: 2.5, marginBottom: 6 }}>
        <Text style={{ ...base, color: pdf.accent }}>{label}</Text>
      </View>
    );
  }

  return <Text style={{ ...base, color: pdf.accent, marginBottom: 5 }}>{label}</Text>;
}

function Bullets({ pdf, bullets }: { pdf: ResumeTemplatePdf; bullets: Array<{ id: string; text: string }> }) {
  return (
    <>
      {bullets.filter((bullet) => bullet.text?.trim()).map((bullet) => (
        <View key={bullet.id} style={{ flexDirection: "row", marginBottom: SPACE.bullet }}>
          <Text style={{ width: 10, fontSize: pdf.bodySize, color: pdf.muted }}>•</Text>
          <Text style={{ flex: 1, fontSize: pdf.bodySize, lineHeight: pdf.lineHeight, color: pdf.ink }}>
            {bullet.text}
          </Text>
        </View>
      ))}
    </>
  );
}

function SkillsBlock({ pdf, content }: { pdf: ResumeTemplatePdf; content: ResumeContent }) {
  const groups = content.skillGroups.filter((group) => group.skills.length);

  /*
   * Grouped skills are rendered as groups. This is the form engineering and
   * technical recruiters expect, and it was being flattened away entirely.
   */
  if (groups.length) {
    return (
      <View>
        {groups.map((group) => (
          <View key={group.id} style={{ flexDirection: "row", marginBottom: 3.5 }}>
            <Text style={{ fontSize: pdf.bodySize, fontFamily: pdf.font, fontWeight: "bold", color: pdf.ink, width: 96 }}>
              {group.name}
            </Text>
            <Text style={{ flex: 1, fontSize: pdf.bodySize, lineHeight: pdf.lineHeight, color: pdf.ink }}>
              {group.skills.join(", ")}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  if (!content.skills.length) return null;
  return (
    <Text style={{ fontSize: pdf.bodySize, lineHeight: pdf.lineHeight, color: pdf.ink }}>
      {content.skills.join(" · ")}
    </Text>
  );
}

function Experience({ pdf, content }: { pdf: ResumeTemplatePdf; content: ResumeContent }) {
  if (!content.roles.length) return null;
  return (
    <View style={{ marginBottom: SPACE.section }}>
      <SectionHeading pdf={pdf}>Experience</SectionHeading>
      {content.roles.map((role) => (
        <View key={role.id} style={{ marginBottom: SPACE.item }} wrap={false}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontSize: pdf.bodySize + 1.1, fontFamily: pdf.font, fontWeight: "bold", color: pdf.ink, flex: 1 }}>
              {role.title}
            </Text>
            <Text style={{ fontSize: pdf.bodySize - 0.3, color: pdf.muted }}>{dateRange(role)}</Text>
          </View>
          <Text style={{ fontSize: pdf.bodySize, color: pdf.muted, marginBottom: 3.5 }}>
            {[role.employer, role.location].filter((part) => part?.trim()).join(" · ")}
          </Text>
          <Bullets pdf={pdf} bullets={role.bullets} />
        </View>
      ))}
    </View>
  );
}

function Certifications({ pdf, content }: { pdf: ResumeTemplatePdf; content: ResumeContent }) {
  if (!content.certifications.length) return null;
  return (
    <View style={{ marginBottom: SPACE.section }}>
      <SectionHeading pdf={pdf}>Certifications</SectionHeading>
      {content.certifications.map((entry) => (
        <View key={entry.id} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2.6 }}>
          <Text style={{ fontSize: pdf.bodySize, color: pdf.ink, flex: 1 }}>
            {[entry.name, entry.issuer].filter((part) => part?.trim()).join(" — ")}
          </Text>
          {entry.year?.trim() ? <Text style={{ fontSize: pdf.bodySize - 0.3, color: pdf.muted }}>{entry.year}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function Education({ pdf, content }: { pdf: ResumeTemplatePdf; content: ResumeContent }) {
  if (!content.education.length) return null;
  return (
    <View style={{ marginBottom: SPACE.section }}>
      <SectionHeading pdf={pdf}>Education</SectionHeading>
      {content.education.map((entry) => (
        <View key={entry.id} style={{ marginBottom: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontSize: pdf.bodySize, fontFamily: pdf.font, fontWeight: "bold", color: pdf.ink, flex: 1 }}>
              {entry.qualification}
            </Text>
            {entry.year?.trim() ? <Text style={{ fontSize: pdf.bodySize - 0.3, color: pdf.muted }}>{entry.year}</Text> : null}
          </View>
          <Text style={{ fontSize: pdf.bodySize, color: pdf.muted }}>{entry.institution}</Text>
        </View>
      ))}
    </View>
  );
}

/** Everything that is not dated employment: projects, publications, a heading somebody made up. */
function CustomSections({ pdf, content }: { pdf: ResumeTemplatePdf; content: ResumeContent }) {
  const sections = content.sections.filter((section) => section.heading?.trim() || section.bullets.length);
  if (!sections.length) return null;
  return (
    <>
      {sections.map((section) => (
        <View key={section.id} style={{ marginBottom: SPACE.section }}>
          <SectionHeading pdf={pdf}>{section.heading || "Additional"}</SectionHeading>
          <Bullets pdf={pdf} bullets={section.bullets} />
        </View>
      ))}
    </>
  );
}

function Header({ pdf, content, align }: { pdf: ResumeTemplatePdf; content: ResumeContent; align: "left" | "center" }) {
  const parts = contactLine(content);
  return (
    <View style={{ marginBottom: 13, textAlign: align }}>
      <Text
        style={{
          fontSize: pdf.nameSize,
          fontFamily: pdf.font,
          fontWeight: "bold",
          color: pdf.ink,
          letterSpacing: pdf.nameTracking,
          textTransform: pdf.nameCaps ? "uppercase" : "none",
        }}
      >
        {content.name}
      </Text>
      {content.targetRole?.trim() ? (
        <Text style={{ fontSize: pdf.bodySize + 2, color: pdf.accent, marginTop: 2.5 }}>{content.targetRole}</Text>
      ) : null}
      {parts.length ? (
        <Text style={{ fontSize: pdf.bodySize - 0.4, color: pdf.muted, marginTop: 4, lineHeight: 1.4 }}>
          {parts.join("  ·  ")}
        </Text>
      ) : null}
    </View>
  );
}

function Summary({ pdf, content }: { pdf: ResumeTemplatePdf; content: ResumeContent }) {
  if (!content.summary?.trim()) return null;
  return (
    <View style={{ marginBottom: SPACE.section }}>
      <SectionHeading pdf={pdf}>Profile</SectionHeading>
      <Text style={{ fontSize: pdf.bodySize, lineHeight: pdf.lineHeight, color: pdf.ink }}>{content.summary}</Text>
    </View>
  );
}

function SkillsSection({ pdf, content }: { pdf: ResumeTemplatePdf; content: ResumeContent }) {
  if (!content.skills.length && !content.skillGroups.length) return null;
  return (
    <View style={{ marginBottom: SPACE.section }}>
      <SectionHeading pdf={pdf}>Skills</SectionHeading>
      <SkillsBlock pdf={pdf} content={content} />
    </View>
  );
}

/** The career column, shared by both layouts. */
function MainColumn({ pdf, content, includeEducation }: {
  pdf: ResumeTemplatePdf;
  content: ResumeContent;
  includeEducation: boolean;
}) {
  /*
   * The order is the template's, not this file's. Which block leads is most of
   * what separates a delivery manager's résumé from a graduate's: a PMP is
   * read before the first role, a licence before any of it, and a degree leads
   * only for somebody whose degree is their strongest evidence.
   *
   * `includeEducation` is false on the sidebar layouts, where education and
   * skills live in the sidebar instead.
   */
  const skillsTop = pdf.skillsPlacement === "top";
  const certificationsTop = pdf.certificationsPlacement === "top";
  const educationTop = pdf.educationPlacement === "top";

  return (
    <>
      <Summary pdf={pdf} content={content} />
      {educationTop && includeEducation ? <Education pdf={pdf} content={content} /> : null}
      {certificationsTop ? <Certifications pdf={pdf} content={content} /> : null}
      {skillsTop && includeEducation ? <SkillsSection pdf={pdf} content={content} /> : null}
      <Experience pdf={pdf} content={content} />
      {certificationsTop ? null : <Certifications pdf={pdf} content={content} />}
      {!educationTop && includeEducation ? <Education pdf={pdf} content={content} /> : null}
      <CustomSections pdf={pdf} content={content} />
      {!skillsTop && includeEducation ? <SkillsSection pdf={pdf} content={content} /> : null}
    </>
  );
}

function SidebarHeading({ pdf, children }: { pdf: ResumeTemplatePdf; children: string }) {
  return (
    <Text
      style={{
        fontSize: pdf.headingSize - 0.4,
        fontFamily: pdf.font,
        fontWeight: "bold",
        color: pdf.sidebarInk ?? "#ffffff",
        marginBottom: 5,
      }}
    >
      {children.toUpperCase()}
    </Text>
  );
}

export function ResumePdfRenderer({ content, pageSize = "A4" }: {
  content: ResumeContent;
  pageSize?: ResumePageSize;
}) {
  const pdf = resumeTemplate(content.template).pdf;
  const title = content.name ? `${content.name} — Résumé` : "Résumé";

  if (pdf.layout === "sidebar") {
    const width = pdf.sidebarWidth ?? 176;
    const sidebarInk = pdf.sidebarInk ?? "#ffffff";
    const sidebarMuted = pdf.sidebarMuted ?? "#c9d4d2";
    const groups = content.skillGroups.filter((group) => group.skills.length);

    return (
      <Document title={title}>
        <Page
          size={pageSize}
          style={{
            fontFamily: pdf.font,
            backgroundColor: "#ffffff",
            color: pdf.ink,
            paddingTop: 30,
            paddingBottom: 34,
            paddingRight: 32,
            paddingLeft: width + 24,
          }}
        >
          {/*
            * Fixed, so the colour runs the full height of every page rather
            * than stopping where page one's content did.
            */}
          <View fixed style={{ position: "absolute", top: 0, bottom: 0, left: 0, width, backgroundColor: pdf.accent }} />

          {/* Sidebar content belongs on the first page only. */}
          <View style={{ position: "absolute", top: 30, left: 0, width, paddingHorizontal: 18 }}>
            <Text style={{ fontSize: pdf.nameSize - 2, fontFamily: pdf.font, fontWeight: "bold", color: sidebarInk }}>
              {content.name}
            </Text>
            {content.targetRole?.trim() ? (
              <Text style={{ fontSize: pdf.bodySize, color: sidebarMuted, marginTop: 3, marginBottom: 12 }}>
                {content.targetRole}
              </Text>
            ) : <View style={{ height: 12 }} />}

            {contactLine(content).length ? (
              <View style={{ marginBottom: 14 }}>
                <SidebarHeading pdf={pdf}>Contact</SidebarHeading>
                {contactLine(content).map((part) => (
                  <Text key={part} style={{ fontSize: pdf.bodySize - 0.6, color: sidebarMuted, marginBottom: 2.4, lineHeight: 1.35 }}>
                    {part}
                  </Text>
                ))}
              </View>
            ) : null}

            {groups.length || content.skills.length ? (
              <View style={{ marginBottom: 14 }}>
                <SidebarHeading pdf={pdf}>Skills</SidebarHeading>
                {groups.length ? groups.map((group) => (
                  <View key={group.id} style={{ marginBottom: 6 }}>
                    <Text style={{ fontSize: pdf.bodySize - 0.6, fontFamily: pdf.font, fontWeight: "bold", color: sidebarInk, marginBottom: 1.5 }}>
                      {group.name}
                    </Text>
                    <Text style={{ fontSize: pdf.bodySize - 0.6, color: sidebarMuted, lineHeight: 1.35 }}>
                      {group.skills.join(", ")}
                    </Text>
                  </View>
                )) : (
                  <Text style={{ fontSize: pdf.bodySize - 0.6, color: sidebarMuted, lineHeight: 1.4 }}>
                    {content.skills.join(", ")}
                  </Text>
                )}
              </View>
            ) : null}

            {content.education.length ? (
              <View>
                <SidebarHeading pdf={pdf}>Education</SidebarHeading>
                {content.education.map((entry) => (
                  <View key={entry.id} style={{ marginBottom: 5 }}>
                    <Text style={{ fontSize: pdf.bodySize - 0.6, fontFamily: pdf.font, fontWeight: "bold", color: sidebarInk, lineHeight: 1.3 }}>
                      {entry.qualification}
                    </Text>
                    <Text style={{ fontSize: pdf.bodySize - 0.8, color: sidebarMuted, lineHeight: 1.3 }}>
                      {[entry.institution, entry.year].filter((part) => part?.trim()).join(" · ")}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <MainColumn pdf={pdf} content={content} includeEducation={false} />
        </Page>
      </Document>
    );
  }

  return (
    <Document title={title}>
      <Page
        size={pageSize}
        style={{
          fontFamily: pdf.font,
          backgroundColor: "#ffffff",
          color: pdf.ink,
          padding: pdf.pagePadding || 40,
        }}
      >
        <Header pdf={pdf} content={content} align={pdf.nameAlign} />
        <MainColumn pdf={pdf} content={content} includeEducation />
      </Page>
    </Document>
  );
}

export default ResumePdfRenderer;
