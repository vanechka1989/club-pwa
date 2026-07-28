import { describe, expect, it, vi } from "vitest";
import type { StoredS3Config } from "../storage/s3Config";

vi.mock("../db/client", () => ({ db: {} }));
vi.mock("../env", () => ({ env: {} }));
vi.mock("../logger", () => ({ logger: { warn: vi.fn() } }));
import { createDeleteObjectCopies } from "../storage/s3";
import { createCommunityMediaCleanup, communityMediaCleanupIntervalMs } from "./mediaCleanup";

describe("community media cleanup job", () => {
  it("deletes primary and reserve copies before marking an expired attachment deleted", async () => {
    const attachment = {
      id: "00000000-0000-4000-8000-000000000201",
      objectKey: "community/images/message/photo.webp"
    };
    const calls: string[] = [];
    const config: StoredS3Config = {
      endpoint: "https://primary.example.com",
      region: "ru1",
      bucket: "primary",
      accessKeyId: "primary-access",
      secretAccessKey: "primary-secret",
      publicBaseUrl: null,
      signedUrlTtlSeconds: 600,
      reserve: {
        endpoint: "https://reserve.example.com",
        region: "ru2",
        bucket: "reserve",
        accessKeyId: "reserve-access",
        secretAccessKey: "reserve-secret",
        publicBaseUrl: null
      }
    };
    const cleanup = createCommunityMediaCleanup({
      repository: {
        listExpired: vi.fn(async () => [attachment]),
        markDeleted: vi.fn(async (id) => {
          calls.push(`deleted:${id}`);
        })
      },
      deleteObjectCopies: createDeleteObjectCopies({
        loadConfig: async () => config,
        deleteFromConfig: async (target, key) => {
          calls.push(`${target.bucket}:${key}`);
        }
      }),
      logger: { warn: vi.fn() }
    });

    await expect(cleanup(new Date("2026-07-29T10:00:00.000Z"))).resolves.toBe(1);
    expect(calls).toEqual([
      "primary:community/images/message/photo.webp",
      "reserve:community/images/message/photo.webp",
      `deleted:${attachment.id}`
    ]);
    expect(communityMediaCleanupIntervalMs).toBe(10 * 60 * 1000);
  });
});
