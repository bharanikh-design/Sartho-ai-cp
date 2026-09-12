"use client";

import {
  Document,
  Page,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  contactLine,
  roleDates,
  roleWhere,
  type ResumeContent,
  type ResumeSection,
} from "@/lib/resume/content";
import { resumeTemplate, type ResumeTemplatePdf } from "@/lib/resume/templates";

/*
 * The PDF renderer deliberately lives in its own client-only module.
 * @react-pdf/renderer is an ESM/browser renderer; importing it from the
 * server page or from the download handler makes Next try to bundle its Node
 * entry and fail before the application can build. Keeping the document tree
 * here gives both the live preview and the browser download the same source.
 *
 * It reads the template's tokens, which it previously did not. Seven templates
 * were described in lib/resume/templates.ts — a coloured left bar, a solid
 * accent bar, letterspaced capitals over a double rule — and this file read one
 * field of them, the font, and drew all seven identically in Helvetica or
 * Times. A template chosen on screen changed the typeface of the thing a person
 * actually sends and nothing else, which is why the output looked the same
 * however long somebody spent choosing.
 */

type Palette = ReturnType<typeof paletteFor>;

/*
 * Every style the document needs, derived from the template rather than frozen
 * in a StyleSheet. react-pdf takes plain objects, so a token that changes is a
 * page that changes — there is no second place for a template to be described.
 */
function paletteFor(pdf: ResumeTemplatePdf) {
  const sidebar = pdf.layout === "sidebar";
  return {
    pdf,
    sidebar,
    page: {
      fontFamily: pdf.font,
      color: pdf.ink,
      fontSize: pdf.bodySize,
      lineHeight: pdf.lineHeight,
      /* A sidebar runs to the paper's edge, so the page itself carries no padding. */
      ...(sidebar
        ? { flexDirection: "row" as const }
        : { paddingTop: pdf.pagePadding, paddingBottom: pdf.pagePadding, paddingLeft: pdf.pagePadding, paddingRight: pdf.pagePadding }),
    },
    main: sidebar ? { flexGrow: 1, paddingTop: 38, paddingBottom: 38, paddingLeft: 26, paddingRight: 34 } : {},
    aside: sidebar
      ? { width: pdf.sidebarWidth ?? 174, backgroundColor: pdf.accent, color: pdf.sidebarInk ?? "#ffffff", paddingTop: 38, paddingBottom: 38, paddingLeft: 22, paddingRight: 20 }
      : {},
    name: {
      fontSize: pdf.nameSize,
      fontWeight: 700 as const,
      letterSpacing: pdf.nameTracking,
      textAlign: pdf.nameAlign,
      textTransform: (pdf.nameCaps ? "uppercase" : "none") as "uppercase" | "none",
      marginBottom: 3,
    },
    targetRole: { fontSize: pdf.bodySize + 2.2, color: pdf.accent, textAlign: pdf.nameAlign, marginBottom: 5 },
    contact: { fontSize: pdf.bodySize - 0.8, color: pdf.muted, textAlign: pdf.nameAlign },
    paragraph: { marginBottom: 8 },
    role: { marginBottom: 9 },
    roleHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, marginBottom: 2.5 },
    roleTitle: { fontWeight: 700 as const, flexGrow: 1, paddingRight: 8 },
    roleDates: { color: pdf.muted, fontSize: pdf.bodySize - 0.6 },
    bulletRow: { flexDirection: "row" as const, marginBottom: 2.2 },
    bulletMark: { width: 9, color: pdf.accent },
    bulletText: { flexGrow: 1, flexShrink: 1 },
    asideHeading: {
      fontSize: pdf.headingSize - 0.6,
      fontWeight: 700 as const,
      letterSpacing: 0.9,
      textTransform: "uppercase" as const,
      marginTop: 16,
      marginBottom: 5,
      color: pdf.sidebarInk ?? "#ffffff",
    },
    asideText: { fontSize: pdf.bodySize - 0.7, color: pdf.sidebarMuted ?? "#dbe7e4", marginBottom: 3 },
  };
}

