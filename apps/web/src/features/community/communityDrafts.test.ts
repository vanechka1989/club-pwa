import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCommunityDraftsForUser,
  configureCommunityDrafts,
  loadDraft,
  resetCommunityDrafts,
  saveDraft
} from "./communityDrafts";

describe("community topic drafts", () => {
  beforeEach(() => {
    localStorage.clear();
    resetCommunityDrafts();
  });

  it("keeps a separate draft for every topic in the active user and device scope", () => {
    configureCommunityDrafts({ userId: "user-1", deviceId: "device-1", storage: localStorage });

    saveDraft("topic-a", "Первый");
    saveDraft("topic-b", "Второй");

    expect(loadDraft("topic-a")).toBe("Первый");
    expect(loadDraft("topic-b")).toBe("Второй");
  });

  it("does not expose another account or device drafts after an account switch", () => {
    configureCommunityDrafts({ userId: "user-1", deviceId: "device-1", storage: localStorage });
    saveDraft("topic-a", "Только для первого аккаунта");

    configureCommunityDrafts({ userId: "user-2", deviceId: "device-1", storage: localStorage });
    expect(loadDraft("topic-a")).toBe("");

    configureCommunityDrafts({ userId: "user-1", deviceId: "device-2", storage: localStorage });
    expect(loadDraft("topic-a")).toBe("");
  });

  it("fails closed and removes corrupt persisted state", () => {
    localStorage.setItem("club-community-drafts-v1", "{broken");
    configureCommunityDrafts({ userId: "user-1", deviceId: "device-1", storage: localStorage });

    expect(loadDraft("topic-a")).toBe("");
    expect(localStorage.getItem("club-community-drafts-v1")).toBeNull();
  });

  it("removes empty drafts and bounds persisted topics to the 50 newest entries", () => {
    let now = 0;
    configureCommunityDrafts({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      now: () => ++now
    });

    for (let index = 0; index < 51; index += 1) {
      saveDraft(`topic-${index}`, `draft-${index}`);
    }

    expect(loadDraft("topic-0")).toBe("");
    expect(loadDraft("topic-50")).toBe("draft-50");
    saveDraft("topic-50", "");
    expect(loadDraft("topic-50")).toBe("");
    expect(JSON.parse(localStorage.getItem("club-community-drafts-v1") ?? "[]")).toHaveLength(49);
  });

  it("clears only the logged-out user's drafts", () => {
    configureCommunityDrafts({ userId: "user-1", deviceId: "device-1", storage: localStorage });
    saveDraft("topic-a", "Первый");
    configureCommunityDrafts({ userId: "user-2", deviceId: "device-1", storage: localStorage });
    saveDraft("topic-a", "Второй");

    clearCommunityDraftsForUser("user-1", localStorage);

    configureCommunityDrafts({ userId: "user-1", deviceId: "device-1", storage: localStorage });
    expect(loadDraft("topic-a")).toBe("");
    configureCommunityDrafts({ userId: "user-2", deviceId: "device-1", storage: localStorage });
    expect(loadDraft("topic-a")).toBe("Второй");
  });

  it("applies the 50-draft cap independently to each user and device namespace", () => {
    let now = 0;
    configureCommunityDrafts({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      now: () => ++now
    });
    for (let index = 0; index < 50; index += 1) saveDraft(`user-1-topic-${index}`, `first-${index}`);

    configureCommunityDrafts({
      userId: "user-2",
      deviceId: "device-1",
      storage: localStorage,
      now: () => ++now
    });
    for (let index = 0; index < 50; index += 1) saveDraft(`user-2-topic-${index}`, `second-${index}`);

    configureCommunityDrafts({ userId: "user-1", deviceId: "device-1", storage: localStorage });
    expect(loadDraft("user-1-topic-0")).toBe("first-0");
    expect(JSON.parse(localStorage.getItem("club-community-drafts-v1") ?? "[]")).toHaveLength(100);
  });

  it("normalizes oversized valid persisted drafts before exposing them", () => {
    const persisted = Array.from({ length: 52 }, (_, index) => ({
      userId: "user-1",
      deviceId: "device-1",
      topicId: `topic-${index}`,
      text: index === 51 ? "я".repeat(20_001) : `draft-${index}`,
      updatedAt: index
    }));
    localStorage.setItem("club-community-drafts-v1", JSON.stringify(persisted));
    configureCommunityDrafts({ userId: "user-1", deviceId: "device-1", storage: localStorage });

    expect(loadDraft("topic-51")).toHaveLength(20_000);
    expect(loadDraft("topic-0")).toBe("");
    expect(JSON.parse(localStorage.getItem("club-community-drafts-v1") ?? "[]")).toHaveLength(50);
  });
});
