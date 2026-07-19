import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(resolve(__dirname, "../routes/mailings.ts"), "utf-8");
const notificationSource = readFileSync(resolve(__dirname, "../notifications/create.ts"), "utf-8");
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

  it("sends mailing HTML as an app/PWA notification without Telegram delivery", () => {
    expect(routeSource).toContain("createAppNotification");
    expect(routeSource).toContain("source: \"mailing_test\"");
    expect(routeSource).toContain("bodyHtml");
    expect(routeSource).not.toContain("sendTelegram");
    expect(routeSource).not.toContain("parseMode: \"HTML\"");
    expect(routeSource).toContain("resolveMailingText");
    expect(notificationSource).toContain("bodyHtml: input.bodyHtml ?? null");
    expect(notificationSource).toContain("body: input.body");
    expect(notificationSource).not.toContain("body: input.bodyHtml");
  });
});
