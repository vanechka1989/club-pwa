import { describe, expect, it } from "vitest";
import { validateCommunityOoxml } from "./ooxmlValidation";

const encoder = new TextEncoder();

function u16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function storedZip(entries: Array<{ name: string; body: string; encrypted?: boolean }>) {
  const local: number[] = [];
  const central: number[] = [];
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const body = encoder.encode(entry.body);
    const offset = local.length;
    const flags = entry.encrypted ? 1 : 0;
    local.push(...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(body.length), ...u32(body.length), ...u16(name.length), ...u16(0), ...name, ...body);
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(flags), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(body.length), ...u32(body.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name);
  }
  const centralOffset = local.length;
  return new Uint8Array([
    ...local,
    ...central,
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(central.length), ...u32(centralOffset), ...u16(0)
  ]);
}

function dependencies(bytes: Uint8Array) {
  return {
    sizeBytes: bytes.byteLength,
    readRange: async (start: number, end: number) => bytes.slice(start, end + 1)
  };
}

const contentTypes = (main: string, mainType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml") => `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${main}" ContentType="${mainType}"/></Types>`;
const relationships = (target = "word/document.xml", extra = "") => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${target}"/>${extra}</Relationships>`;
const documentXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`;

describe("OOXML archive validation", () => {
  it("accepts only a bounded DOCX package with the expected root parts and content type", async () => {
    const valid = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("word/document.xml") },
      { name: "_rels/.rels", body: relationships() },
      { name: "word/document.xml", body: documentXml }
    ]);
    const generic = storedZip([{ name: "payload.txt", body: "not office" }]);
    const crossKind = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("xl/workbook.xml") },
      { name: "_rels/.rels", body: relationships("xl/workbook.xml") },
      { name: "xl/workbook.xml", body: "<workbook/>" }
    ]);

    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(valid))).resolves.toBe(true);
    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(generic))).resolves.toBe(false);
    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(crossKind))).resolves.toBe(false);
  });

  it("validates the declared main root for each supported OOXML kind", async () => {
    const xlsx = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml") },
      { name: "_rels/.rels", body: relationships("xl/workbook.xml") },
      { name: "xl/workbook.xml", body: `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>` }
    ]);
    const pptx = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml") },
      { name: "_rels/.rels", body: relationships("ppt/presentation.xml") },
      { name: "ppt/presentation.xml", body: `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>` }
    ]);

    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", dependencies(xlsx))).resolves.toBe(true);
    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.presentationml.presentation", dependencies(pptx))).resolves.toBe(true);
    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(xlsx))).resolves.toBe(false);
  });

  it("rejects encrypted and duplicate OOXML entries", async () => {
    const encrypted = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("word/document.xml"), encrypted: true },
      { name: "_rels/.rels", body: relationships() },
      { name: "word/document.xml", body: documentXml }
    ]);
    const duplicate = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("word/document.xml") },
      { name: "_rels/.rels", body: relationships() },
      { name: "word/document.xml", body: documentXml },
      { name: "word/document.xml", body: "<evil/>" }
    ]);

    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(encrypted))).resolves.toBe(false);
    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(duplicate))).resolves.toBe(false);
  });

  it("rejects commented fake control tags and malformed or non-XML main parts", async () => {
    const commented = storedZip([
      { name: "[Content_Types].xml", body: `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><!-- <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/> --></Types>` },
      { name: "_rels/.rels", body: relationships() },
      { name: "word/document.xml", body: documentXml }
    ]);
    const nonXmlMain = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("word/document.xml") },
      { name: "_rels/.rels", body: relationships() },
      { name: "word/document.xml", body: "MZ-not-xml" }
    ]);
    const malformedMain = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("word/document.xml") },
      { name: "_rels/.rels", body: relationships() },
      { name: "word/document.xml", body: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body></w:document>` }
    ]);
    const commentedRelationship = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("word/document.xml") },
      { name: "_rels/.rels", body: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><!-- <Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/> --></Relationships>` },
      { name: "word/document.xml", body: documentXml }
    ]);

    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(commented))).resolves.toBe(false);
    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(nonXmlMain))).resolves.toBe(false);
    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(malformedMain))).resolves.toBe(false);
    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(commentedRelationship))).resolves.toBe(false);
  });

  it("rejects unreferenced payloads, external relationships, macros, and cross-kind roots", async () => {
    const unreferenced = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("word/document.xml") },
      { name: "_rels/.rels", body: relationships() },
      { name: "word/document.xml", body: documentXml },
      { name: "payload.txt", body: "unreferenced" }
    ]);
    const external = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("word/document.xml") },
      { name: "_rels/.rels", body: relationships("word/document.xml", `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://evil.test" TargetMode="External"/>`) },
      { name: "word/document.xml", body: documentXml }
    ]);
    const macro = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("word/document.xml") },
      { name: "_rels/.rels", body: relationships() },
      { name: "word/document.xml", body: documentXml },
      { name: "word/vbaProject.bin", body: "macro" }
    ]);
    const crossKind = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("word/document.xml") },
      { name: "_rels/.rels", body: relationships() },
      { name: "word/document.xml", body: `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>` }
    ]);

    for (const archive of [unreferenced, external, macro, crossKind]) {
      await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(archive))).resolves.toBe(false);
    }
  });

  it("rejects an internally related HTML aFChunk hidden behind a neutral extension", async () => {
    const archive = storedZip([
      {
        name: "[Content_Types].xml",
        body: `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/chunk.dat" ContentType="text/html"/></Types>`
      },
      { name: "_rels/.rels", body: relationships() },
      { name: "word/document.xml", body: documentXml },
      {
        name: "word/_rels/document.xml.rels",
        body: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="chunk.dat"/></Relationships>`
      },
      { name: "word/chunk.dat", body: "<html><script>alert(1)</script></html>" }
    ]);

    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(archive))).resolves.toBe(false);
  });
});
