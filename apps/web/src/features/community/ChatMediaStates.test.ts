import type { ClubMessage } from "@club/shared";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import ChatImageGallery from "./ChatImageGallery.vue";
import ChatVoiceMessage from "./ChatVoiceMessage.vue";

function image(scanStatus: ClubMessage["images"][number]["scanStatus"], url: string | null = null) {
  return {
    id: `image-${scanStatus}`,
    url,
    contentType: "image/png" as const,
    sizeBytes: 100,
    width: 20,
    height: 10,
    expiresAt: "2099-01-01T00:00:00.000Z",
    deletedAt: null,
    fileName: "photo.png",
    scanStatus,
    scannedAt: null,
    scanError: null
  };
}

function voice(scanStatus: NonNullable<ClubMessage["voice"]>["scanStatus"], url: string | null = null) {
  return {
    id: `voice-${scanStatus}`,
    url,
    contentType: "audio/webm" as const,
    sizeBytes: 100,
    durationSeconds: 12,
    expiresAt: "2099-01-01T00:00:00.000Z",
    deletedAt: null,
    fileName: "voice.webm",
    scanStatus,
    scannedAt: null,
    scanError: null
  };
}

afterEach(cleanup);

describe("community image and voice processing states", () => {
  it("transitions an image from processing copy to ready media without calling it deleted", async () => {
    const view = render(ChatImageGallery, { props: { images: [image("pending")] } });
    expect(screen.getByRole("status").textContent).toContain("обрабатывается");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText(/удалены по сроку/)).toBeNull();

    await view.rerender({ images: [image("ready", "https://media.test/photo.png")] });
    expect(screen.getByRole("img", { name: "Изображение 1 из 1" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    ["failed", "Не удалось обработать изображение"],
    ["rejected", "Изображение заблокировано"],
    ["deleted", "Изображения удалены по сроку хранения"]
  ] as const)("renders the explicit %s image state", (scanStatus, copy) => {
    render(ChatImageGallery, { props: { images: [image(scanStatus)] } });
    expect(screen.getByText(copy)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("transitions voice from processing to ready and exposes audio only when ready", async () => {
    const view = render(ChatVoiceMessage, { props: { voice: voice("pending") } });
    expect(screen.getByRole("status").textContent).toContain("обрабатывается");
    expect(document.querySelector("audio")).toBeNull();
    expect(screen.queryByText(/удалено по сроку/)).toBeNull();

    await view.rerender({ voice: voice("ready", "https://media.test/voice.webm") });
    expect(document.querySelector("audio")?.getAttribute("src")).toContain("voice.webm");
    expect(screen.getByRole("button", { name: "Воспроизвести" })).toBeTruthy();
  });

  it.each([
    ["failed", "Не удалось обработать голосовое"],
    ["rejected", "Голосовое заблокировано"],
    ["deleted", "Голосовое удалено по сроку хранения"]
  ] as const)("renders the explicit %s voice state", (scanStatus, copy) => {
    render(ChatVoiceMessage, { props: { voice: voice(scanStatus) } });
    expect(screen.getByText(copy)).toBeTruthy();
    expect(document.querySelector("audio")).toBeNull();
  });
});
