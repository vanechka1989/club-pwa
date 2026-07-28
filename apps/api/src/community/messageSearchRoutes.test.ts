import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(resolve(__dirname, "../routes/community.ts"), "utf8");
const searchSource = readFileSync(resolve(__dirname, "./messageSearch.ts"), "utf8");
const searchRouteSource = routeSource.slice(
  routeSource.indexOf('.get("/messages/search"'),
  routeSource.indexOf('.get("/topics/:topicId/messages/:messageId/context"')
);
const contextRouteSource = routeSource.slice(
  routeSource.indexOf('.get("/topics/:topicId/messages/:messageId/context"'),
  routeSource.indexOf('.get("/topics/:id/messages"')
);

describe("secure community message search routes", () => {
  it("uses parameterized PostgreSQL full-text search and the shared topic access policy", () => {
    expect(searchSource).toContain("to_tsvector('simple'");
    expect(searchSource).toContain("websearch_to_tsquery('simple'");
    expect(searchSource).toContain("isTopicAccessibleForRole");
    expect(searchSource).toContain("deletedByUserAt");
    expect(searchSource).toContain("hasQuarantinedAttachment");
  });

  it("checks membership before search and exact-message context loading", () => {
    expect(routeSource).toContain('.get("/messages/search"');
    expect(routeSource).toContain('.get("/topics/:topicId/messages/:messageId/context"');
    expect(searchRouteSource).toContain("ensureCommunityAccess(c, role)");
    expect(contextRouteSource).toContain("ensureCommunityAccess(c, role)");
    expect(contextRouteSource).toContain("getAccessibleTopic(c.req.param(\"topicId\"), role)");
  });

  it("bounds context windows and returns an inaccessible target as not found", () => {
    expect(routeSource).toContain("messageContextQuerySchema");
    expect(routeSource).toContain('return c.json({ error: "Message not found" }, 404)');
    expect(searchSource).toContain("Math.min(50");
    expect(searchSource).toContain("targetMessageId");
  });

  it("scopes reply previews to safe messages in the same topic before serialization", () => {
    expect(routeSource).toContain("eq(clubChatMessages.topicId, message.topicId)");
    expect(routeSource).toContain("searchableMessageCondition()");
    expect(routeSource).toContain('serializeMessage(message, c.get("userId"), true)');
  });
});
