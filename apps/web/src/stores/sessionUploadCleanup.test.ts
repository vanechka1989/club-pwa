import type { ClubUser } from "@club/shared";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const uploadToken = "22222222-2222-4222-8222-222222222222";
const events: string[] = [];
const user: ClubUser = {
  id: userId,
  telegramId: "member@example.com",
  email: "member@example.com",
  firstName: "Иван",
  username: null,
  photoUrl: null,
  role: "member",
  realRole: "member",
  adminRoleLabel: null,
  adminPermissions: [],
  membershipStatus: "active",
  membershipExpiresAt: null,
  paymentType: "manual",
  recurrentPaymentStatus: null,
  nextPaymentAt: null,
  avatarPositionX: 50,
  avatarPositionY: 50,
  avatarScale: 1,
  avatarRefreshedAt: null
};

const api = vi.hoisted(() => ({
  logoutSession: vi.fn(async () => { events.push("logout"); }),
  getMe: vi.fn(async () => ({ user }))
}));

vi.mock("@/api/startup", () => ({
  createCheckout: vi.fn(),
  getMe: api.getMe,
  logoutSession: api.logoutSession,
  requestEmailCode: vi.fn(),
  updateAvatarDisplay: vi.fn(),
  updateDisplayName: vi.fn(),
  uploadAvatar: vi.fn(),
  verifyEmailCode: vi.fn()
}));
vi.mock("@/features/app/acquisitionTracking", () => ({ getAcquisitionVisitorId: vi.fn(() => null) }));
vi.mock("@/features/community/communityDrafts", () => ({ clearCommunityDraftsForUser: vi.fn() }));
vi.mock("@/features/community/communityOutbox", () => ({ clearCommunityOutboxForUser: vi.fn() }));

import {
  clearCommunityUploadSessions,
  describeCommunityFile,
  uploadCommunityFile
} from "@/features/community/directUpload";
import { useSessionStore } from "./session";

function file() {
  return {
    name: "photo.png",
    type: "image/png",
    size: 10,
    lastModified: 1,
    slice: () => new Blob()
  } as File;
}

describe("session upload capability cleanup", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    clearCommunityUploadSessions(localStorage);
    events.length = 0;
    vi.clearAllMocks();
  });

  it("retries upload cleanup before revoking the session and never persists its bearer token", async () => {
    const selected = file();
    const abortUpload = vi.fn()
      .mockImplementationOnce(async () => { events.push("abort-1"); throw new Error("offline"); })
      .mockImplementationOnce(async () => { events.push("abort-2"); return { ok: true }; });
    await uploadCommunityFile(selected, {
      createIntent: async (input) => ({
        ...input,
        uploadType: "put",
        uploadToken,
        objectKey: "community/pending/photo.png",
        uploadUrl: "https://s3.test/put",
        expiresAt: "2099-07-29T12:10:00.000Z"
      }),
      putObject: async () => undefined,
      completePut: async () => ({ ...describeCommunityFile(selected), uploadToken, objectKey: "community/final/photo.png" }),
      completeMultipart: async () => { throw new Error("unused"); },
      refreshMultipart: async () => { throw new Error("unused"); },
      abortUpload,
      storage: localStorage
    }, { userId });
    const session = useSessionStore();
    await session.load();

    await session.logout();

    expect(events).toEqual(["abort-1", "abort-2", "logout"]);
    expect(session.user).toBeNull();
    expect(localStorage.getItem("club-community-multipart-sessions") ?? "").not.toContain(uploadToken);
    expect(JSON.stringify(localStorage)).not.toContain(uploadToken);
  });
});
