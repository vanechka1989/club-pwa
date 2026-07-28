import { inflateRawSync } from "node:zlib";

const maxArchiveBytes = 50 * 1024 * 1024;
const maxCentralDirectoryBytes = 2 * 1024 * 1024;
const maxEntries = 512;
const maxControlFileBytes = 1024 * 1024;
const maxExpandedBytes = 200 * 1024 * 1024;
const maxCompressionRatio = 100;

type RangeSource = {
  sizeBytes: number;
  readRange: (start: number, end: number) => Promise<Uint8Array>;
};

type ZipEntry = {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const utf8 = new TextDecoder("utf-8", { fatal: true });

function view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function safePath(name: string) {
  return Boolean(name) && !name.includes("\\") && !name.startsWith("/") && !name.split("/").includes("..");
}

function findEocd(bytes: Uint8Array) {
  const data = view(bytes);
  for (let offset = bytes.byteLength - 22; offset >= 0; offset -= 1) {
    if (data.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

function parseCentralDirectory(bytes: Uint8Array, expectedEntries: number) {
  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  const data = view(bytes);
  let offset = 0;
  let totalExpanded = 0;
  while (offset < bytes.byteLength) {
    if (offset + 46 > bytes.byteLength || data.getUint32(offset, true) !== 0x02014b50) return null;
    const madeBy = data.getUint16(offset + 4, true);
    const flags = data.getUint16(offset + 8, true);
    const method = data.getUint16(offset + 10, true);
    const compressedSize = data.getUint32(offset + 20, true);
    const uncompressedSize = data.getUint32(offset + 24, true);
    const nameLength = data.getUint16(offset + 28, true);
    const extraLength = data.getUint16(offset + 30, true);
    const commentLength = data.getUint16(offset + 32, true);
    const localHeaderOffset = data.getUint32(offset + 42, true);
    const externalAttributes = data.getUint32(offset + 38, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    const unixMode = externalAttributes >>> 16;
    if (
      end > bytes.byteLength ||
      flags & ~0x080e ||
      ![0, 8].includes(method) ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff ||
      (madeBy >>> 8) === 3 && (unixMode & 0xf000) === 0xa000
    ) return null;
    const name = utf8.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (!safePath(name) || names.has(name)) return null;
    if (compressedSize === 0 ? uncompressedSize !== 0 : uncompressedSize / compressedSize > maxCompressionRatio) return null;
    totalExpanded += uncompressedSize;
    if (totalExpanded > maxExpandedBytes) return null;
    names.add(name);
    entries.push({ name, flags, method, compressedSize, uncompressedSize, localHeaderOffset });
    if (entries.length > maxEntries) return null;
    offset = end;
  }
  return entries.length === expectedEntries ? entries : null;
}

async function readEntry(source: RangeSource, entry: ZipEntry, centralOffset: number) {
  if (entry.compressedSize > maxControlFileBytes || entry.uncompressedSize > maxControlFileBytes) return null;
  const header = await source.readRange(entry.localHeaderOffset, entry.localHeaderOffset + 29);
  if (header.byteLength !== 30 || view(header).getUint32(0, true) !== 0x04034b50) return null;
  const headerView = view(header);
  if (headerView.getUint16(6, true) !== entry.flags || headerView.getUint16(8, true) !== entry.method) return null;
  const nameLength = headerView.getUint16(26, true);
  const extraLength = headerView.getUint16(28, true);
  const localNameEnd = entry.localHeaderOffset + 30 + nameLength - 1;
  if (localNameEnd >= centralOffset) return null;
  const localName = nameLength ? await source.readRange(entry.localHeaderOffset + 30, localNameEnd) : new Uint8Array();
  if (utf8.decode(localName) !== entry.name) return null;
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize - 1;
  if (dataStart < 0 || dataStart > centralOffset || dataEnd >= centralOffset || dataEnd >= source.sizeBytes) return null;
  const compressed = entry.compressedSize ? await source.readRange(dataStart, dataEnd) : new Uint8Array();
  if (compressed.byteLength !== entry.compressedSize) return null;
  try {
    const expanded = entry.method === 0
      ? compressed
      : new Uint8Array(inflateRawSync(compressed, { maxOutputLength: maxControlFileBytes }));
    return expanded.byteLength === entry.uncompressedSize ? new TextDecoder().decode(expanded) : null;
  } catch {
    return null;
  }
}

const officeKinds: Record<string, { mainEntry: string; mainContentType: string }> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    mainEntry: "word/document.xml",
    mainContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    mainEntry: "xl/workbook.xml",
    mainContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    mainEntry: "ppt/presentation.xml",
    mainContentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"
  }
};

export async function validateCommunityOoxml(contentType: string, source: RangeSource) {
  const expected = officeKinds[contentType];
  if (!expected || !Number.isInteger(source.sizeBytes) || source.sizeBytes < 22 || source.sizeBytes > maxArchiveBytes) return false;
  try {
    const tailStart = Math.max(0, source.sizeBytes - (65_535 + 22));
    const tail = await source.readRange(tailStart, source.sizeBytes - 1);
    const eocdOffset = findEocd(tail);
    if (eocdOffset < 0) return false;
    const eocd = view(tail);
    const disk = eocd.getUint16(eocdOffset + 4, true);
    const centralDisk = eocd.getUint16(eocdOffset + 6, true);
    const diskEntries = eocd.getUint16(eocdOffset + 8, true);
    const totalEntries = eocd.getUint16(eocdOffset + 10, true);
    const centralSize = eocd.getUint32(eocdOffset + 12, true);
    const centralOffset = eocd.getUint32(eocdOffset + 16, true);
    const commentLength = eocd.getUint16(eocdOffset + 20, true);
    if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries || totalEntries < 3 || totalEntries > maxEntries) return false;
    if (eocdOffset + 22 + commentLength !== tail.byteLength) return false;
    if (centralSize < 46 || centralSize > maxCentralDirectoryBytes || centralOffset + centralSize !== tailStart + eocdOffset) return false;
    const central = await source.readRange(centralOffset, centralOffset + centralSize - 1);
    if (central.byteLength !== centralSize) return false;
    const entries = parseCentralDirectory(central, totalEntries);
    if (!entries) return false;
    const byName = new Map(entries.map((entry) => [entry.name, entry]));
    const typesEntry = byName.get("[Content_Types].xml");
    const relsEntry = byName.get("_rels/.rels");
    if (!typesEntry || !relsEntry || !byName.has(expected.mainEntry)) return false;
    const [typesXml, relsXml] = await Promise.all([
      readEntry(source, typesEntry, centralOffset),
      readEntry(source, relsEntry, centralOffset)
    ]);
    if (!typesXml || !relsXml) return false;
    const escapedMain = expected.mainEntry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedType = expected.mainContentType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const override = new RegExp(`<Override\\b(?=[^>]*\\bPartName\\s*=\\s*["']/${escapedMain}["'])(?=[^>]*\\bContentType\\s*=\\s*["']${escapedType}["'])[^>]*>`, "i");
    const relationship = new RegExp(`<Relationship\\b(?=[^>]*\\bType\\s*=\\s*["'][^"']*relationships/officeDocument["'])(?=[^>]*\\bTarget\\s*=\\s*["']${escapedMain}["'])(?![^>]*\\bTargetMode\\s*=\\s*["']External["'])[^>]*>`, "i");
    return override.test(typesXml) && relationship.test(relsXml);
  } catch {
    return false;
  }
}
