"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  type ResumeContent,
} from "@/lib/resume/content";


// ---------------------------------------------------------------------------
// 1. CONSULTING CLASSIC (Big 4 / Finance Standard)
// Strictly single column, serif font, highly dense, chronological.
// ---------------------------------------------------------------------------
const classicStyles = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Times-Roman', backgroundColor: '#FFFFFF', color: '#000000' },
  header: { textAlign: 'center', marginBottom: 16 },
  name: { fontSize: 24, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
  contact: { fontSize: 10, flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6 },
  section: { marginBottom: 12 },
  sectionHeading: { 
    fontSize: 12, 
    fontWeight: 'bold', 
    textTransform: 'uppercase', 
    borderBottom: '1px solid #000', 
    paddingBottom: 2, 
    marginBottom: 8 
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  itemTitle: { fontSize: 11, fontWeight: 'bold' },
  itemDate: { fontSize: 11 },
  itemSubtitle: { fontSize: 11, fontStyle: 'italic', marginBottom: 4 },
  bullet: { flexDirection: 'row', marginBottom: 3 },
  bulletPoint: { width: 12, fontSize: 10 },
  bulletText: { flex: 1, fontSize: 10, lineHeight: 1.3 },
  summary: { fontSize: 10, lineHeight: 1.3, marginBottom: 12 },
  skills: { fontSize: 10, lineHeight: 1.4 }
});

