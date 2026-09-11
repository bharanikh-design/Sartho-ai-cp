"use client";

import {
  Document,
  Page,
  StyleSheet,
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

/*
 * The PDF renderer deliberately lives in its own client-only module.
 * @react-pdf/renderer is an ESM/browser renderer; importing it from the
 * server page or from the download handler makes Next try to bundle its Node
 * entry and fail before the application can build. Keeping the document tree
 * here gives both the live preview and the browser download the same source.
 */

type PdfFont = "Helvetica" | "Times-Roman";

const FONT_BY_TEMPLATE: Record<ResumeContent["template"], PdfFont> = {
  classic: "Times-Roman",
  executive: "Times-Roman",
  editorial: "Times-Roman",
  modern: "Helvetica",
  impact: "Helvetica",
  compact: "Helvetica",
  innovator: "Helvetica",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingRight: 46,
    paddingBottom: 42,
    paddingLeft: 46,
    color: "#172018",
    fontSize: 9.5,
    lineHeight: 1.35,
  },
  identity: {
    marginBottom: 18,
  },
  name: {
    fontSize: 25,
    fontWeight: 700,
    marginBottom: 4,
  },
  targetRole: {
    fontSize: 12,
    marginBottom: 7,
  },
  contact: {
    color: "#56625b",
    fontSize: 8.5,
  },
  heading: {
    borderBottomWidth: 0.7,
    borderBottomColor: "#87938a",
    borderBottomStyle: "solid",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 7,
    paddingBottom: 3,
    textTransform: "uppercase",
  },
  paragraph: {
    marginBottom: 8,
  },
  role: {
    marginBottom: 9,
  },
  roleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 2,
  },
  roleTitle: {
    flexGrow: 1,
    fontWeight: 700,
  },
  roleDates: {
    color: "#56625b",
    flexShrink: 0,
    textAlign: "right",
  },
  roleWhere: {
    color: "#56625b",
    marginBottom: 3,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 2.5,
    paddingLeft: 7,
  },
  bulletMark: {
    width: 10,
  },
  bulletText: {
    flexGrow: 1,
  },
  skills: {
    marginBottom: 8,
  },
  educationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  educationText: {
    flexGrow: 1,
  },
  educationYear: {
    color: "#56625b",
    flexShrink: 0,
    marginLeft: 12,
  },
});

function heading(text: string, fontFamily: PdfFont) {
  return <Text style={[styles.heading, { fontFamily }]}>{text}</Text>;
}

function bullets(items: Array<{ text: string }>, fontFamily: PdfFont) {
  return items
    .filter((item) => item.text.trim())
    .map((item, index) => (
      <View style={styles.bulletRow} key={`${item.text}-${index}`} wrap={false}>
        <Text style={[styles.bulletMark, { fontFamily }]}>•</Text>
        <Text style={[styles.bulletText, { fontFamily }]}>{item.text.trim()}</Text>
      </View>
    ));
}

function section(section: ResumeSection, fontFamily: PdfFont) {
  const items = bullets(section.bullets, fontFamily);
  if (!items.length) return null;
  return (
    <View key={section.id}>
      {section.heading.trim() ? heading(section.heading.trim(), fontFamily) : null}
      {items}
    </View>
  );
}

export function ResumePdfRenderer({ content }: { content: ResumeContent }) {
  const fontFamily = FONT_BY_TEMPLATE[content.template] ?? "Helvetica";
  const contact = contactLine(content.contact);
  const title = [content.name.trim(), content.targetRole.trim()].filter(Boolean).join(" — ") || "Résumé";

  return (
    <Document title={title} author="Sartho" subject="Résumé generated from approved career evidence">
      <Page size="A4" style={[styles.page, { fontFamily }]} wrap>
        <View style={styles.identity} wrap={false}>
          {content.name.trim() ? <Text style={[styles.name, { fontFamily }]}>{content.name.trim()}</Text> : null}
          {content.targetRole.trim() ? <Text style={[styles.targetRole, { fontFamily }]}>{content.targetRole.trim()}</Text> : null}
          {contact ? <Text style={[styles.contact, { fontFamily }]}>{contact}</Text> : null}
        </View>

        {content.summary.trim() ? (
          <View>
            {heading("Professional Summary", fontFamily)}
            <Text style={[styles.paragraph, { fontFamily }]}>{content.summary.trim()}</Text>
          </View>
        ) : null}

        {content.roles.length ? (
          <View>
            {heading("Experience", fontFamily)}
            {content.roles.map((role) => {
              const where = roleWhere(role);
              const dates = roleDates(role);
              return (
                <View style={styles.role} key={role.id}>
                  {role.title.trim() || where || dates ? (
                    <View style={styles.roleHeader} wrap={false}>
                      <Text style={[styles.roleTitle, { fontFamily }]}>
                        {[role.title.trim(), where].filter(Boolean).join(", ")}
                      </Text>
                      {dates ? <Text style={[styles.roleDates, { fontFamily }]}>{dates}</Text> : null}
                    </View>
                  ) : null}
                  {bullets(role.bullets, fontFamily)}
                </View>
              );
            })}
          </View>
        ) : null}

        {content.sections.map((item) => section(item, fontFamily))}

        {content.skills.length ? (
          <View>
            {heading("Skills", fontFamily)}
            <Text style={[styles.skills, { fontFamily }]}>{content.skills.filter(Boolean).join(" · ")}</Text>
          </View>
        ) : null}

        {content.education.length ? (
          <View>
            {heading("Education", fontFamily)}
            {content.education.map((entry) => {
              const label = [entry.qualification.trim(), entry.institution.trim()].filter(Boolean).join(", ");
              if (!label && !entry.year.trim()) return null;
              return (
                <View style={styles.educationRow} key={entry.id} wrap={false}>
                  <Text style={[styles.educationText, { fontFamily }]}>{label}</Text>
                  {entry.year.trim() ? <Text style={[styles.educationYear, { fontFamily }]}>{entry.year.trim()}</Text> : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
