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

const contentTypes = (main: string) => `<?xml version="1.0"?><Types><Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const relationships = `<?xml version="1.0"?><Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

describe("OOXML archive validation", () => {
  it("accepts only a bounded DOCX package with the expected root parts and content type", async () => {
    const valid = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("word/document.xml") },
      { name: "_rels/.rels", body: relationships },
      { name: "word/document.xml", body: "<w:document/>" }
    ]);
    const generic = storedZip([{ name: "payload.txt", body: "not office" }]);
    const crossKind = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("xl/workbook.xml") },
      { name: "_rels/.rels", body: relationships },
      { name: "xl/workbook.xml", body: "<workbook/>" }
    ]);

    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(valid))).resolves.toBe(true);
    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(generic))).resolves.toBe(false);
    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(crossKind))).resolves.toBe(false);
  });

  it("rejects encrypted and duplicate OOXML entries", async () => {
    const encrypted = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("word/document.xml"), encrypted: true },
      { name: "_rels/.rels", body: relationships },
      { name: "word/document.xml", body: "<w:document/>" }
    ]);
    const duplicate = storedZip([
      { name: "[Content_Types].xml", body: contentTypes("word/document.xml") },
      { name: "_rels/.rels", body: relationships },
      { name: "word/document.xml", body: "<w:document/>" },
      { name: "word/document.xml", body: "<evil/>" }
    ]);

    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(encrypted))).resolves.toBe(false);
    await expect(validateCommunityOoxml("application/vnd.openxmlformats-officedocument.wordprocessingml.document", dependencies(duplicate))).resolves.toBe(false);
  });
});
