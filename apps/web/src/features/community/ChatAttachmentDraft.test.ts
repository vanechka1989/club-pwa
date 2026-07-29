import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ChatAttachmentDraft from "./ChatAttachmentDraft.vue";
import ChatComposer from "./ChatComposer.vue";
import type { CommunityUploadDraft } from "@/stores/communityUploads";

function draft(overrides: Partial<CommunityUploadDraft> = {}): CommunityUploadDraft {
  return {
    id: "draft-1",
    userId: "user-1",
    topicId: "topic-1",
    kind: "image",
    file: new File(["photo"], "photo.jpg", { type: "image/jpeg", lastModified: 123 }),
    fileName: "photo.jpg",
    contentType: "image/jpeg",
    sizeBytes: 5,
    lastModified: 123,
    durationSeconds: null,
    previewUrl: "blob:photo.jpg",
    status: "uploading",
    progress: 42,
    error: null,
    uploadToken: null,
    ...overrides
  };
}

afterEach(cleanup);

describe("community attachment draft", () => {
  it("shows an accessible safe image preview, human size, progress, cancel, and remove", async () => {
    const view = render(ChatAttachmentDraft, { props: { draft: draft({ sizeBytes: 1_572_864 }) } });

    expect(screen.getByAltText("Предпросмотр photo.jpg")).toBeTruthy();
    expect(screen.getByText("1,5 МБ")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Загрузка photo.jpg" }).getAttribute("aria-valuenow")).toBe("42");
    await fireEvent.click(screen.getByRole("button", { name: "Отменить загрузку photo.jpg" }));
    await fireEvent.click(screen.getByRole("button", { name: "Удалить вложение photo.jpg" }));
    expect(view.emitted().cancel).toEqual([["draft-1"]]);
    expect(view.emitted().remove).toEqual([["draft-1"]]);
  });

  it("offers retry after a failure and file reselection after reload", async () => {
    const failed = render(ChatAttachmentDraft, {
      props: { draft: draft({ status: "failed", error: "Нет соединения", progress: 0 }) }
    });
    expect(screen.getByRole("alert").textContent).toContain("Нет соединения");
    await fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку photo.jpg" }));
    expect(failed.emitted().retry).toEqual([["draft-1"]]);
    failed.unmount();
    cleanup();

    const recovered = render(ChatAttachmentDraft, {
      props: { draft: draft({ status: "needs_file", file: null, previewUrl: null, progress: 0 }) }
    });
    const input = screen.getByLabelText("Выбрать photo.jpg для продолжения") as HTMLInputElement;
    const selected = new File(["photo"], "photo.jpg", { type: "image/jpeg", lastModified: 123 });
    await fireEvent.change(input, { target: { files: [selected] } });
    expect(recovered.emitted().reattach).toEqual([["draft-1", selected]]);
  });

  it("never embeds arbitrary HTML or SVG previews", () => {
    const { container } = render(ChatAttachmentDraft, {
      props: {
        draft: draft({
          kind: "document",
          fileName: "payload.svg",
          contentType: "image/svg+xml",
          previewUrl: "data:image/svg+xml,<svg onload=alert(1)></svg>"
        })
      }
    });
    expect(container.querySelector("img, iframe, object, embed")).toBeNull();
    expect(container.innerHTML).not.toContain("onload");
    expect(screen.getByText("payload.svg")).toBeTruthy();
  });

  it("offers gallery, camera, video and document choices and stages direct-upload media", async () => {
    const props = {
      canWrite: true,
      isMuted: false,
      muteComposerText: "",
      unavailableComposerText: "",
      messageSaving: false,
      replyToMessage: null,
      draft: "",
      resetVersion: 0,
      editMessage: null,
      attachmentDrafts: []
    };
    const view = render(ChatComposer, { props });
    await fireEvent.click(screen.getByRole("button", { name: "Вложения" }));
    expect(screen.getByRole("button", { name: "Из галереи" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Сделать фото" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Видео" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Документ" })).toBeTruthy();

    const selected = new File(["pdf"], "guide.pdf", { type: "application/pdf", lastModified: 123 });
    await fireEvent.change(screen.getByLabelText("Выбрать документ"), { target: { files: [selected] } });
    expect(view.emitted()["stage-files"]).toEqual([[[selected], "document", undefined]]);

    await view.rerender({ ...props, attachmentDrafts: [draft({
      kind: "document",
      file: selected,
      fileName: selected.name,
      contentType: selected.type,
      sizeBytes: selected.size,
      status: "uploaded",
      progress: 100,
      previewUrl: null,
      uploadToken: "33333333-3333-4333-8333-333333333333"
    })] });
    await fireEvent.click(screen.getByRole("button", { name: "Отправить 1 вложение" }));
    expect(view.emitted()["send-uploads"]).toEqual([[['draft-1']]]);
  });

  it("keeps upload controls touch-safe above the keyboard and disables nonessential motion", () => {
    const styles = readFileSync(resolve(__dirname, "community.css"), "utf8");
    expect(styles).toMatch(/\.chat-attachment-primary[\s\S]*min-height:\s*44px/);
    expect(styles).toMatch(/body\.club-keyboard-open[\s\S]*\.chat-attachment-drafts[\s\S]*max-height:/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.chat-attachment-draft/);
    expect(styles).toContain("var(--color-surface)");
    expect(styles).toContain("var(--color-focus");
  });
});