/*
 * One heading, drawn the way the template says.
 *
 * Five treatments rather than five renderers, because a heading is the single
 * element that carries most of a template's character — the difference between
 * Classic and Impact is almost entirely what happens on this line.
 */
function Heading({ text, p }: { text: string; p: Palette }) {
  const { pdf } = p;
  const base = {
    fontSize: pdf.headingSize,
    fontWeight: 700 as const,
    letterSpacing: 0.7,
    textTransform: (pdf.headingCaps ? "uppercase" : "none") as "uppercase" | "none",
    marginTop: 13,
    marginBottom: 6,
  };

  if (pdf.heading === "bar") {
    return (
      <View style={{ backgroundColor: pdf.accent, marginTop: 13, marginBottom: 7, paddingVertical: 3, paddingHorizontal: 7 }} wrap={false}>
        <Text style={{ ...base, marginTop: 0, marginBottom: 0, color: "#ffffff" }}>{text}</Text>
      </View>
    );
  }

  /* A short thick stroke to the left, which reads as a margin mark rather than a rule. */
  if (pdf.heading === "edge") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 13, marginBottom: 6 }} wrap={false}>
        <View style={{ width: 14, height: 2.2, backgroundColor: pdf.accent, marginRight: 7 }} />
        <Text style={{ ...base, marginTop: 0, marginBottom: 0, color: pdf.accent }}>{text}</Text>
      </View>
    );
  }

  if (pdf.heading === "doubleRule") {
    return (
      <View style={{ marginTop: 14, marginBottom: 7, borderTopWidth: 0.6, borderTopColor: pdf.accent, borderBottomWidth: 0.6, borderBottomColor: pdf.accent, paddingVertical: 3 }} wrap={false}>
        <Text style={{ ...base, marginTop: 0, marginBottom: 0, textAlign: "center" }}>{text}</Text>
      </View>
    );
  }

  if (pdf.heading === "rule") {
    return <Text style={{ ...base, borderBottomWidth: 0.7, borderBottomColor: pdf.muted, paddingBottom: 3 }}>{text}</Text>;
  }

  return <Text style={{ ...base, color: pdf.accent }}>{text}</Text>;
}

function Bullets({ items, p }: { items: Array<{ text: string }>; p: Palette }) {
  return (
    <>
      {items
        .filter((item) => item.text.trim())
        .map((item, index) => (
          <View style={p.bulletRow} key={`${item.text}-${index}`} wrap={false}>
            <Text style={p.bulletMark}>•</Text>
            <Text style={p.bulletText}>{item.text.trim()}</Text>
          </View>
        ))}
    </>
  );
}

function Section({ section, p }: { section: ResumeSection; p: Palette }) {
  const items = section.bullets.filter((bullet) => bullet.text.trim());
  if (!items.length) return null;
  return (
    <View>
      {section.heading.trim() ? <Heading text={section.heading.trim()} p={p} /> : null}
      <Bullets items={items} p={p} />
    </View>
  );
}

