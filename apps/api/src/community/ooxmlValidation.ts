import { inflateRawSync } from "node:zlib";

const maxArchiveBytes = 50 * 1024 * 1024;
const maxCentralDirectoryBytes = 2 * 1024 * 1024;
const maxEntries = 512;
const maxControlFileBytes = 2 * 1024 * 1024;
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
    return expanded.byteLength === entry.uncompressedSize ? utf8.decode(expanded) : null;
  } catch {
    return null;
  }
}

type XmlElement = {
  localName: string;
  namespaceUri: string | null;
  attributes: Map<string, string>;
  children: XmlElement[];
};

const xmlName = /^[A-Za-z_][A-Za-z0-9_.:-]*/;

function decodeXmlAttribute(value: string) {
  if (/&(?!#x[0-9a-f]+;|#[0-9]+;|amp;|apos;|gt;|lt;|quot;)/i.test(value)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return null;
  let valid = true;
  const decoded = value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|apos|gt|lt|quot);/gi, (_match, entity: string) => {
    if (entity === "amp") return "&";
    if (entity === "apos") return "'";
    if (entity === "gt") return ">";
    if (entity === "lt") return "<";
    if (entity === "quot") return '"';
    const point = entity.toLowerCase().startsWith("#x") ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    if (!Number.isInteger(point) || point < 1 || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) {
      valid = false;
      return "";
    }
    return String.fromCodePoint(point);
  });
  if (!valid) return null;
  return decoded;
}

function parseXmlDocument(xml: string) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) return null;
  const stack: Array<{ qualifiedName: string; namespaces: Map<string, string>; element: XmlElement }> = [];
  let root: XmlElement | null = null;
  let cursor = xml.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (cursor < xml.length) {
    const open = xml.indexOf("<", cursor);
    if (open < 0) {
      const tail = xml.slice(cursor);
      if ((!stack.length && tail.trim()) || decodeXmlAttribute(tail) === null || tail.includes("]]>")) return null;
      break;
    }
    const text = xml.slice(cursor, open);
    if ((!stack.length && text.trim()) || decodeXmlAttribute(text) === null || text.includes("]]>")) return null;
    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open + 4);
      if (end < 0 || xml.slice(open + 4, end).includes("--")) return null;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", open)) {
      const end = xml.indexOf("?>", open + 2);
      if (end < 0) return null;
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith("<![CDATA[", open)) {
      if (!stack.length) return null;
      const end = xml.indexOf("]]>", open + 9);
      if (end < 0) return null;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<!", open)) return null;

    let quote = "";
    let close = open + 1;
    for (; close < xml.length; close += 1) {
      const character = xml[close]!;
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
    }
    if (close >= xml.length || quote) return null;
    let tag = xml.slice(open + 1, close).trim();
    if (tag.startsWith("/")) {
      const qualifiedName = tag.slice(1).trim();
      const current = stack.pop();
      if (!current || qualifiedName !== current.qualifiedName) return null;
      cursor = close + 1;
      continue;
    }

    const selfClosing = tag.endsWith("/");
    if (selfClosing) tag = tag.slice(0, -1).trimEnd();
    const nameMatch = tag.match(xmlName);
    if (!nameMatch) return null;
    const qualifiedName = nameMatch[0];
    const rawAttributes = new Map<string, string>();
    let rest = tag.slice(qualifiedName.length);
    while (rest.trim()) {
      rest = rest.trimStart();
      const attributeMatch = rest.match(xmlName);
      if (!attributeMatch) return null;
      const name = attributeMatch[0];
      if (rawAttributes.has(name)) return null;
      rest = rest.slice(name.length).trimStart();
      if (!rest.startsWith("=")) return null;
      rest = rest.slice(1).trimStart();
      const attributeQuote = rest[0];
      if (attributeQuote !== '"' && attributeQuote !== "'") return null;
      const attributeEnd = rest.indexOf(attributeQuote, 1);
      if (attributeEnd < 0) return null;
      const value = decodeXmlAttribute(rest.slice(1, attributeEnd));
      if (value === null) return null;
      rawAttributes.set(name, value);
      rest = rest.slice(attributeEnd + 1);
    }

    const namespaces = new Map(stack.at(-1)?.namespaces ?? []);
    for (const [name, value] of rawAttributes) {
      if (name === "xmlns") namespaces.set("", value);
      else if (name.startsWith("xmlns:")) namespaces.set(name.slice(6), value);
    }
    const separator = qualifiedName.indexOf(":");
    const prefix = separator < 0 ? "" : qualifiedName.slice(0, separator);
    const localName = separator < 0 ? qualifiedName : qualifiedName.slice(separator + 1);
    if (separator >= 0 && !namespaces.has(prefix)) return null;
    const element: XmlElement = {
      localName,
      namespaceUri: namespaces.get(prefix) ?? null,
      attributes: rawAttributes,
      children: []
    };
    const parent = stack.at(-1)?.element;
    if (parent) parent.children.push(element);
    else if (root) return null;
    else root = element;
    if (!selfClosing) stack.push({ qualifiedName, namespaces, element });
    cursor = close + 1;
  }
  return stack.length === 0 ? root : null;
}

const packageRelationshipsNamespace = "http://schemas.openxmlformats.org/package/2006/relationships";
const packageContentTypesNamespace = "http://schemas.openxmlformats.org/package/2006/content-types";

function relationshipSource(name: string) {
  if (name === "_rels/.rels") return null;
  const match = name.match(/^(.*\/)?_rels\/([^/]+)\.rels$/);
  if (!match) return undefined;
  return `${match[1] ?? ""}${match[2]}`;
}

