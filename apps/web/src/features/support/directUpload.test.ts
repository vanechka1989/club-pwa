import { describe, expect, it } from "vitest";
import { getSupportFilesError, putSupportObject, resolveSupportUploadUrl, uploadSupportAttachments } from "./directUpload";

describe("support direct upload", () => {
  it("creates an intent, uploads to S3, and returns the finalization reference", async () => {
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
    const calls: string[] = [];

    const uploaded = await uploadSupportAttachments([file], {
      createIntent: async (input) => {
        calls.push(`intent:${input.fileName}:${input.contentType}:${input.sizeBytes}`);
        return {
          uploadUrl: "https://s3.example/upload",
          objectKey: "support/pending/user/date/token-clip.mp4",
          uploadToken: "22222222-2222-4222-8222-222222222222",
          contentType: "video/mp4",
          sizeBytes: 5,
          expiresAt: "2026-07-27T10:10:00.000Z"
        };
      },
      putObject: async (url, body, contentType) => {
        calls.push(`put:${url}:${body.name}:${contentType}`);
      }
    });

    expect(calls).toEqual([
      "intent:clip.mp4:video/mp4:5",
      "put:https://s3.example/upload:clip.mp4:video/mp4"
    ]);
    expect(uploaded).toEqual([{
      objectKey: "support/pending/user/date/token-clip.mp4",
      uploadToken: "22222222-2222-4222-8222-222222222222",
      fileName: "clip.mp4",
      contentType: "video/mp4",
      sizeBytes: 5
    }]);
  });

  it("enforces four files, 50 MiB each, and 100 MiB total before requesting an intent", () => {
    const file = (size: number) => ({ name: "clip.mp4", type: "video/mp4", size });
    expect(getSupportFilesError([file(50 * 1024 * 1024)])).toBeNull();
    expect(getSupportFilesError([file(50 * 1024 * 1024 + 1)])).toBe("file_too_large");
    expect(getSupportFilesError([file(40 * 1024 * 1024), file(40 * 1024 * 1024), file(40 * 1024 * 1024)])).toBe("total_too_large");
    expect(getSupportFilesError(Array.from({ length: 5 }, () => file(1)))).toBe("too_many_files");
  });

  it("rejects unsupported file types", () => {
    expect(getSupportFilesError([{ name: "document.pdf", type: "application/pdf", size: 10 }])).toBe("unsupported_type");
  });

  it("keeps API authentication headers and cookies on the same-origin stream", async () => {
    localStorage.setItem("club-preview-mode", "admin");
    let observed: RequestInit | undefined;
    await putSupportObject("https://club.example/api/support/uploads/token", new File(["x"], "x.png", { type: "image/png" }), "image/png", async (_input, init) => {
      observed = init;
      return new Response(null, { status: 200 });
    });

    expect(observed?.credentials).toBe("include");
    const headers = new Headers(observed?.headers);
    expect(headers.get("Content-Type")).toBe("image/png");
    expect(headers.get("X-Club-Preview-Mode")).toBe("admin");
    localStorage.removeItem("club-preview-mode");
  });

  it("resolves the upload route against production and development API bases", () => {
    expect(resolveSupportUploadUrl("/support/uploads/token", "/api")).toBe("/api/support/uploads/token");
    expect(resolveSupportUploadUrl("/support/uploads/token", "http://localhost:3000")).toBe("http://localhost:3000/support/uploads/token");
  });
});