/* Skills and education, which are what a sidebar is for when there is one. */
function Supporting({ content, p, inAside }: { content: ResumeContent; p: Palette; inAside: boolean }) {
  const skills = content.skills.filter(Boolean);
  const education = content.education.filter((entry) => entry.qualification.trim() || entry.institution.trim() || entry.year.trim());
  if (!skills.length && !education.length) return null;

  if (inAside) {
    return (
      <>
        {skills.length ? (
          <View>
            <Text style={p.asideHeading}>Skills</Text>
            {skills.map((skill) => <Text style={p.asideText} key={skill}>{skill}</Text>)}
          </View>
        ) : null}
        {education.length ? (
          <View>
            <Text style={p.asideHeading}>Education</Text>
            {education.map((entry) => (
              <View key={entry.id} style={{ marginBottom: 6 }}>
                <Text style={{ ...p.asideText, marginBottom: 1, color: p.pdf.sidebarInk ?? "#ffffff" }}>{entry.qualification.trim()}</Text>
                <Text style={p.asideText}>{[entry.institution.trim(), entry.year.trim()].filter(Boolean).join(" · ")}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <>
      {skills.length ? (
        <View>
          <Heading text="Skills" p={p} />
          <Text>{skills.join(" · ")}</Text>
        </View>
      ) : null}
      {education.length ? (
        <View>
          <Heading text="Education" p={p} />
          {education.map((entry) => {
            const label = [entry.qualification.trim(), entry.institution.trim()].filter(Boolean).join(", ");
            return (
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }} key={entry.id} wrap={false}>
                <Text>{label}</Text>
                {entry.year.trim() ? <Text style={{ color: p.pdf.muted }}>{entry.year.trim()}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

/* The career itself: summary, employment, then anything that belongs to no role. */
function Career({ content, p }: { content: ResumeContent; p: Palette }) {
  return (
    <>
      {content.summary.trim() ? (
        <View>
          <Heading text="Professional Summary" p={p} />
          <Text style={p.paragraph}>{content.summary.trim()}</Text>
        </View>
      ) : null}

      {content.roles.length ? (
        <View>
          <Heading text="Experience" p={p} />
          {content.roles.map((role) => {
            const where = roleWhere(role);
            const dates = roleDates(role);
            return (
              <View style={p.role} key={role.id}>
                {role.title.trim() || where || dates ? (
                  <View style={p.roleHeader} wrap={false}>
                    <Text style={p.roleTitle}>{[role.title.trim(), where].filter(Boolean).join(", ")}</Text>
                    {dates ? <Text style={p.roleDates}>{dates}</Text> : null}
                  </View>
                ) : null}
                <Bullets items={role.bullets} p={p} />
              </View>
            );
          })}
        </View>
      ) : null}

      {content.sections.map((item) => <Section section={item} p={p} key={item.id} />)}
    </>
  );
}

export function ResumePdfRenderer({ content }: { content: ResumeContent }) {
  const p = paletteFor(resumeTemplate(content.template).pdf);
  const contact = contactLine(content.contact);
  const title = [content.name.trim(), content.targetRole.trim()].filter(Boolean).join(" — ") || "Résumé";

  const identity = (
    <View style={{ marginBottom: p.sidebar ? 4 : 16 }} wrap={false}>
      {content.name.trim() ? <Text style={p.name}>{content.name.trim()}</Text> : null}
      {content.targetRole.trim() ? <Text style={p.targetRole}>{content.targetRole.trim()}</Text> : null}
      {contact && !p.sidebar ? <Text style={p.contact}>{contact}</Text> : null}
    </View>
  );

  /*
   * Two columns, drawn as two columns. The sidebar carries contact, skills and
   * education; the main column carries the career, which is the part a reader
   * spends their time in and the part that should never be squeezed.
   */
  if (p.sidebar) {
    return (
      <Document title={title} author="Sartho" subject="Résumé generated from approved career evidence">
        <Page size="A4" style={p.page} wrap>
          <View style={p.aside}>
            {content.contact.email || content.contact.phone || content.contact.location ? (
              <View>
                <Text style={p.asideHeading}>Contact</Text>
                {[content.contact.email, content.contact.phone, content.contact.location, content.contact.linkedin, content.contact.website]
                  .map((value) => value?.trim())
                  .filter(Boolean)
                  .map((value) => <Text style={p.asideText} key={value}>{value}</Text>)}
              </View>
            ) : null}
            <Supporting content={content} p={p} inAside />
          </View>
          <View style={p.main}>
            {identity}
            <Career content={content} p={p} />
          </View>
        </Page>
      </Document>
    );
  }

  return (
    <Document title={title} author="Sartho" subject="Résumé generated from approved career evidence">
      <Page size="A4" style={p.page} wrap>
        {identity}
        <Career content={content} p={p} />
        <Supporting content={content} p={p} inAside={false} />
      </Page>
    </Document>
  );
}
