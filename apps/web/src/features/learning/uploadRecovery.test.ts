import { describe, expect, it, vi } from "vitest";
import {
  LearningUploadRequestError,
  createManualUploadRetryGate,
  describeLessonUploadFailure,
  runUploadWithRetry
} from "./uploadRecovery";

describe("lesson upload recovery", () => {
  it("retries a transient connection failure up to three attempts", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new LearningUploadRequestError("Соединение закрыто", { code: "UPLOAD_CONNECTION_CLOSED", status: 503 }))
      .mockRejectedValueOnce(new LearningUploadRequestError("Соединение закрыто", { code: "UPLOAD_CONNECTION_CLOSED", status: 503 }))
      .mockResolvedValue("etag");
    const retries: number[] = [];

    await expect(
      runUploadWithRetry(operation, {
        wait: async () => undefined,
        onRetry: ({ nextAttempt }) => retries.push(nextAttempt)
      })
    ).resolves.toBe("etag");

    expect(operation).toHaveBeenCalledTimes(3);
    expect(retries).toEqual([2, 3]);
  });

  it("does not retry validation failures or an explicit cancellation", async () => {
    const validation = vi.fn().mockRejectedValue(new LearningUploadRequestError("Некорректный файл", { code: "INVALID_UPLOAD_PART", status: 400 }));
    const cancellation = vi.fn().mockRejectedValue(new DOMException("Отменено", "AbortError"));

    await expect(runUploadWithRetry(validation, { wait: async () => undefined })).rejects.toMatchObject({ code: "INVALID_UPLOAD_PART" });
    await expect(runUploadWithRetry(cancellation, { wait: async () => undefined })).rejects.toMatchObject({ name: "AbortError" });
    expect(validation).toHaveBeenCalledTimes(1);
    expect(cancellation).toHaveBeenCalledTimes(1);
  });

  it("turns the final technical failure into a useful explanation", () => {
    const failure = describeLessonUploadFailure(
      new LearningUploadRequestError("The connection was closed", { code: "UPLOAD_CONNECTION_CLOSED", status: 503, attempts: 3 }),
      "Дополнительный материал 2"
    );

    expect(failure).toMatchObject({
      title: "Соединение прервалось",
      stage: "Дополнительный материал 2",
      code: "UPLOAD_CONNECTION_CLOSED",
      attempts: 3
    });
    expect(failure.detail).toContain("три попытки");
    expect(failure.failedAt).toBeTypeOf("number");
  });

  it("resumes every paused part from one manual retry action", async () => {
    const gate = createManualUploadRetryGate();
    let resumed = 0;
    const first = gate.wait().then(() => { resumed += 1; });
    const second = gate.wait().then(() => { resumed += 1; });

    expect(gate.hasWaiters()).toBe(true);
    gate.resume();
    await Promise.all([first, second]);

    expect(resumed).toBe(2);
    expect(gate.hasWaiters()).toBe(false);
  });
});