function relationshipPart(source: string) {
  const separator = source.lastIndexOf("/");
  const directory = separator < 0 ? "" : source.slice(0, separator + 1);
  const file = separator < 0 ? source : source.slice(separator + 1);
  return `${directory}_rels/${file}.rels`;
}

function resolveRelationshipTarget(source: string | null, target: string) {
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.includes("?") || target.includes("#")) return null;
  const decoded = (() => { try { return decodeURIComponent(target); } catch { return null; } })();
  if (decoded === null || decoded.includes("\\")) return null;
  const base = target.startsWith("/") || !source ? [] : source.split("/").slice(0, -1);
  const segments = [...base];
  for (const segment of decoded.replace(/^\//, "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return null;
      segments.pop();
    } else segments.push(segment);
  }
  return segments.join("/");
}

type ParsedRelationships = { officeDocumentTargets: string[]; targets: string[] };

function parseRelationships(xml: string, source: string | null): ParsedRelationships | null {
  const root = parseXmlDocument(xml);
  if (!root || root.localName !== "Relationships" || root.namespaceUri !== packageRelationshipsNamespace) return null;
  const targets: string[] = [];
  const officeDocumentTargets: string[] = [];
  for (const relationship of root.children) {
    if (relationship.localName !== "Relationship" || relationship.namespaceUri !== packageRelationshipsNamespace) return null;
    const type = relationship.attributes.get("Type");
    const target = relationship.attributes.get("Target");
    const targetMode = relationship.attributes.get("TargetMode")?.trim().toLowerCase();
    if (!type || !target || targetMode && targetMode !== "internal") return null;
    const resolved = resolveRelationshipTarget(source, target);
    if (!resolved) return null;
    targets.push(resolved);
    if (type.endsWith("/relationships/officeDocument")) officeDocumentTargets.push(resolved);
  }
  return { officeDocumentTargets, targets };
}

const disallowedPart = /(?:^|\/)(?:activex|embeddings|customui)(?:\/|$)|\.(?:bin|exe|dll|com|scr|bat|cmd|ps1|js|vbs|jar|html?|svg)$/i;

const officeKinds: Record<string, { mainEntry: string; mainContentType: string; rootName: string; rootNamespace: string }> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    mainEntry: "word/document.xml",
    mainContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    rootName: "document",
    rootNamespace: "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    mainEntry: "xl/workbook.xml",
    mainContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
    rootName: "workbook",
    rootNamespace: "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    mainEntry: "ppt/presentation.xml",
    mainContentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
    rootName: "presentation",
    rootNamespace: "http://schemas.openxmlformats.org/presentationml/2006/main"
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
    if (entries.some((entry) => disallowedPart.test(entry.name))) return false;
    const typesEntry = byName.get("[Content_Types].xml");
    const relsEntry = byName.get("_rels/.rels");
    const mainEntry = byName.get(expected.mainEntry);
    if (!typesEntry || !relsEntry || !mainEntry) return false;
    const [typesXml, relsXml, mainXml] = await Promise.all([
      readEntry(source, typesEntry, centralOffset),
      readEntry(source, relsEntry, centralOffset),
      readEntry(source, mainEntry, centralOffset)
    ]);
    if (!typesXml || !relsXml || !mainXml) return false;

    const typesRoot = parseXmlDocument(typesXml);
    if (!typesRoot || typesRoot.localName !== "Types" || typesRoot.namespaceUri !== packageContentTypesNamespace) return false;
    const matchingOverrides = typesRoot.children.filter((child) => child.localName === "Override"
      && child.namespaceUri === packageContentTypesNamespace
      && child.attributes.get("PartName") === `/${expected.mainEntry}`
      && child.attributes.get("ContentType") === expected.mainContentType);
    if (matchingOverrides.length !== 1 || /macroEnabled|vbaProject/i.test(typesXml)) return false;

    const mainRoot = parseXmlDocument(mainXml);
    if (!mainRoot || mainRoot.localName !== expected.rootName || mainRoot.namespaceUri !== expected.rootNamespace) return false;

    const rootRelationships = parseRelationships(relsXml, null);
    if (!rootRelationships || rootRelationships.officeDocumentTargets.length !== 1 || rootRelationships.officeDocumentTargets[0] !== expected.mainEntry) return false;
    const relationshipTargets = new Map<string | null, string[]>();
    relationshipTargets.set(null, rootRelationships.targets);
    for (const entry of entries) {
      if (!entry.name.endsWith(".rels") || entry.name === "_rels/.rels") continue;
      const relationshipOwner = relationshipSource(entry.name);
      if (typeof relationshipOwner !== "string" || !byName.has(relationshipOwner)) return false;
      const xml = await readEntry(source, entry, centralOffset);
      if (!xml) return false;
      const parsed = parseRelationships(xml, relationshipOwner);
      if (!parsed) return false;
      relationshipTargets.set(relationshipOwner, parsed.targets);
    }

    const reachable = new Set(["[Content_Types].xml", "_rels/.rels"]);
    const queue = [...rootRelationships.targets];
    while (queue.length) {
      const part = queue.shift()!;
      if (reachable.has(part)) continue;
      if (!byName.has(part)) return false;
      reachable.add(part);
      const relPart = relationshipPart(part);
      if (byName.has(relPart)) {
        reachable.add(relPart);
        queue.push(...(relationshipTargets.get(part) ?? []));
      }
    }
    return entries.every((entry) => reachable.has(entry.name));
  } catch {
    return false;
  }
}
