import { createConnection } from "node:net";

export type ClamAvScanResult = "clean" | "infected" | "unavailable";
const immediatelyRetryableDocumentScanStatuses = ["pending", "failed", "cleanup_pending"] as const;
const documentScanLeaseMs = 15 * 60 * 1000;

export function shouldRetryCommunityDocumentScan(status: string, updatedAt = new Date(0), now = new Date()) {
  if (immediatelyRetryableDocumentScanStatuses.includes(status as (typeof immediatelyRetryableDocumentScanStatuses)[number])) return true;
  return status === "scanning" && updatedAt <= new Date(now.getTime() - documentScanLeaseMs);
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

export async function pingClamAv({
  host,
  port,
  timeoutMs = 1_500
}: {
  host: string;
  port: number;
  timeoutMs?: number;
}) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port });
    let response = "";
    let settled = false;
    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(available);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.on("error", () => finish(false));
    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("ascii");
      if (response.length > 64) return finish(false);
      if (response.includes("\0") || /PONG/i.test(response)) finish(/^PONG\0?$/i.test(response.trim()));
    });
    socket.on("end", () => finish(/^PONG\0?$/i.test(response.trim())));
    socket.on("connect", () => socket.write("zPING\0"));
  });
}

export function summarizeCommunityDocumentScannerHealth({
  available,
  queued,
  failed,
  cleanupPending
}: {
  available: boolean;
  queued: number;
  failed: number;
  cleanupPending: number;
}) {
  const status: "error" | "warning" | "healthy" = !available ? "error" : failed > 0 || cleanupPending > 0 ? "warning" : "healthy";
  return {
    id: "document_scanner" as const,
    label: "Проверка документов",
    status,
    detail: `ClamAV ${available ? "доступен" : "недоступен"}. В очереди: ${queued}, ошибок: ${failed}, очистка: ${cleanupPending}.`
  };
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

type DocumentAttachment = {
  id: string;
  objectKey: string;
  contentType: string;
  status?: string;
  userId?: string;
  uploadToken?: string;
  fileName?: string;
};
type ScanStatus = "ready" | "rejected" | "failed" | "cleanup_pending";

type DocumentScanDependencies = {
  scan: (objectKey: string) => Promise<ClamAvScanResult>;
  promoteToFinal: (objectKey: string, contentType: string) => Promise<string>;
  mirrorToReserve: (objectKey: string, contentType: string) => Promise<void>;
  deleteCopies: (objectKey: string) => Promise<void>;
  updateStatus: (attachmentId: string, status: ScanStatus, scanError: string | null, finalObjectKey?: string) => Promise<void>;
};

export async function processCommunityDocumentScan(
  attachment: DocumentAttachment,
  dependencies: DocumentScanDependencies
) {
  if (attachment.status === "cleanup_pending") {
    try {
      await dependencies.deleteCopies(attachment.objectKey);
      await dependencies.updateStatus(attachment.id, "rejected", "malware_detected");
      return "infected" as const;
    } catch {
      await dependencies.updateStatus(attachment.id, "cleanup_pending", "malware_cleanup_failed");
      return "unavailable" as const;
    }
  }
  const result = await dependencies.scan(attachment.objectKey).catch(() => "unavailable" as const);
  if (result === "infected") {
    await dependencies.updateStatus(attachment.id, "cleanup_pending", "malware_detected");
    try {
      await dependencies.deleteCopies(attachment.objectKey);
    } catch {
      await dependencies.updateStatus(attachment.id, "cleanup_pending", "malware_cleanup_failed");
      return "unavailable" as const;
    }
    await dependencies.updateStatus(attachment.id, "rejected", "malware_detected");
    return "infected" as const;
  }
  if (result === "unavailable") {
    await dependencies.updateStatus(attachment.id, "failed", "scanner_unavailable");
    return "unavailable" as const;
  }

  let statusAttempted = false;
  try {
    const finalObjectKey = await dependencies.promoteToFinal(attachment.objectKey, attachment.contentType);
    await dependencies.mirrorToReserve(finalObjectKey, attachment.contentType);
    statusAttempted = true;
    await dependencies.updateStatus(attachment.id, "ready", null, finalObjectKey);
    await dependencies.deleteCopies(attachment.objectKey).catch(() => undefined);
    return "clean" as const;
  } catch {
    if (statusAttempted) throw new Error("scanner_status_reconciliation_required");
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

export function loadCommunityDocumentScannerCandidates<T>(
  requestedLimit: number,
  list: (boundedLimit: number) => Promise<T[]>
) {
  return list(Math.min(Math.max(requestedLimit, 1), 25));
}

export async function runCommunityDocumentScannerBatch(limit = 10) {
  const [drizzle, { db }, { clubMessageAttachments, communityUploadManifests }, storage] = await Promise.all([
    import("drizzle-orm"),
    import("../db/client"),
    import("../db/schema"),
    import("../storage/s3")
  ]);
  const { and, asc, eq, inArray, isNotNull, lte, or } = drizzle;
  const now = new Date();
  const staleScanAt = new Date(now.getTime() - documentScanLeaseMs);
  const manifests = await loadCommunityDocumentScannerCandidates(limit, (boundedLimit) =>
    db.query.communityUploadManifests.findMany({
      where: and(
        eq(communityUploadManifests.kind, "document"),
        isNotNull(communityUploadManifests.attachmentId),
        or(
          inArray(communityUploadManifests.status, [...immediatelyRetryableDocumentScanStatuses]),
          and(eq(communityUploadManifests.status, "scanning"), lte(communityUploadManifests.updatedAt, staleScanAt))
        )
      ),
      orderBy: [asc(communityUploadManifests.createdAt)],
      limit: boundedLimit
    })
  );

  const candidates = manifests.flatMap((manifest) => manifest.quarantineObjectKey ? [{
    id: manifest.id,
    kind: manifest.kind,
    objectKey: manifest.quarantineObjectKey,
    contentType: manifest.contentType,
    status: manifest.status,
    userId: manifest.userId,
    uploadToken: manifest.uploadToken,
    fileName: manifest.fileName
  }] : []);
  const claimStates = new Map<string, { status: string; updatedAt: Date }>();
  await runDocumentScannerBatch(candidates, {
    claim: async (manifestId) => {
      const claimedAt = new Date();
      const [claimed] = await db.update(communityUploadManifests)
        .set({ status: "scanning", errorCode: null, updatedAt: claimedAt })
        .where(and(
          eq(communityUploadManifests.id, manifestId),
          isNotNull(communityUploadManifests.attachmentId),
          or(
            inArray(communityUploadManifests.status, [...immediatelyRetryableDocumentScanStatuses]),
            and(eq(communityUploadManifests.status, "scanning"), lte(communityUploadManifests.updatedAt, staleScanAt))
          )
        ))
        .returning({ id: communityUploadManifests.id, updatedAt: communityUploadManifests.updatedAt });
      if (claimed) claimStates.set(manifestId, { status: "scanning", updatedAt: claimed.updatedAt });
      return Boolean(claimed);
    },
    process: async (manifest) => processCommunityDocumentScan(manifest, {
      scan: scanCommunityDocumentObject,
      promoteToFinal: async (sourceKey, contentType) => {
        if (!manifest.userId || !manifest.uploadToken || !manifest.fileName) throw new Error("invalid_document_manifest");
        const { buildCommunityFinalObjectKey } = await import("./directUpload");
        const finalObjectKey = buildCommunityFinalObjectKey({
          userId: manifest.userId,
          uploadToken: manifest.uploadToken,
          fileName: manifest.fileName
        });
        const metadata = await storage.getObjectMetadata(sourceKey);
        if (!metadata.etag || metadata.contentType !== contentType) throw new Error("document_promotion_mismatch");
        await storage.promoteObjectVersion({ sourceKey, destinationKey: finalObjectKey, expectedETag: metadata.etag, contentType });
        const promoted = await storage.getObjectMetadata(finalObjectKey);
        if (promoted.sizeBytes !== metadata.sizeBytes || promoted.contentType !== contentType) throw new Error("document_promotion_mismatch");
        return finalObjectKey;
      },
      mirrorToReserve: storage.mirrorObjectToReserve,
      deleteCopies: storage.deleteObjectCopies,
      updateStatus: async (manifestId, status, scanError, finalObjectKey) => {
        await db.transaction(async (transaction) => {
          const database = transaction as unknown as typeof db;
          const expectedClaim = claimStates.get(manifestId);
          if (!expectedClaim) throw new Error("scanner_claim_lost");
          const current = await database.query.communityUploadManifests.findFirst({
            where: eq(communityUploadManifests.id, manifestId)
          });
          const updatedAt = new Date();
          const [updated] = await database.update(communityUploadManifests)
            .set({
              status,
              errorCode: scanError,
              finalObjectKey: status === "ready" ? finalObjectKey : undefined,
              quarantineObjectKey: status === "ready" ? null : undefined,
              result: current?.result && typeof current.result === "object"
                ? {
                    ...current.result,
                    scanStatus: status === "cleanup_pending" ? "failed" : status,
                    objectKey: status === "ready" ? finalObjectKey : manifest.objectKey
                  }
                : current?.result,
              updatedAt
            })
            .where(and(
              eq(communityUploadManifests.id, manifestId),
              eq(communityUploadManifests.status, expectedClaim.status),
              eq(communityUploadManifests.updatedAt, expectedClaim.updatedAt)
            ))
            .returning({ attachmentId: communityUploadManifests.attachmentId, updatedAt: communityUploadManifests.updatedAt });
          if (!updated) throw new Error("scanner_claim_lost");
          claimStates.set(manifestId, { status, updatedAt: updated.updatedAt });
          if (updated?.attachmentId) {
            await database.update(clubMessageAttachments)
              .set({
                scanStatus: status === "cleanup_pending" ? "failed" : status,
                scanError,
                scannedAt: new Date(),
                objectKey: status === "ready" ? finalObjectKey : undefined
              })
              .where(eq(clubMessageAttachments.id, updated.attachmentId));
          }
        });
      }
    })
  });

  return manifests.length;
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
