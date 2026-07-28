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
      if (!(error instanceof Error) || !/NoSuchUpload/i.test(error.message)) throw error;
    });
  }
  await dependencies.deleteStaging(record.stagingObjectKey);
  await dependencies.markAborted(record.id);
}

export async function runCommunityUploadExpiryCleanupBatch(limit = 25) {
  const [{ and, asc, eq, inArray, lte, or }, { db }, { communityUploadManifests }, storage] = await Promise.all([
    import("drizzle-orm"),
    import("../db/client"),
    import("../db/schema"),
    import("../storage/s3")
  ]);
  const now = new Date();
  const staleCompletionAt = new Date(now.getTime() - 15 * 60 * 1000);
  const manifests = await db.query.communityUploadManifests.findMany({
    where: and(
      lte(communityUploadManifests.expiresAt, now),
      or(
        inArray(communityUploadManifests.status, ["uploading", "aborting"]),
        and(eq(communityUploadManifests.status, "completing"), lte(communityUploadManifests.updatedAt, staleCompletionAt))
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
        or(
          inArray(communityUploadManifests.status, ["uploading", "aborting"]),
          and(eq(communityUploadManifests.status, "completing"), lte(communityUploadManifests.updatedAt, staleCompletionAt))
        )
      ))
      .returning();
    if (!claimed) continue;
    await cleanupExpiredCommunityUpload({
      ...claimed,
      uploadType: claimed.uploadType as "put" | "multipart"
    }, {
      abortMultipart: storage.abortMultipartUpload,
      deleteStaging: storage.deleteObject,
      markAborted: async (manifestId) => {
        await db.update(communityUploadManifests).set({ status: "aborted", errorCode: null, updatedAt: new Date() })
          .where(eq(communityUploadManifests.id, manifestId));
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
