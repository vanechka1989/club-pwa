import { describe, expect, it, vi } from "vitest";
import { verifyUploadedObjectMetadata } from "./directUploadVerification";

describe("verifyUploadedObjectMetadata", () => {
  const expected = {
    objectKey: "learning/audio/2026-07-19/test.mp3",
    contentType: "audio/mpeg",
    sizeBytes: 10_213_978
  };

  it("accepts an object visible immediately", async () => {
    const loadMetadata = vi.fn().mockResolvedValue({
      key: expected.objectKey,
      contentType: expected.contentType,
      sizeBytes: expected.sizeBytes
    });

    await expect(verifyUploadedObjectMetadata({ expected, loadMetadata })).resolves.toEqual({
      ok: true,
      metadata: {
        key: expected.objectKey,
        contentType: expected.contentType,
        sizeBytes: expected.sizeBytes
      }
    });
    expect(loadMetadata).toHaveBeenCalledTimes(1);
  });

  it("retries while a completed multipart object is not visible yet", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const loadMetadata = vi
      .fn()
      .mockRejectedValueOnce(new Error("NoSuchKey"))
      .mockRejectedValueOnce(new Error("NotFound"))
      .mockResolvedValue({ key: expected.objectKey, contentType: expected.contentType, sizeBytes: expected.sizeBytes });

    await expect(
      verifyUploadedObjectMetadata({ expected, loadMetadata, retryDelaysMs: [120, 300, 700], wait })
    ).resolves.toMatchObject({ ok: true });
    expect(loadMetadata).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenNthCalledWith(1, 120);
    expect(wait).toHaveBeenNthCalledWith(2, 300);
  });

  it("returns a precise reason after persistent metadata mismatch", async () => {
    const loadMetadata = vi.fn().mockResolvedValue({
      key: expected.objectKey,
      contentType: expected.contentType,
      sizeBytes: expected.sizeBytes - 1
    });

    await expect(
      verifyUploadedObjectMetadata({ expected, loadMetadata, retryDelaysMs: [], wait: vi.fn() })
    ).resolves.toEqual({
      ok: false,
      reason: "SIZE_MISMATCH",
      detail: `S3 reports ${expected.sizeBytes - 1} bytes, client reports ${expected.sizeBytes} bytes`
    });
  });
});
