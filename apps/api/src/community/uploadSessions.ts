type UploadSessionRecord = {
  id: string;
  userId: string;
  uploadToken: string;
  stagingObjectKey: string;
  uploadType: "put" | "multipart";
  multipartUploadId: string | null;
  expectedPartCount: number | null;
  partSizeBytes: number | null;
  expiresAt: Date;
  status: string;
  quarantineObjectKey?: string | null;
  finalObjectKey?: string | null;
  consumedAt?: Date | null;
  updatedAt?: Date;
};

type SessionDependencies = {
  loadOwned: (input: { userId: string; uploadToken: string }) => Promise<UploadSessionRecord | null>;
  claimAbort: (input: { userId: string; uploadToken: string }) => Promise<UploadSessionRecord | { alreadyAborted: true } | null>;
  markAborted: (manifestId: string) => Promise<void>;
  listParts: (input: { key: string; uploadId: string }) => Promise<Array<{ partNumber: number; etag: string; sizeBytes: number }>>;
  createPartUrl: (input: { key: string; uploadId: string; partNumber: number; expiresInSeconds: number }) => Promise<string>;
  abortMultipart: (input: { key: string; uploadId: string }) => Promise<void>;
  deleteStaging: (key: string) => Promise<void>;
};

export function createCommunityUploadSessionService(dependencies: SessionDependencies) {
  return {
    async refresh({ userId, uploadToken, now = new Date() }: { userId: string; uploadToken: string; now?: Date }) {
      const record = await dependencies.loadOwned({ userId, uploadToken });
      if (!record) throw new Error("foreign_object");
      if (record.expiresAt <= now) throw new Error("expired_intent");
      if (record.status !== "uploading" || record.uploadType !== "multipart" || !record.multipartUploadId || !record.expectedPartCount || !record.partSizeBytes) {
        throw new Error("object_already_consumed");
      }
      const listed = await dependencies.listParts({ key: record.stagingObjectKey, uploadId: record.multipartUploadId });
      const parts = await Promise.all(Array.from({ length: record.expectedPartCount }, async (_value, index) => ({
        partNumber: index + 1,
        uploadUrl: await dependencies.createPartUrl({
          key: record.stagingObjectKey,
          uploadId: record.multipartUploadId!,
          partNumber: index + 1,
          expiresInSeconds: 600
        })
      })));
      return {
        uploadToken,
        uploadId: record.multipartUploadId,
        partSizeBytes: record.partSizeBytes,
        parts,
        completedParts: listed.map((part) => ({ partNumber: part.partNumber, etag: part.etag })),
        expiresAt: record.expiresAt.toISOString()
      };
    },

    async abort({ userId, uploadToken }: { userId: string; uploadToken: string }) {
      const claimed = await dependencies.claimAbort({ userId, uploadToken });
      if (!claimed) throw new Error("foreign_object");
      if ("alreadyAborted" in claimed) return { ok: true as const };
      await cleanupExpiredCommunityUpload(claimed, {
        abortMultipart: dependencies.abortMultipart,
        deleteStaging: dependencies.deleteStaging,
        markAborted: dependencies.markAborted
      });
      return { ok: true as const };
    }
  };
}

export async function cleanupExpiredCommunityUpload(
  record: UploadSessionRecord,
  dependencies: Pick<SessionDependencies, "abortMultipart" | "deleteStaging" | "markAborted">
) {
  if (record.uploadType === "multipart" && record.multipartUploadId) {
    await dependencies.abortMultipart({ key: record.stagingObjectKey, uploadId: record.multipartUploadId }).catch((error) => {
      if (!isMissingMultipartUpload(error)) throw error;
    });
  }
  await dependencies.deleteStaging(record.stagingObjectKey);
  await dependencies.markAborted(record.id);
}

function isMissingMultipartUpload(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return candidate.name === "NoSuchUpload"
    || candidate.code === "NoSuchUpload"
    || candidate.$metadata?.httpStatusCode === 404
    || typeof candidate.message === "string" && /NoSuchUpload/i.test(candidate.message);
}

const activeCleanupStatuses = new Set(["completing", "processing", "normalizing", "publishing", "scanning"]);
const cleanupStaleMs = 15 * 60 * 1000;

