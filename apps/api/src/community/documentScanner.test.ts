import { describe, expect, it, vi } from "vitest";
import {
  parseClamAvResponse,
  processCommunityDocumentScan,
  runDocumentScannerBatch,
  scanClamAvChunks,
  summarizeCommunityDocumentScannerHealth,
  shouldRetryCommunityDocumentScan
} from "./documentScanner";

describe("community document quarantine scanner", () => {
  it("parses clean, infected, and unavailable ClamAV responses fail-closed", () => {
    expect(parseClamAvResponse("stream: OK\0")).toBe("clean");
    expect(parseClamAvResponse("stream: Eicar-Signature FOUND\0")).toBe("infected");
    expect(parseClamAvResponse("stream: size limit exceeded ERROR\0")).toBe("unavailable");
    expect(parseClamAvResponse("nonsense")).toBe("unavailable");
  });

  it("claims queued/retry rows immediately but in-progress scans only after a stale lease", () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    expect(shouldRetryCommunityDocumentScan("pending", now, now)).toBe(true);
    expect(shouldRetryCommunityDocumentScan("failed", now, now)).toBe(true);
    expect(shouldRetryCommunityDocumentScan("cleanup_pending", now, now)).toBe(true);
    expect(shouldRetryCommunityDocumentScan("scanning", new Date("2026-07-29T11:59:00.000Z"), now)).toBe(false);
    expect(shouldRetryCommunityDocumentScan("scanning", new Date("2026-07-29T11:40:00.000Z"), now)).toBe(true);
    expect(shouldRetryCommunityDocumentScan("ready", now, now)).toBe(false);
    expect(shouldRetryCommunityDocumentScan("rejected", now, now)).toBe(false);
  });

  it("reports scanner and fail-closed queue health separately from API readiness", () => {
    expect(summarizeCommunityDocumentScannerHealth({ available: true, queued: 0, failed: 0, cleanupPending: 0 })).toMatchObject({ status: "healthy" });
    expect(summarizeCommunityDocumentScannerHealth({ available: true, queued: 4, failed: 1, cleanupPending: 0 })).toMatchObject({ status: "warning" });
    expect(summarizeCommunityDocumentScannerHealth({ available: false, queued: 4, failed: 1, cleanupPending: 1 })).toMatchObject({ status: "error" });
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
      promoteToFinal: async () => { events.push("promote"); return "community/final/u/d/t-guide.pdf"; },
      mirrorToReserve: async (key) => { events.push(`mirror:${key}`); },
      deleteCopies: async (key) => { events.push(`delete:${key}`); },
      updateStatus: async (_id, status) => { events.push(`status:${status}`); }
    });

    expect(events).toEqual([
      "promote",
      "mirror:community/final/u/d/t-guide.pdf",
      "status:ready",
      "delete:community/pending/u/d/t-guide.pdf"
    ]);
  });

  it("deletes infected objects and marks them rejected", async () => {
    const events: string[] = [];
    await processCommunityDocumentScan({ id: "a1", objectKey: "community/pending/u/d/t-guide.pdf", contentType: "application/pdf" }, {
      scan: async () => "infected",
      promoteToFinal: async () => "unused",
      mirrorToReserve: async () => { events.push("mirror"); },
      deleteCopies: async () => { events.push("delete"); },
      updateStatus: async (_id, status) => { events.push(`status:${status}`); }
    });

    expect(events).toEqual(["status:cleanup_pending", "delete", "status:rejected"]);
  });

  it("keeps an infected document fail-closed for cleanup retry when deletion fails", async () => {
    const updateStatus = vi.fn(async () => undefined);
    await processCommunityDocumentScan({ id: "a1", objectKey: "community/pending/u/d/t-guide.pdf", contentType: "application/pdf" }, {
      scan: async () => "infected",
      promoteToFinal: async () => "unused",
      mirrorToReserve: async () => undefined,
      deleteCopies: async () => { throw new Error("delete failed"); },
      updateStatus
    });

    expect(updateStatus).toHaveBeenCalledWith("a1", "cleanup_pending", "malware_cleanup_failed");
    expect(updateStatus).not.toHaveBeenCalledWith("a1", "rejected", expect.anything());
  });

  it("retries partial infected-copy cleanup without rescanning a missing primary", async () => {
    const scan = vi.fn(async () => "unavailable" as const);
    const deleteCopies = vi.fn(async () => undefined);
    const updateStatus = vi.fn(async () => undefined);
    await processCommunityDocumentScan({
      id: "a1",
      objectKey: "community/quarantine/u/d/t-guide.pdf",
      contentType: "application/pdf",
      status: "cleanup_pending"
    }, {
      scan,
      promoteToFinal: async () => "unused",
      mirrorToReserve: async () => undefined,
      deleteCopies,
      updateStatus
    });

    expect(scan).not.toHaveBeenCalled();
    expect(deleteCopies).toHaveBeenCalledTimes(1);
    expect(updateStatus).toHaveBeenCalledWith("a1", "rejected", "malware_detected");
  });

  it("keeps the object quarantined when ClamAV is unavailable", async () => {
    const deleteCopies = vi.fn();
    const mirrorToReserve = vi.fn();
    const updateStatus = vi.fn();
    await processCommunityDocumentScan({ id: "a1", objectKey: "community/pending/u/d/t-guide.pdf", contentType: "application/pdf" }, {
      scan: async () => "unavailable",
      promoteToFinal: async () => "unused",
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
      promoteToFinal: async () => "community/final/u/d/t-guide.pdf",
      mirrorToReserve: async () => { throw new Error("reserve down"); },
      deleteCopies,
      updateStatus
    });

    expect(deleteCopies).toHaveBeenCalledWith("community/final/u/d/t-guide.pdf");
    expect(updateStatus).toHaveBeenCalledWith("a1", "failed", "storage_copy_failed");
  });

  it("deletes every promoted final copy when terminal cleanup wins before database finalization", async () => {
    const deleteCopies = vi.fn(async () => undefined);
    await expect(processCommunityDocumentScan({
      id: "a1",
      objectKey: "community/quarantine/u/d/t-guide.pdf",
      contentType: "application/pdf"
    }, {
      scan: async () => "clean",
      promoteToFinal: async () => "community/final/u/d/t-guide.pdf",
      mirrorToReserve: async () => undefined,
      deleteCopies,
      updateStatus: async (_id, status) => {
        if (status === "ready") throw new Error("scanner_terminal_fence");
      }
    })).rejects.toThrow("scanner_status_reconciliation_required");

    expect(deleteCopies).toHaveBeenCalledWith("community/final/u/d/t-guide.pdf");
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

  it("allows only one worker to claim a fresh scan lease", async () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    let status = "pending";
    let updatedAt = new Date("2026-07-29T11:00:00.000Z");
    const processed: string[] = [];
    const candidate = { id: "a1", kind: "document", objectKey: "community/quarantine/u/a.pdf", contentType: "application/pdf" };
    const dependencies = {
      claim: async () => {
        if (!shouldRetryCommunityDocumentScan(status, updatedAt, now)) return false;
        status = "scanning";
        updatedAt = now;
        return true;
      },
      process: async () => { processed.push("a1"); }
    };

    await Promise.all([
      runDocumentScannerBatch([candidate], dependencies),
      runDocumentScannerBatch([candidate], dependencies)
    ]);
    expect(processed).toEqual(["a1"]);
  });
});