export function ConsultingClassicPdf({ content }: { content: ResumeContent }) {
  const contactParts = [
    content.contact.phone,
    content.contact.email,
    content.contact.location,
    content.contact.linkedin
  ].filter(Boolean);

  return (
    <Document title={`${content.name} - Resume`}>
      <Page size="A4" style={classicStyles.page}>
        
        {/* Header */}
        <View style={classicStyles.header}>
          <Text style={classicStyles.name}>{content.name}</Text>
          <View style={classicStyles.contact}>
            {contactParts.map((part, i) => (
              <Text key={i}>{part}{i < contactParts.length - 1 ? '  |' : ''}</Text>
            ))}
          </View>
        </View>

        {/* Professional Summary */}
        {content.summary && (
          <View style={classicStyles.section}>
             <Text style={classicStyles.sectionHeading}>Professional Summary</Text>
             <Text style={classicStyles.summary}>{content.summary}</Text>
          </View>
        )}

        {/* Education */}
        {content.education.length > 0 && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionHeading}>Education</Text>
            {content.education.map((edu, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <View style={classicStyles.itemHeader}>
                  <Text style={classicStyles.itemTitle}>{edu.institution}</Text>
                  <Text style={classicStyles.itemDate}>{edu.year}</Text>
                </View>
                <Text style={classicStyles.itemSubtitle}>{edu.qualification}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Experience */}
        {content.roles.length > 0 && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionHeading}>Professional Experience</Text>
            {content.roles.map((role) => (
              <View key={role.id} style={{ marginBottom: 10 }}>
                <View style={classicStyles.itemHeader}>
                  <Text style={classicStyles.itemTitle}>{role.employer}{role.location ? ` - ${role.location}` : ''}</Text>
                  <Text style={classicStyles.itemDate}>{`${role.start}${role.end ? ` - ${role.end}` : (role.current ? " - Present" : "")}`}</Text>
                </View>
                <Text style={classicStyles.itemSubtitle}>{role.title}</Text>
                
                {role.bullets.map((bullet) => (
                  <View key={bullet.id} style={classicStyles.bullet}>
                    <Text style={classicStyles.bulletPoint}>•</Text>
                    <Text style={classicStyles.bulletText}>{bullet.text}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {content.skills.length > 0 && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionHeading}>Skills & Additional Information</Text>
            <Text style={classicStyles.skills}>{content.skills.join(', ')}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// 2. TECH MINIMALIST (FAANG / Startup Standard)
// Clean sans-serif, left-aligned header, highly scannable, single column.
// ---------------------------------------------------------------------------
const techStyles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', backgroundColor: '#FFFFFF', color: '#1a1a1a' },
  header: { marginBottom: 20 },
  name: { fontSize: 26, fontWeight: 'bold', letterSpacing: -0.5, marginBottom: 4 },
  targetRole: { fontSize: 14, color: '#555', marginBottom: 8 },
  contact: { fontSize: 9, color: '#666', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { marginBottom: 16 },
  sectionHeading: { 
    fontSize: 11, 
    fontWeight: 'bold', 
    textTransform: 'uppercase', 
    color: '#444',
    letterSpacing: 1,
    marginBottom: 8 
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 },
  itemTitle: { fontSize: 12, fontWeight: 'bold' },
  itemEmployer: { fontSize: 11, color: '#444', marginBottom: 6 },
  itemDate: { fontSize: 10, color: '#666' },
  bullet: { flexDirection: 'row', marginBottom: 4 },
  bulletPoint: { width: 10, fontSize: 10, color: '#666' },
  bulletText: { flex: 1, fontSize: 10, lineHeight: 1.4, color: '#333' },
  skillsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  skillItem: { fontSize: 10, color: '#333' }
});

export function TechMinimalistPdf({ content }: { content: ResumeContent }) {
  const contactParts = [content.contact.phone, content.contact.email, content.contact.linkedin].filter(Boolean);

  return (
    <Document title={`${content.name} - Resume`}>
      <Page size="A4" style={techStyles.page}>
        <View style={techStyles.header}>
          <Text style={techStyles.name}>{content.name}</Text>
          {content.targetRole && <Text style={techStyles.targetRole}>{content.targetRole}</Text>}
          <View style={techStyles.contact}>
            {contactParts.map((part, i) => (
              <Text key={i}>{part}{i < contactParts.length - 1 ? '  •' : ''}</Text>
            ))}
          </View>
        </View>

        {content.summary && (
          <View style={techStyles.section}>
            <Text style={techStyles.sectionHeading}>Summary</Text>
            <Text style={{ fontSize: 10, lineHeight: 1.4, color: '#333' }}>{content.summary}</Text>
          </View>
        )}
        
        {content.roles.length > 0 && (
          <View style={techStyles.section}>
            <Text style={techStyles.sectionHeading}>Experience</Text>
            {content.roles.map((role) => (
              <View key={role.id} style={{ marginBottom: 12 }}>
                <View style={techStyles.itemHeader}>
                  <Text style={techStyles.itemTitle}>{role.title}</Text>
                  <Text style={techStyles.itemDate}>{`${role.start}${role.end ? ` - ${role.end}` : (role.current ? " - Present" : "")}`}</Text>
                </View>
                <Text style={techStyles.itemEmployer}>{role.employer}{role.location ? ` • ${role.location}` : ''}</Text>
                
                {role.bullets.map((bullet) => (
                  <View key={bullet.id} style={techStyles.bullet}>
                    <Text style={techStyles.bulletPoint}>-</Text>
                    <Text style={techStyles.bulletText}>{bullet.text}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Education */}
        {content.education.length > 0 && (
          <View style={techStyles.section}>
            <Text style={techStyles.sectionHeading}>Education</Text>
            {content.education.map((edu, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <View style={techStyles.itemHeader}>
                  <Text style={techStyles.itemTitle}>{edu.institution}</Text>
                  <Text style={techStyles.itemDate}>{edu.year}</Text>
                </View>
                <Text style={techStyles.itemEmployer}>{edu.qualification}</Text>
              </View>
            ))}
          </View>
        )}
        
        {/* Skills */}
        {content.skills.length > 0 && (
          <View style={techStyles.section}>
            <Text style={techStyles.sectionHeading}>Skills</Text>
            <Text style={{ fontSize: 10, lineHeight: 1.4, color: '#333' }}>{content.skills.join(', ')}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

export function ResumePdfRenderer({ content }: { content: ResumeContent }) {
  // Smart Template Mapping: map modern/impact/innovator to TechMinimalist, else ConsultingClassic
  const isTech = ["modern", "impact", "innovator"].includes(content.template);
  
  if (isTech) {
    return <TechMinimalistPdf content={content} />;
  }
  
  return <ConsultingClassicPdf content={content} />;
}
