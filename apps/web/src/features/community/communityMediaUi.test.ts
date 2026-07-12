import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(resolve(__dirname, name), "utf8");

describe("community rich message UI", () => {
  it("provides recorder preview, five-minute cap, and expired voice state", () => {
    expect(read("useVoiceRecorder.ts")).toContain("300");
    expect(read("useVoiceRecorder.ts")).toContain("navigator.mediaDevices.getUserMedia");
    expect(read("ChatVoiceMessage.vue")).toContain("Голосовое удалено по сроку хранения");
  });

  it("provides up to ten image previews and a fullscreen gallery", () => {
    expect(read("useImageDraft.ts")).toContain("slice(0, 10)");
    expect(read("ChatImageGallery.vue")).toContain('Teleport to="body"');
    expect(read("ChatImageGallery.vue")).toContain("Изображения удалены по сроку хранения");
  });

  it("supports pinch zoom, pan, and double tap in the image viewer", () => {
    const gallery = read("ChatImageGallery.vue");
    const gestures = read("useImageViewerGestures.ts");
    expect(gallery).toContain("viewer.imageStyle.value");
    expect(gallery).toContain("@pointermove=\"viewer.onPointerMove\"");
    expect(gallery).toContain("@dblclick=\"viewer.toggleZoom\"");
    expect(gestures).toContain("Math.min(4");
    expect(gestures).toContain("pointers.size === 2");
  });

  it("renders a controlled Telegram-like voice player with duration fallback", () => {
    const voice = read("ChatVoiceMessage.vue");
    expect(voice).toContain("chat-voice-play");
    expect(voice).toContain("@loadedmetadata=\"handleMetadata\"");
    expect(voice).toContain("@error=\"playbackFailed = true\"");
    expect(voice).toContain("voice.durationSeconds");
    expect(voice).not.toMatch(/<audio[^>]+controls/);
  });

  it("uses a paperclip composer and keeps the moderator menu inside the viewport", () => {
    const section = read("CommunitySection.vue");
    const styles = read("community.css");
    expect(section).toContain("Paperclip");
    expect(section).not.toContain("<Plus />");
    expect(styles).toMatch(/\.community-chat-open \.chat-input-row\s*\{[^}]*gap:\s*4px;/s);
    expect(styles).toMatch(/\.community-chat-open \.chat-admin-menu\s*\{[^}]*max-width:\s*calc\(100vw - 24px\)/s);
    expect(styles).toMatch(/\.community-chat-open \.chat-admin-menu \.mini-action\s*\{[^}]*white-space:\s*normal/s);
  });

  it("provides poll creation and voting controls", () => {
    expect(read("ChatPollComposer.vue")).toContain("Анонимный опрос");
    expect(read("ChatPollComposer.vue")).toContain("Можно выбрать несколько");
    expect(read("ChatPollMessage.vue")).toContain("totalVoters");
    expect(read("ChatPollMessage.vue")).toContain("Завершить опрос");
  });
});
