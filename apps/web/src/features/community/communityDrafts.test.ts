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
});
