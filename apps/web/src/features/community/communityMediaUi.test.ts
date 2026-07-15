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
    expect(gestures).toContain("translateX.value += event.clientX");
  });

  it("uses the whole screen for images without framed navigation columns", () => {
    const styles = read("community.css");
    expect(styles).toMatch(/\.chat-image-viewer\s*\{[^}]*grid-template-columns:\s*1fr;/s);
    expect(styles).toMatch(/\.chat-viewer-stage > img\s*\{[^}]*max-width:\s*100%;[^}]*height:\s*auto;/s);
    expect(styles).toMatch(/\.chat-viewer-previous,[\s\S]*\.chat-viewer-next\s*\{[^}]*position:\s*absolute;/s);
    expect(styles).toMatch(/\.chat-image-viewer > button\s*\{[^}]*background:\s*transparent;/s);
  });

  it("renders a controlled Telegram-like voice player with duration fallback", () => {
    const voice = read("ChatVoiceMessage.vue");
    expect(voice).toContain("chat-voice-play");
    expect(voice).toContain("@loadedmetadata=\"handleMetadata\"");
    expect(voice).toContain("@error=\"playbackFailed = true\"");
    expect(voice).toContain("voice.durationSeconds");
    expect(voice).toContain("useStableMediaUrl");
    expect(voice).toContain(":src=\"mediaUrl.currentUrl.value\"");
    expect(voice).not.toMatch(/<audio[^>]+controls/);
  });

  it("uses a paperclip composer and keeps the moderator menu inside the viewport", () => {
    const section = read("CommunitySection.vue");
    const styles = read("community.css");
    expect(section).toContain("Paperclip");
    expect(section).toMatch(/import \{[^}]*\bPlus\b[^}]*\} from "lucide-vue-next"/);
    expect(section).toContain("<Paperclip />");
    expect(styles).toMatch(/\.community-chat-open \.chat-input-row\s*\{[^}]*gap:\s*2px;/s);
    expect(styles).toMatch(/\.community-chat-open \.chat-compose,[\s\S]*?padding:\s*8px max\(2px, var\(--club-safe-right\)\)/s);
    expect(styles).toMatch(/\.community-chat-open \.chat-admin-menu\s*\{[^}]*max-width:\s*calc\(100vw - 24px\)/s);
    expect(styles).toMatch(/\.community-chat-open \.chat-admin-menu \.mini-action\s*\{[^}]*white-space:\s*normal/s);
  });

  it("keeps message reactions in a compact viewport-safe palette", () => {
    const styles = read("community.css");
    expect(styles).toMatch(/\.community-chat-open \.reaction-popover\s*\{[^}]*position:\s*fixed;[^}]*left:\s*50%;[^}]*max-width:\s*calc\(100vw - 24px\)/s);
    expect(styles).toMatch(/\.community-chat-open \.reaction-popover-button\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;/s);
  });

  it("renders applied reactions as the smallest stable circle", () => {
    const styles = read("community.css");
    expect(styles).toMatch(/\.community-chat-open \.message-reactions\s*\{[^}]*width:\s*fit-content;[^}]*flex-direction:\s*row;/s);
    expect(styles).toMatch(/\.community-chat-open \.message-reaction-button\s*\{[^}]*width:\s*24px;[^}]*min-width:\s*24px;[^}]*height:\s*24px;[^}]*padding:\s*0;/s);
    expect(styles).toMatch(/\.community-chat-open \.message-reaction-button::before\s*\{[^}]*display:\s*none;/s);
    expect(styles).toMatch(/html body \.community-chat-open \.chat-bubble \.message-reaction-button\s*\{[^}]*min-width:\s*24px !important;[^}]*max-width:\s*24px !important;[^}]*min-height:\s*24px !important;[^}]*max-height:\s*24px !important;/s);
  });

  it("uses one clean emoji tray without framed emoji circles", () => {
    const styles = read("community.css");
    expect(styles).toMatch(/\.community-chat-open \.composer-emoji-popover\s*\{[^}]*position:\s*fixed;[^}]*grid-template-columns:\s*repeat\(6, 36px\)/s);
    expect(styles).toMatch(/\.community-chat-open \.composer-emoji-popover button\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
  });

  it("uses calm semantic chat surfaces in every active theme", () => {
    const styles = read("community.css");
    expect(styles).toContain("--chat-bubble-incoming");
    expect(styles).toContain("--chat-bubble-outgoing");
    expect(styles).toContain("--chat-bubble-text");
    expect(styles).toMatch(/--chat-bubble-outgoing:\s*color-mix\(in srgb, var\(--accent\) 14%, var\(--panel-strong\)\)/);
    expect(styles).toMatch(/\.community-chat-open \.chat-message-own \.chat-bubble\s*\{[^}]*background:\s*var\(--chat-bubble-outgoing\)/s);
    expect(styles).toMatch(/\.community-chat-open \.chat-message-own :is\([^}]*color:\s*var\(--chat-bubble-text\)/s);
  });

  it("uses one composer capsule and one contextual right action", () => {
    const section = read("CommunitySection.vue");
    const styles = read("community.css");
    expect(section).toContain("chat-composer-shell");
    expect(section).toContain('v-if="newMessage.trim()"');
    expect(section).toContain('v-else-if="voiceRecorder.supported.value"');
    expect(styles).toMatch(/\.community-chat-open \.chat-composer-shell\s*\{[^}]*grid-template-columns:\s*var\(--icon-button-size\) var\(--icon-button-size\) minmax\(0, 1fr\) var\(--icon-button-size\)/s);
  });

  it("shows a pressed loading state while voice or images are uploading", () => {
    const section = read("CommunitySection.vue");
    expect(section).toContain(':aria-busy="messageSaving"');
    expect(section).toContain("LoaderCircle");
    expect(section).toContain("chat-draft-send-loading");
    expect(section).toContain('aria-label="Отправить голосовое сообщение"');
  });

  it("uses the same seekable waveform for recording previews and sent voice messages", () => {
    const section = read("CommunitySection.vue");
    const player = read("ChatVoiceMessage.vue");
    const recorder = read("useVoiceRecorder.ts");
    expect(section).toContain("ChatVoiceWaveform");
    expect(section).not.toContain(" controls></audio>");
    expect(player).toContain("ChatVoiceWaveform");
    expect(player).toContain('@seek="seek"');
    expect(recorder).toContain("startLevelAnalysis");
    expect(recorder).toContain("appendVoiceLevel");
  });

  it("provides poll creation and voting controls", () => {
    expect(read("ChatPollComposer.vue")).toContain("Анонимный опрос");
    expect(read("ChatPollComposer.vue")).toContain("Можно выбрать несколько");
    expect(read("ChatPollMessage.vue")).toContain("totalVoters");
    expect(read("ChatPollMessage.vue")).toContain("Завершить опрос");
  });
});