export function isCommunityUploadCleanupCandidate(
  record: Pick<UploadSessionRecord, "status" | "consumedAt" | "expiresAt" | "updatedAt">,
  now = new Date()
) {
  if (record.consumedAt || record.expiresAt > now) return false;
  if (!activeCleanupStatuses.has(record.status)) return record.status !== "aborted";
  return Boolean(record.updatedAt && record.updatedAt <= new Date(now.getTime() - cleanupStaleMs));
}

export async function cleanupUnattachedCommunityUpload(
  record: UploadSessionRecord,
  dependencies: {
    abortMultipart: SessionDependencies["abortMultipart"];
    deleteCopies: (key: string) => Promise<void>;
    markAborted: (manifestId: string) => Promise<void>;
  }
) {
  if (record.uploadType === "multipart" && record.multipartUploadId) {
    await dependencies.abortMultipart({ key: record.stagingObjectKey, uploadId: record.multipartUploadId }).catch((error) => {
      if (!isMissingMultipartUpload(error)) throw error;
    });
  }
  const keys = [...new Set([record.stagingObjectKey, record.quarantineObjectKey, record.finalObjectKey].filter((key): key is string => Boolean(key)))];
  for (const key of keys) await dependencies.deleteCopies(key);
  await dependencies.markAborted(record.id);
}

export async function runCommunityUploadExpiryCleanupBatch(limit = 25) {
  const [{ and, asc, eq, inArray, isNull, lte, or }, { db }, { communityUploadManifests }, storage] = await Promise.all([
    import("drizzle-orm"),
    import("../db/client"),
    import("../db/schema"),
    import("../storage/s3")
  ]);
  const now = new Date();
  const staleWorkAt = new Date(now.getTime() - cleanupStaleMs);
  const immediatelyReclaimable = ["uploading", "aborting", "pending", "ready", "failed", "cleanup_pending", "rejected"];
  const staleWork = ["completing", "processing", "normalizing", "publishing", "scanning"];
  const manifests = await db.query.communityUploadManifests.findMany({
    where: and(
      lte(communityUploadManifests.expiresAt, now),
      isNull(communityUploadManifests.consumedAt),
      or(
        inArray(communityUploadManifests.status, immediatelyReclaimable),
        and(inArray(communityUploadManifests.status, staleWork), lte(communityUploadManifests.updatedAt, staleWorkAt))
      )
    ),
    orderBy: [asc(communityUploadManifests.expiresAt)],
    limit: Math.min(Math.max(1, limit), 50)
  });
  let cleaned = 0;
  for (const manifest of manifests) {
    const [claimed] = await db.update(communityUploadManifests)
      .set({ status: "aborting", updatedAt: now })
      .where(and(
        eq(communityUploadManifests.id, manifest.id),
        isNull(communityUploadManifests.consumedAt),
        lte(communityUploadManifests.expiresAt, now),
        or(
          inArray(communityUploadManifests.status, immediatelyReclaimable),
          and(inArray(communityUploadManifests.status, staleWork), lte(communityUploadManifests.updatedAt, staleWorkAt))
        )
      ))
      .returning();
    if (!claimed) continue;
    await cleanupUnattachedCommunityUpload({
      ...claimed,
      uploadType: claimed.uploadType as "put" | "multipart"
    }, {
      abortMultipart: storage.abortMultipartUpload,
      deleteCopies: storage.deleteObjectCopies,
      markAborted: async (manifestId) => {
        await db.update(communityUploadManifests).set({ status: "aborted", errorCode: "expired_unattached", updatedAt: new Date() })
          .where(and(eq(communityUploadManifests.id, manifestId), eq(communityUploadManifests.status, "aborting"), isNull(communityUploadManifests.consumedAt)));
      }
    });
    cleaned += 1;
  }
  return cleaned;
}

export function startCommunityUploadExpiryCleanupJob(intervalMs = 60_000) {
  let active: Promise<void> | null = null;
  const run = () => {
    if (active) return;
    active = runCommunityUploadExpiryCleanupBatch()
      .then(() => undefined)
      .catch(async (error) => (await import("../logger")).logger.warn({ error }, "community upload expiry cleanup failed"))
      .finally(() => { active = null; });
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return { stop: async () => { clearInterval(timer); await active; } };
}
