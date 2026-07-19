import { describe, expect, it, vi } from "vitest";
import type { AdminLearningMaterial, LearningSaveOperationResponse } from "@club/shared";
import { isAmbiguousNetworkError, reconcileLearningSave } from "./lessonSaveReconciliation";

const material = { id: "material-1", title: "Lesson" } as AdminLearningMaterial;

describe("lesson save reconciliation", () => {
  it("recognizes a response-less fetch failure but not an HTTP error", () => {
    expect(isAmbiguousNetworkError(Object.assign(new Error("[POST] <no response> Failed to fetch"), { name: "FetchError" }))).toBe(true);
    expect(
      isAmbiguousNetworkError(Object.assign(new Error("Bad request"), { name: "FetchError", response: { status: 400 } }))
    ).toBe(false);
  });

  it("returns the saved card after processing completes", async () => {
    const responses: LearningSaveOperationResponse[] = [
      { status: "processing" },
      { status: "succeeded", material }
    ];
    const loadOperation = vi.fn(async () => responses.shift()!);

    await expect(
      reconcileLearningSave({
        originalError: new Error("Failed to fetch"),
        loadOperation,
        delaysMs: [0, 0],
        wait: vi.fn()
      })
    ).resolves.toBe(material);
    expect(loadOperation).toHaveBeenCalledTimes(2);
  });

  it("keeps the original error when the operation failed or cannot be confirmed", async () => {
    const originalError = new Error("Failed to fetch");

    await expect(
      reconcileLearningSave({
        originalError,
        loadOperation: async () => ({ status: "failed", errorCode: "SAVE_FAILED" }),
        delaysMs: [0],
        wait: vi.fn()
      })
    ).rejects.toBe(originalError);
    await expect(
      reconcileLearningSave({
        originalError,
        loadOperation: async () => {
          throw new Error("404");
        },
        delaysMs: [0, 0],
        wait: vi.fn()
      })
    ).rejects.toBe(originalError);
  });
});
