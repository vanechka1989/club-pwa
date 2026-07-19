import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getS3DeletionAuditKey, hasS3DeletionSource, mergeS3DeletionSource } from "./s3DeletionAudit";
import { createFallbackS3ObjectSource } from "../storage/s3ObjectSource";

const adminRoute = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");

describe("S3 deletion audit metadata", () => {
  it("reads keys from old metadata and falls back to the audit entity id", () => {
    expect(getS3DeletionAuditKey({
      action: "storage.s3.object.deleted",
      entityId: "fallback.webp",
      metadata: { key: "learning/photo/photo.webp" }
    })).toBe("learning/photo/photo.webp");
    expect(getS3DeletionAuditKey({
      action: "storage.s3.object.deleted",
      entityId: "community/voice/voice.webm",
      metadata: {}
    })).toBe("community/voice/voice.webm");
    expect(getS3DeletionAuditKey({ action: "storage.s3.updated", entityId: "storage", metadata: {} })).toBeNull();
  });

  it("recognizes and merges a durable source snapshot", () => {
    const source = createFallbackS3ObjectSource("learning/video/video.mp4");
    const metadata = mergeS3DeletionSource({ key: "learning/video/video.mp4", retained: true }, source);

    expect(metadata).toEqual({ key: "learning/video/video.mp4", retained: true, source });
    expect(hasS3DeletionSource(metadata)).toBe(true);
    expect(hasS3DeletionSource({ source: { category: "learning" } })).toBe(false);
  });

  it("resolves every supported linked entity in one server-side metadata pass", () => {
    expect(adminRoute).toContain("db.query.contentItems.findMany");
    expect(adminRoute).toContain("db.query.lessonMaterials.findMany");
    expect(adminRoute).toContain("db.query.clubMessageAttachments.findMany");
    expect(adminRoute).toContain("db.query.supportTicketAttachments.findMany");
    expect(adminRoute).toContain("db.query.appNotifications.findMany");
    expect(adminRoute).toContain("db.query.adminMailings.findMany");
  });

  it("captures the source before deletion and enriches historical settings audit rows", () => {
    const deleteStart = adminRoute.indexOf('.delete("/storage/s3/objects"');
    const deleteEnd = adminRoute.indexOf('.get("/stats"', deleteStart);
    const deleteBlock = adminRoute.slice(deleteStart, deleteEnd);
    expect(deleteBlock.indexOf("buildS3ObjectMetadata")).toBeGreaterThan(-1);
    expect(deleteBlock.indexOf("buildS3ObjectMetadata")).toBeLessThan(deleteBlock.indexOf("deleteObject"));
    expect(deleteBlock).toContain("mergeS3DeletionSource");

    const auditStart = adminRoute.indexOf('.get("/settings-audit"');
    const auditEnd = adminRoute.indexOf('.post("/project-settings"', auditStart);
    const auditBlock = adminRoute.slice(auditStart, auditEnd);
    expect(auditBlock).toContain("getS3DeletionAuditKey");
    expect(auditBlock).toContain("buildS3ObjectMetadata");
    expect(auditBlock).toContain("mergeS3DeletionSource");
  });
});
