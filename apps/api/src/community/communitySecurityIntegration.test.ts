import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { getWriteRateLimitPolicy } from "../security/writeRateLimitPolicy";
import { createPersistentCommunityReadRateLimit } from "../security/persistentCommunityReadRateLimit";
import {
  buildCommunityPendingObjectKey,
  validateCommunityObject,
  validateCommunitySignature,
  validateMultipartCompletion
} from "./directUpload";
import {
  exchangeWithClamAv,
  pingClamAv,
  processCommunityDocumentScan,
  scanClamAvChunks
} from "./documentScanner";
import { canAuthorMutateMessage, authorMutationWindowMs } from "./messageLifecycle";
import { getMessageContentView } from "./messageMetadata";
import { buildSearchExcerpt, isMessageDiscoverable, normalizeSearchLimit } from "./messageSearch";
import { validateMentionRanges } from "./mentions";
import { advanceReadPosition } from "./readState";
import { isTopicAccessibleForRole } from "./topicAccess";
import { createCommunityUploadSessionService } from "./uploadSessions";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const uploadToken = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-07-29T12:00:00.000Z");

function uploadedPdf(owner = userId) {
  return {
    kind: "document" as const,
    uploadToken,
    objectKey: buildCommunityPendingObjectKey({ userId: owner, uploadToken, fileName: "guide.pdf", now }),
    fileName: "guide.pdf",
    contentType: "application/pdf" as const,
    sizeBytes: 9
  };
}

