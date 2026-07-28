import { createConnection } from "node:net";

export type ClamAvScanResult = "clean" | "infected" | "unavailable";
const retryableDocumentScanStatuses = ["pending", "failed", "scanning"] as const;

export function shouldRetryCommunityDocumentScan(status: string) {
  return retryableDocumentScanStatuses.includes(status as (typeof retryableDocumentScanStatuses)[number]);
}

const clamAvMaxDocumentBytes = 50 * 1024 * 1024;
const clamAvMaxChunkBytes = 1024 * 1024;
const clamAvResponseMaxBytes = 4096;

export function parseClamAvResponse(response: string): ClamAvScanResult {
  const normalized = response.replace(/\0/g, "").trim();
  if (/:\s+OK$/i.test(normalized)) return "clean";
  if (/\sFOUND$/i.test(normalized)) return "infected";
  return "unavailable";
}

function lengthFrame(length: number) {
  const frame = new Uint8Array(4);
  new DataView(frame.buffer).setUint32(0, length, false);
  return frame;
}

async function* clamAvFrames(chunks: AsyncIterable<Uint8Array>) {
  yield new TextEncoder().encode("zINSTREAM\0");
  let totalBytes = 0;
  for await (const sourceChunk of chunks) {
    for (let offset = 0; offset < sourceChunk.byteLength; offset += clamAvMaxChunkBytes) {
      const chunk = sourceChunk.slice(offset, offset + clamAvMaxChunkBytes);
      totalBytes += chunk.byteLength;
      if (totalBytes > clamAvMaxDocumentBytes) throw new Error("document_too_large");
      yield lengthFrame(chunk.byteLength);
      yield chunk;
    }
  }
  yield lengthFrame(0);
}

type ClamAvExchange = (frames: AsyncIterable<Uint8Array>) => Promise<string>;

export async function scanClamAvChunks(
  chunks: AsyncIterable<Uint8Array>,
  dependencies: { exchange: ClamAvExchange }
): Promise<ClamAvScanResult> {
  try {
    return parseClamAvResponse(await dependencies.exchange(clamAvFrames(chunks)));
  } catch {
    return "unavailable";
  }
}

export function exchangeWithClamAv({
  host,
  port,
  timeoutMs = 60_000
}: {
  host: string;
  port: number;
  timeoutMs?: number;
}): ClamAvExchange {
  return async (frames) => new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host, port });
    const responseChunks: Uint8Array[] = [];
    let responseBytes = 0;
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(new TextDecoder().decode(Buffer.concat(responseChunks)));
    };

    socket.setTimeout(timeoutMs, () => finish(new Error("clamav_timeout")));
    socket.on("error", (error) => finish(error));
    socket.on("data", (chunk: Buffer) => {
      responseBytes += chunk.byteLength;
      if (responseBytes > clamAvResponseMaxBytes) {
        finish(new Error("clamav_response_too_large"));
        return;
      }
      responseChunks.push(chunk);
      if (chunk.includes(0)) finish();
    });
    socket.on("end", () => finish());
    socket.on("connect", () => {
      void (async () => {
        for await (const frame of frames) {
          if (!socket.write(frame)) {
            await new Promise<void>((resume) => socket.once("drain", resume));
          }
        }
      })().catch((error) => finish(error instanceof Error ? error : new Error("clamav_stream_failed")));
    });
  });
}

type DocumentAttachment = { id: string; objectKey: string; contentType: string };
type ScanStatus = "ready" | "rejected" | "failed";

type DocumentScanDependencies = {
  scan: (objectKey: string) => Promise<ClamAvScanResult>;
  mirrorToReserve: (objectKey: string, contentType: string) => Promise<void>;
  deleteCopies: (objectKey: string) => Promise<void>;
  updateStatus: (attachmentId: string, status: ScanStatus, scanError: string | null) => Promise<void>;
};

