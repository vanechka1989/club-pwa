import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(__dirname, "../routes/community.ts"), "utf8");

describe("community media routes", () => {
  it("accepts voice and image multipart messages with existing access checks", () => {
    expect(route).toContain('.post("/topics/:id/messages/voice"');
    expect(route).toContain('.post("/topics/:id/messages/images"');
    expect(route).toContain("getCommunityMediaExpiry(role");
    expect(route).toContain("validateCommunityImageFiles(files)");
    expect(route).toContain("durationSeconds > 300");
    expect(route).toContain("await deleteCommunityObjectCopiesConvergently(plan.key)");
    expect(route).toContain("enqueueCommunityMessageDeletion(message.id)");
  });

  it("creates and consumes direct-upload media through the canonical topic message route", () => {
    expect(route).toContain('.post("/topics/:id/messages/uploads"');
    expect(route).not.toContain('.post("/messages/:id/uploads"');
    const endpoint = route.slice(route.indexOf('.post("/topics/:id/messages/uploads"'), route.indexOf('.get("/events"'));
    expect(endpoint).toContain("getActiveMute");
    expect(endpoint).toContain("isTopicAccessibleForRole");
    expect(endpoint).toContain("topic.isLocked");
    expect(endpoint).toContain("validateLockedReply");
    expect(endpoint).toContain("getCommunityMediaExpiry(role)");
    expect(endpoint).toContain("deriveCommunityUploadMessage");
    expect(endpoint).toContain("serializeMessage");
    expect(endpoint).toContain("database.transaction");
  });

  it("publishes legacy voice and image bodies through the same per-target attachment fence", () => {
    expect(route.match(/sourceType: "attachment"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(route).toContain("uploadObjectStream({");
    expect(route).toContain("mirrorObjectToReserve(plan.key");
    expect(route).toContain("publishCommunityObjectGroup({");
    expect(route).toContain("if (attachments.length !== plans.length) throw new Error(\"attachment_publish_terminal\")");
    expect(route).not.toContain("await uploadObject({ key");
  });
});