describe("community security integration release gate", () => {
  it("denies cross-topic, cross-message, and cross-object ownership", async () => {
    expect(isTopicAccessibleForRole({ isAdminOnly: true, isPublished: true }, "member")).toBe(false);
    expect(isTopicAccessibleForRole({ isAdminOnly: true, isPublished: true }, "admin")).toBe(true);
    expect(canAuthorMutateMessage({
      userId,
      createdAt: now,
      deletedByUserAt: null
    }, otherUserId, now)).toBe(false);

    const service = createCommunityUploadSessionService({
      loadOwned: async ({ userId: requester }) => requester === userId ? {
        id: "manifest-1",
        userId,
        uploadToken,
        stagingObjectKey: uploadedPdf().objectKey,
        uploadType: "multipart",
        multipartUploadId: "multipart-1",
        expectedPartCount: 1,
        partSizeBytes: 8 * 1024 * 1024,
        expiresAt: new Date(now.getTime() + 60_000),
        status: "uploading"
      } : null,
      claimAbort: async () => null,
      markAborted: async () => undefined,
      listParts: async () => [],
      createPartUrl: async () => "https://storage.test/private-part",
      abortMultipart: async () => undefined,
      deleteStaging: async () => undefined,
      deleteCopies: async () => undefined
    });

    await expect(service.refresh({ userId: otherUserId, uploadToken, now })).rejects.toThrow("foreign_object");
    expect(validateCommunityObject({
      uploaded: uploadedPdf(),
      userId: otherUserId,
      metadata: { key: uploadedPdf().objectKey, contentType: "application/pdf", sizeBytes: 9 },
      leadingBytes: new TextEncoder().encode("%PDF-safe"),
      expiresAt: new Date(now.getTime() + 60_000),
      now,
      consumed: false
    })).toEqual({ ok: false, error: "foreign_object" });
  });

  it("rejects forged mentions, backward reads, duplicate multipart parts, and late edits", () => {
    expect(() => validateMentionRanges("Привет, @Анна", [{
      userId: otherUserId,
      displayName: "Подмена",
      start: 8,
      end: 13
    }])).toThrow("does not match");

    const newer = { messageId: "message-new", createdAt: new Date("2026-07-29T12:01:00.000Z") };
    const older = { messageId: "message-old", createdAt: new Date("2026-07-29T12:00:00.000Z") };
    expect(advanceReadPosition(newer, older)).toBe(newer);
    expect(canAuthorMutateMessage({ userId, createdAt: now, deletedByUserAt: null }, userId,
      new Date(now.getTime() + authorMutationWindowMs))).toBe(true);
    expect(canAuthorMutateMessage({ userId, createdAt: now, deletedByUserAt: null }, userId,
      new Date(now.getTime() + authorMutationWindowMs + 1))).toBe(false);
    expect(validateMultipartCompletion({
      sizeBytes: 8 * 1024 * 1024,
      partSizeBytes: 8 * 1024 * 1024,
      parts: [{ partNumber: 1, etag: "etag-a" }, { partNumber: 1, etag: "etag-b" }]
    })).toEqual({ ok: false, error: "too_many_parts" });
  });

  it("does not leak deleted, hidden, admin-only, quarantined, or executable content", () => {
    const retained = {
      body: "moderator evidence",
      deletedByUserAt: now,
      deletedContentExpiresAt: new Date(now.getTime() + 60_000)
    };
    expect(getMessageContentView(retained, "member", now)).toMatchObject({ body: "Сообщение удалено", revealContent: false });
    expect(getMessageContentView(retained, "admin", now)).toMatchObject({ body: "moderator evidence", revealContent: true });
    expect(getMessageContentView({ ...retained, deletedContentExpiresAt: now }, "admin", now))
      .toMatchObject({ body: "Сообщение удалено", revealContent: false, purged: true });

    const discoverable = (overrides: Partial<Parameters<typeof isMessageDiscoverable>[0]>) => isMessageDiscoverable({
      role: "member",
      topic: { isAdminOnly: false, isPublished: true },
      message: { status: "visible", deletedByUserAt: null },
      hasQuarantinedAttachment: false,
      ...overrides
    });
    expect(discoverable({ topic: { isAdminOnly: true, isPublished: true } })).toBe(false);
    expect(discoverable({ message: { status: "hidden", deletedByUserAt: null } })).toBe(false);
    expect(discoverable({ message: { status: "visible", deletedByUserAt: now } })).toBe(false);
    expect(discoverable({ hasQuarantinedAttachment: true })).toBe(false);
    expect(normalizeSearchLimit(10_000)).toBe(50);
    const excerpt = buildSearchExcerpt('<img src=x onerror="alert(1)"> needle', ["needle"]);
    expect(excerpt).not.toContain("<");
    expect(excerpt).not.toContain(">");
    expect(excerpt.length).toBeLessThanOrEqual(500);

    expect(validateCommunitySignature(uploadedPdf(), new TextEncoder().encode("<html>evil</html>"))).toBe(false);
    expect(validateCommunitySignature(uploadedPdf(), Uint8Array.from([0x4d, 0x5a, 0, 0]))).toBe(false);
    expect(validateCommunitySignature({ ...uploadedPdf(), kind: "image", fileName: "photo.png", contentType: "image/png" },
      new TextEncoder().encode("%PDF-spoof"))).toBe(false);
  });

  it("keeps unavailable or infected documents quarantined and URL-less", async () => {
    const updateStatus = vi.fn(async () => undefined);
    const promoteToFinal = vi.fn(async () => "community/final/guide.pdf");
    const base = {
      id: "manifest-1",
      objectKey: "community/quarantine/user/guide.pdf",
      contentType: "application/pdf"
    };
    await expect(processCommunityDocumentScan(base, {
      scan: async () => "unavailable",
      promoteToFinal,
      mirrorToReserve: async () => undefined,
      deleteCopies: async () => undefined,
      updateStatus
    })).resolves.toBe("unavailable");
    expect(promoteToFinal).not.toHaveBeenCalled();
    expect(updateStatus).toHaveBeenLastCalledWith("manifest-1", "failed", "scanner_unavailable");

    updateStatus.mockClear();
    await expect(processCommunityDocumentScan(base, {
      scan: async () => "infected",
      promoteToFinal,
      mirrorToReserve: async () => undefined,
      deleteCopies: async () => undefined,
      updateStatus
    })).resolves.toBe("infected");
    expect(promoteToFinal).not.toHaveBeenCalled();
    expect(updateStatus.mock.calls).toEqual([
      ["manifest-1", "cleanup_pending", "malware_detected"],
      ["manifest-1", "rejected", "malware_detected"]
    ]);
  });

  it("returns enforceable per-user rate limits with Retry-After", async () => {
    expect(getWriteRateLimitPolicy("POST", "/community/topics/topic/messages")).toEqual({
      scope: "community",
      limit: 60,
      windowMs: 60_000
    });
    const consume = vi.fn(async () => ({ allowed: false, retryAfterSeconds: 17 }));
    const app = new Hono<{ Variables: { userId: string } }>();
    app.use("*", async (c, next) => { c.set("userId", userId); await next(); });
    app.use("*", createPersistentCommunityReadRateLimit(consume));
    app.get("/community/messages/search", (c) => c.json({ ok: true }));
    const response = await app.request("/community/messages/search");
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    await expect(response.json()).resolves.toEqual({ error: "Too many requests", retryAfterSeconds: 17 });
    expect(consume).toHaveBeenCalledWith("search", userId, 30, 60_000);
  });
});

const clamAvHost = process.env.COMMUNITY_CLAMAV_INTEGRATION_HOST;
const clamAvPort = Number(process.env.COMMUNITY_CLAMAV_INTEGRATION_PORT ?? 3310);
const clamAvEnabled = Boolean(clamAvHost && Number.isInteger(clamAvPort));

describe("community ClamAV release gate", () => {
  it("cannot silently skip the real scanner in CI", () => {
    if (process.env.CI === "true") {
      expect(clamAvHost, "COMMUNITY_CLAMAV_INTEGRATION_HOST is required in CI").toBeTruthy();
    }
  });

  it.runIf(clamAvEnabled)("scans clean and EICAR streams through the real clamd protocol", async () => {
    expect(await pingClamAv({ host: clamAvHost!, port: clamAvPort, timeoutMs: 10_000 })).toBe(true);
    const exchange = exchangeWithClamAv({ host: clamAvHost!, port: clamAvPort, timeoutMs: 30_000 });
    async function* bytes(value: string) { yield new TextEncoder().encode(value); }
    await expect(scanClamAvChunks(bytes("clean community document"), { exchange })).resolves.toBe("clean");
    await expect(scanClamAvChunks(bytes(
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    ), { exchange })).resolves.toBe("infected");
  });
});
