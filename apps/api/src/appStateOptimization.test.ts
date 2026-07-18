import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  const filePath = resolve(__dirname, relativePath);
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

const indexSource = readSource("index.ts");
const appStateSource = readSource("routes/appState.ts");
const supportSource = readSource("support/unreadCount.ts");
const communitySource = readFileSync(resolve(__dirname, "routes/community.ts"), "utf8");

describe("API request optimization", () => {
  it("serves all lightweight background state through one endpoint", () => {
    expect(indexSource).toContain('app.route("/app-state", appStateRoute)');
    expect(appStateSource).toContain('.get("/", async (c) =>');
    expect(appStateSource).toContain("notificationUnreadCount");
    expect(appStateSource).toContain("supportUnreadCount");
  });

  it("counts unread support tickets in SQL instead of loading every ticket", () => {
    expect(supportSource).toContain("count(supportTickets.id)");
    expect(supportSource).not.toContain("findMany");
  });

  it("loads topic counters and latest replies in batches", () => {
    expect(communitySource).toContain("serializeTopics");
    expect(communitySource).toContain("groupBy(clubChatMessages.topicId)");
    expect(communitySource).not.toContain("Promise.all(topics.map((topic) => serializeTopic(topic, currentUserId)))");
  });
});
