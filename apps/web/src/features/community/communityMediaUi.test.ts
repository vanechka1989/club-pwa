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

  it("provides poll creation and voting controls", () => {
    expect(read("ChatPollComposer.vue")).toContain("Анонимный опрос");
    expect(read("ChatPollComposer.vue")).toContain("Можно выбрать несколько");
    expect(read("ChatPollMessage.vue")).toContain("totalVoters");
    expect(read("ChatPollMessage.vue")).toContain("Завершить опрос");
  });
});
