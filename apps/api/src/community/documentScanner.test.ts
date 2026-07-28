import { describe, expect, it, vi } from "vitest";
import {
  parseClamAvResponse,
  processCommunityDocumentScan,
  runDocumentScannerBatch,
  scanClamAvChunks,
  shouldRetryCommunityDocumentScan
} from "./documentScanner";

describe("community document quarantine scanner", () => {
  it("parses clean, infected, and unavailable ClamAV responses fail-closed", () => {
    expect(parseClamAvResponse("stream: OK\0")).toBe("clean");
    expect(parseClamAvResponse("stream: Eicar-Signature FOUND\0")).toBe("infected");
    expect(parseClamAvResponse("stream: size limit exceeded ERROR\0")).toBe("unavailable");
    expect(parseClamAvResponse("nonsense")).toBe("unavailable");
  });

  it("reclaims scans left in-progress by a worker restart but never reopens terminal rows", () => {
    expect(shouldRetryCommunityDocumentScan("pending")).toBe(true);
    expect(shouldRetryCommunityDocumentScan("failed")).toBe(true);
    expect(shouldRetryCommunityDocumentScan("scanning")).toBe(true);
    expect(shouldRetryCommunityDocumentScan("ready")).toBe(false);
    expect(shouldRetryCommunityDocumentScan("rejected")).toBe(false);
  });

  it("streams bounded INSTREAM frames instead of buffering the document", async () => {
    const writes: Uint8Array[] = [];
    const result = await scanClamAvChunks((async function* () {
      yield new Uint8Array([1, 2, 3]);
      yield new Uint8Array([4, 5]);
    })(), {
      exchange: async (frames) => {
        for await (const frame of frames) writes.push(frame);
        return "stream: OK\0";
      }
    });

    expect(result).toBe("clean");
    expect(new TextDecoder().decode(writes[0])).toBe("zINSTREAM\0");
    expect(Array.from(writes[1] ?? [])).toEqual([0, 0, 0, 3]);
    expect(Array.from(writes[2] ?? [])).toEqual([1, 2, 3]);
    expect(Array.from(writes[3] ?? [])).toEqual([0, 0, 0, 2]);
    expect(Array.from(writes[4] ?? [])).toEqual([4, 5]);
    expect(Array.from(writes[5] ?? [])).toEqual([0, 0, 0, 0]);
  });

  it("mirrors clean documents before making them deliverable", async () => {
    const events: string[] = [];
    await processCommunityDocumentScan({ id: "a1", objectKey: "community/pending/u/d/t-guide.pdf", contentType: "application/pdf" }, {
      scan: async () => "clean",
      mirrorToReserve: async () => { events.push("mirror"); },
      deleteCopies: async () => { events.push("delete"); },
      updateStatus: async (_id, status) => { events.push(`status:${status}`); }
    });

    expect(events).toEqual(["mirror", "status:ready"]);
  });

  it("deletes infected objects and marks them rejected", async () => {
    const events: string[] = [];
    await processCommunityDocumentScan({ id: "a1", objectKey: "community/pending/u/d/t-guide.pdf", contentType: "application/pdf" }, {
      scan: async () => "infected",
      mirrorToReserve: async () => { events.push("mirror"); },
      deleteCopies: async () => { events.push("delete"); },
      updateStatus: async (_id, status) => { events.push(`status:${status}`); }
    });

    expect(events).toEqual(["delete", "status:rejected"]);
  });

  it("keeps an infected document fail-closed for cleanup retry when deletion fails", async () => {
    const updateStatus = vi.fn(async () => undefined);
    await processCommunityDocumentScan({ id: "a1", objectKey: "community/pending/u/d/t-guide.pdf", contentType: "application/pdf" }, {
      scan: async () => "infected",
      mirrorToReserve: async () => undefined,
      deleteCopies: async () => { throw new Error("delete failed"); },
      updateStatus
    });

    expect(updateStatus).toHaveBeenCalledWith("a1", "failed", "malware_cleanup_failed");
    expect(updateStatus).not.toHaveBeenCalledWith("a1", "rejected", expect.anything());
  });

  it("keeps the object quarantined when ClamAV is unavailable", async () => {
    const deleteCopies = vi.fn();
    const mirrorToReserve = vi.fn();
    const updateStatus = vi.fn();
    await processCommunityDocumentScan({ id: "a1", objectKey: "community/pending/u/d/t-guide.pdf", contentType: "application/pdf" }, {
      scan: async () => "unavailable",
      mirrorToReserve,
      deleteCopies,
      updateStatus
    });

    expect(deleteCopies).not.toHaveBeenCalled();
    expect(mirrorToReserve).not.toHaveBeenCalled();
    expect(updateStatus).toHaveBeenCalledWith("a1", "failed", "scanner_unavailable");
  });

  it("fails closed and cleans up when reserve mirroring fails after a clean scan", async () => {
    const deleteCopies = vi.fn(async () => undefined);
    const updateStatus = vi.fn(async () => undefined);
    await processCommunityDocumentScan({ id: "a1", objectKey: "community/pending/u/d/t-guide.pdf", contentType: "application/pdf" }, {
      scan: async () => "clean",
      mirrorToReserve: async () => { throw new Error("reserve down"); },
      deleteCopies,
      updateStatus
    });

    expect(deleteCopies).toHaveBeenCalledWith("community/pending/u/d/t-guide.pdf");
    expect(updateStatus).toHaveBeenCalledWith("a1", "failed", "storage_copy_failed");
  });

  it("claims each document by id and never scans an unclaimed row", async () => {
    const scanned: string[] = [];
    const processed = await runDocumentScannerBatch([
      { id: "a1", kind: "document", objectKey: "community/pending/u/a.pdf", contentType: "application/pdf" },
      { id: "a2", kind: "document", objectKey: "community/pending/u/b.pdf", contentType: "application/pdf" },
      { id: "a3", kind: "video", objectKey: "community/pending/u/c.mp4", contentType: "video/mp4" }
    ], {
      claim: async (id) => id === "a1",
      process: async (attachment) => { scanned.push(attachment.id); }
    });

    expect(processed).toBe(1);
    expect(scanned).toEqual(["a1"]);
  });
});
