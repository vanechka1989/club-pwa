import type { CommunityUploadedObject } from "@club/shared";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCommunityUploadsStore } from "./communityUploads";

const MiB = 1024 * 1024;
const userId = "11111111-1111-4111-8111-111111111111";
const topicId = "22222222-2222-4222-8222-222222222222";

function file(name = "photo.jpg", type = "image/jpeg", size = 12) {
  return new File([new Uint8Array(size)], name, { type, lastModified: 123 });
}

function uploaded(selected: File, kind: CommunityUploadedObject["kind"] = "image"): CommunityUploadedObject {
  return {
    kind,
    fileName: selected.name,
    contentType: selected.type as CommunityUploadedObject["contentType"],
    sizeBytes: selected.size,
    objectKey: `community/final/${userId}/private-object`,
    uploadToken: "33333333-3333-4333-8333-333333333333"
  } as CommunityUploadedObject;
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  vi.restoreAllMocks();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn((selected: File) => `blob:${selected.name}`),
    revokeObjectURL: vi.fn()
  });
});

describe("community upload drafts", () => {
  it("enforces the exact media policy and ten-image batch before upload", () => {
    const store = useCommunityUploadsStore();
    store.configure({ userId, topicId, storage: localStorage, upload: vi.fn() });

    expect(store.addFiles([file("clip.mp4", "video/mp4", 100 * MiB)], { kind: "video" })).toHaveLength(1);
    store.clearScope();
    expect(store.addFiles([file("large.mp4", "video/mp4", 100 * MiB + 1)], { kind: "video" })).toEqual([]);
    expect(store.scopeError).toBe("Размер видео не должен превышать 100 МБ.");
    store.clearScope();

    const images = Array.from({ length: 11 }, (_, index) => file(`${index}.jpg`));
    expect(store.addFiles(images, { kind: "image" })).toHaveLength(10);
    expect(store.scopeError).toBe("Можно отправить не больше 10 изображений.");
    store.clearScope();
    expect(store.addFiles([file("vector.svg", "image/svg+xml")], { kind: "image" })).toEqual([]);
    expect(store.scopeError).toBe("Этот формат файла не поддерживается.");
  });

  it("reports progress, supports cancellation and resumes the same selected file on retry", async () => {
    let firstOptions: { signal?: AbortSignal; onProgress?: (progress: number) => void } | undefined;
    let calls = 0;
    const upload = vi.fn((selected: File, options: { signal?: AbortSignal; onProgress?: (progress: number) => void }) => {
      calls += 1;
      firstOptions ??= options;
      if (calls === 1) {
        return new Promise<CommunityUploadedObject>((_resolve, reject) => {
          options.onProgress?.(37);
          options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      }
      options.onProgress?.(100);
      return Promise.resolve(uploaded(selected));
    });
    const store = useCommunityUploadsStore();
    store.configure({ userId, topicId, storage: localStorage, upload });
    const [draft] = store.addFiles([file()], { kind: "image" });

    const first = store.uploadDraft(draft!.id);
    expect(store.drafts[0]).toMatchObject({ status: "uploading", progress: 37 });
    store.cancelDraft(draft!.id);
    await first;
    expect(firstOptions?.signal?.aborted).toBe(true);
    expect(store.drafts[0]).toMatchObject({ status: "cancelled", progress: 37 });

    await store.retryDraft(draft!.id);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1]?.[0]).toBe(upload.mock.calls[0]?.[0]);
    expect(store.drafts[0]).toMatchObject({ status: "uploaded", progress: 100 });
  });

  it("keeps a completed token when cancellation races the final server completion", async () => {
    let resolve!: (value: CommunityUploadedObject) => void;
    const pending = new Promise<CommunityUploadedObject>((done) => { resolve = done; });
    const store = useCommunityUploadsStore();
    store.configure({ userId, topicId, storage: localStorage, upload: () => pending });
    const selected = file();
    const [draft] = store.addFiles([selected], { kind: "image" });
    const work = store.uploadDraft(draft!.id);

    store.cancelDraft(draft!.id);
    resolve(uploaded(selected));
    await work;

    expect(store.drafts[0]).toMatchObject({
      status: "uploaded",
      progress: 100,
      uploadToken: "33333333-3333-4333-8333-333333333333"
    });
  });

  it("persists only recovery metadata and requires exact reattachment after the server grace period", async () => {
    const selected = file("guide.pdf", "application/pdf");
    const upload = vi.fn(async () => ({
      ...uploaded(selected, "document"),
      objectKey: "community/quarantine/private/guide.pdf"
    } as CommunityUploadedObject));
    const store = useCommunityUploadsStore();
    store.configure({ userId, topicId, storage: localStorage, upload });
    const [draft] = store.addFiles([selected], { kind: "document" });
    await store.uploadDraft(draft!.id);

    const persisted = localStorage.getItem("club-community-upload-drafts-v1") ?? "";
    expect(persisted).toContain(selected.name);
    expect(persisted).not.toContain("33333333-3333-4333-8333-333333333333");
    expect(persisted).not.toContain("uploadToken");
    expect(persisted).not.toContain("community/quarantine");
    expect(persisted).not.toContain("https://");
    expect(persisted).not.toContain("blob:");
    expect(persisted).not.toContain("Uint8Array");

    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 16 * 60 * 1000));
    const restored = useCommunityUploadsStore();
    restored.configure({ userId, topicId, storage: localStorage, upload });
    expect(restored.drafts[0]).toMatchObject({
      file: null,
      fileName: "guide.pdf",
      status: "needs_file",
      uploadToken: null
    });
    vi.useRealTimers();
  });

  it.each(["uploaded", "failed"] as const)("aborts the inactive server session before removing an %s draft", async (outcome) => {
    const selected = file();
    const cancel = vi.fn(async () => ({ ok: true as const }));
    const store = useCommunityUploadsStore();
    store.configure({
      userId,
      topicId,
      storage: localStorage,
      cancel,
      upload: outcome === "uploaded"
        ? async () => uploaded(selected)
        : async () => { throw new Error("offline"); }
    });
    const [draft] = store.addFiles([selected], { kind: "image" });
    await store.uploadDraft(draft!.id);

    await store.removeDraft(draft!.id);

    expect(cancel).toHaveBeenCalledWith(selected, userId);
    expect(store.drafts).toEqual([]);
  });

  it("performs idempotent server cancellation before removing a cancelled draft", async () => {
    const selected = file();
    const cancel = vi.fn(async () => ({ ok: true as const }));
    const store = useCommunityUploadsStore();
    store.configure({
      userId,
      topicId,
      storage: localStorage,
      cancel,
      upload: (_file, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      })
    });
    const [draft] = store.addFiles([selected], { kind: "image" });
    const work = store.uploadDraft(draft!.id);
    store.cancelDraft(draft!.id);
    await work;

    await store.removeDraft(draft!.id);

    expect(cancel).toHaveBeenCalledWith(selected, userId);
    expect(store.drafts).toEqual([]);
  });

  it("waits for an in-flight completion race and then aborts the unattached server session", async () => {
    let resolve!: (value: CommunityUploadedObject) => void;
    const pending = new Promise<CommunityUploadedObject>((done) => { resolve = done; });
    const selected = file();
    const cancel = vi.fn(async () => ({ ok: true as const }));
    const store = useCommunityUploadsStore();
    store.configure({ userId, topicId, storage: localStorage, upload: () => pending, cancel });
    const [draft] = store.addFiles([selected], { kind: "image" });
    const uploadWork = store.uploadDraft(draft!.id);

    const removal = store.removeDraft(draft!.id);
    resolve(uploaded(selected));
    await Promise.all([uploadWork, removal]);

    expect(cancel).toHaveBeenCalledWith(selected, userId);
    expect(store.drafts).toEqual([]);
  });

  it.each(["topic", "account", "logout"] as const)("aborts inactive server sessions on %s scope release", async (transition) => {
    const selected = file(`${transition}.jpg`);
    const cancel = vi.fn(async () => ({ ok: true as const }));
    const store = useCommunityUploadsStore();
    store.configure({ userId, topicId, storage: localStorage, upload: async () => uploaded(selected), cancel });
    const [draft] = store.addFiles([selected], { kind: "image" });
    await store.uploadDraft(draft!.id);

    if (transition === "topic") {
      store.configure({ userId, topicId: "other-topic", storage: localStorage, upload: vi.fn(), cancel: vi.fn() });
    } else if (transition === "account") {
      store.configure({ userId: "other-user", topicId, storage: localStorage, upload: vi.fn(), cancel: vi.fn() });
    } else {
      store.suspend();
    }

    expect(cancel).toHaveBeenCalledWith(selected, userId);
    expect(store.drafts).toEqual([]);
  });

  it("restores interrupted metadata as requiring the original file and validates reattachment", () => {
    const store = useCommunityUploadsStore();
    store.configure({ userId, topicId, storage: localStorage, upload: vi.fn() });
    const [draft] = store.addFiles([file("clip.mp4", "video/mp4")], { kind: "video" });

    setActivePinia(createPinia());
    const restored = useCommunityUploadsStore();
    restored.configure({ userId, topicId, storage: localStorage, upload: vi.fn() });
    expect(restored.drafts[0]).toMatchObject({ id: draft!.id, status: "needs_file", file: null });
    expect(restored.reattachFile(draft!.id, file("wrong.mp4", "video/mp4", 11))).toBe(false);
    expect(restored.reattachFile(draft!.id, file("clip.mp4", "video/mp4"))).toBe(true);
    expect(restored.drafts[0]).toMatchObject({ status: "queued", fileName: "clip.mp4" });
  });

  it("fences late upload completion across topic and account changes", async () => {
    let resolve!: (value: CommunityUploadedObject) => void;
    const pending = new Promise<CommunityUploadedObject>((done) => { resolve = done; });
    const store = useCommunityUploadsStore();
    store.configure({ userId, topicId, storage: localStorage, upload: () => pending });
    const selected = file();
    const [draft] = store.addFiles([selected], { kind: "image" });
    const work = store.uploadDraft(draft!.id);

    store.configure({ userId: "other-user", topicId: "other-topic", storage: localStorage, upload: vi.fn() });
    resolve(uploaded(selected));
    await work;

    expect(store.drafts).toEqual([]);
    expect(localStorage.getItem("club-community-upload-drafts-v1")).not.toContain("33333333-3333-4333-8333-333333333333");
  });

  it("removes a consumed draft from its persisted scope after the active topic changes", async () => {
    const selected = file();
    const store = useCommunityUploadsStore();
    store.configure({ userId, topicId, storage: localStorage, upload: async () => uploaded(selected) });
    const [draft] = store.addFiles([selected], { kind: "image" });
    await store.uploadDraft(draft!.id);

    store.configure({ userId, topicId: "other-topic", storage: localStorage, upload: vi.fn() });
    store.consumeDraftsForScope([draft!.id], userId, topicId);
    store.configure({ userId, topicId, storage: localStorage, upload: vi.fn() });

    expect(store.drafts).toEqual([]);
  });
});