export async function processCommunityDocumentScan(
  attachment: DocumentAttachment,
  dependencies: DocumentScanDependencies
) {
  const result = await dependencies.scan(attachment.objectKey).catch(() => "unavailable" as const);
  if (result === "infected") {
    try {
      await dependencies.deleteCopies(attachment.objectKey);
    } catch {
      await dependencies.updateStatus(attachment.id, "failed", "malware_cleanup_failed");
      return "unavailable" as const;
    }
    await dependencies.updateStatus(attachment.id, "rejected", "malware_detected");
    return "infected" as const;
  }
  if (result === "unavailable") {
    await dependencies.updateStatus(attachment.id, "failed", "scanner_unavailable");
    return "unavailable" as const;
  }

  try {
    await dependencies.mirrorToReserve(attachment.objectKey, attachment.contentType);
    await dependencies.updateStatus(attachment.id, "ready", null);
    return "clean" as const;
  } catch {
    await dependencies.deleteCopies(attachment.objectKey).catch(() => undefined);
    await dependencies.updateStatus(attachment.id, "failed", "storage_copy_failed");
    return "unavailable" as const;
  }
}

export async function scanCommunityDocumentObject(objectKey: string) {
  const [{ env }, { streamObjectBytes }] = await Promise.all([import("../env"), import("../storage/s3")]);
  const exchange = exchangeWithClamAv({ host: env.CLAMAV_HOST ?? "clamav", port: env.CLAMAV_PORT });
  return scanClamAvChunks(streamObjectBytes(objectKey), { exchange });
}

type ScannerCandidate = DocumentAttachment & { kind: string };

export async function runDocumentScannerBatch(
  attachments: ScannerCandidate[],
  dependencies: {
    claim: (attachmentId: string) => Promise<boolean>;
    process: (attachment: DocumentAttachment) => Promise<unknown>;
  }
) {
  let processed = 0;
  for (const attachment of attachments) {
    if (attachment.kind !== "document" || !(await dependencies.claim(attachment.id))) continue;
    await dependencies.process(attachment);
    processed += 1;
  }
  return processed;
}

export async function runCommunityDocumentScannerBatch(limit = 10) {
  const [drizzle, { db }, { clubMessageAttachments }, storage] = await Promise.all([
    import("drizzle-orm"),
    import("../db/client"),
    import("../db/schema"),
    import("../storage/s3")
  ]);
  const { and, asc, eq, inArray } = drizzle;
  const attachments = await db.query.clubMessageAttachments.findMany({
    where: inArray(clubMessageAttachments.scanStatus, [...retryableDocumentScanStatuses]),
    orderBy: [asc(clubMessageAttachments.createdAt)],
    limit: Math.min(Math.max(limit, 1), 25)
  });

  await runDocumentScannerBatch(attachments, {
    claim: async (attachmentId) => {
      const [claimed] = await db.update(clubMessageAttachments)
        .set({ scanStatus: "scanning", scanError: null })
        .where(and(
          eq(clubMessageAttachments.id, attachmentId),
          inArray(clubMessageAttachments.scanStatus, [...retryableDocumentScanStatuses])
        ))
        .returning({ id: clubMessageAttachments.id });
      return Boolean(claimed);
    },
    process: async (attachment) => processCommunityDocumentScan(attachment, {
      scan: scanCommunityDocumentObject,
      mirrorToReserve: storage.mirrorObjectToReserve,
      deleteCopies: storage.deleteObjectCopies,
      updateStatus: async (attachmentId, status, scanError) => {
        await db.update(clubMessageAttachments)
          .set({ scanStatus: status, scanError, scannedAt: new Date() })
          .where(eq(clubMessageAttachments.id, attachmentId));
      }
    })
  });

  return attachments.length;
}

export function startCommunityDocumentScannerJob(intervalMs = 30_000) {
  let active: Promise<void> | null = null;
  const run = () => {
    if (active) return;
    active = runCommunityDocumentScannerBatch()
      .then(() => undefined)
      .catch(async (error) => (await import("../logger")).logger.warn({ error }, "community document scanner batch failed"))
      .finally(() => { active = null; });
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return {
    stop: async () => {
      clearInterval(timer);
      await active;
    }
  };
}
