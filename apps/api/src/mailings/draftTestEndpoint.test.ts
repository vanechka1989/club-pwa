import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(resolve(__dirname, "../routes/mailings.ts"), "utf-8");
const sharedSource = readFileSync(resolve(__dirname, "../../../../packages/shared/src/index.ts"), "utf-8");

describe("mailing draft test endpoint", () => {
  it("allows sending the current draft to the admin before creating the mailing", () => {
    const draftEndpointIndex = routeSource.indexOf('.post("/test-draft"');
    const savedMailingTestIndex = routeSource.indexOf('.post("/:id/test"');

    expect(draftEndpointIndex).toBeGreaterThan(-1);
    expect(savedMailingTestIndex).toBeGreaterThan(-1);
    expect(draftEndpointIndex).toBeLessThan(savedMailingTestIndex);
    expect(routeSource).toContain("sendDraftMailingTest");
    expect(routeSource).toContain("uploadMailingAttachment(file)");
  });

  it("serializes author information for mailing history", () => {
    expect(sharedSource).toContain("createdBy:");
    expect(routeSource).toContain("createdBy: true");
  });

  it("sends mailing HTML to Telegram using safe HTML parse mode", () => {
    expect(routeSource).toContain("buildTelegramHtml");
    expect(routeSource).toContain("parseMode: \"HTML\"");
    expect(routeSource).toContain("sanitizeTelegramHtml");
  });
});
