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
    expect(voice).toContain("@error=\"handlePlaybackError\"");
    expect(voice).toContain("playsinline");
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
    const section = read("CommunitySection.vue");
    const styles = read("community.css");
    expect(section).toContain('<Teleport to="body">');
    expect(section).toContain('v-if="activeReactionMessage"');
    expect(section).toContain('role="dialog"');
    expect(styles).toMatch(/\.community-reaction-popover\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*2100;[^}]*left:\s*50%;[^}]*max-width:\s*calc\(100vw - 24px\)/s);
    expect(styles).toMatch(/\.community-reaction-popover \.reaction-popover-button\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;/s);
  });

  it("anchors applied reactions outside the bubble without increasing its height", () => {
    const section = read("CommunitySection.vue");
    const styles = read("community.css");
    expect(section).toContain('class="chat-message-content"');
    expect(section).toMatch(/class="chat-message-content"[\s\S]*class="chat-bubble"[\s\S]*class="message-reactions"/s);
    expect(styles).toMatch(/\.community-chat-open \.chat-message-content\s*\{[^}]*position:\s*relative;/s);
    expect(styles).toMatch(/\.community-chat-open \.message-reactions\s*\{[^}]*position:\s*absolute;[^}]*right:\s*-8px;[^}]*bottom:\s*-12px;/s);
    expect(styles).toMatch(/\.community-chat-open \.chat-message-own \.message-reactions\s*\{[^}]*right:\s*auto;[^}]*left:\s*-8px;/s);
    expect(styles).toMatch(/\.community-chat-open \.message-reaction-button\s*\{[^}]*min-width:\s*34px;[^}]*height:\s*30px;[^}]*padding:\s*0 6px;/s);
    expect(styles).toMatch(/\.community-chat-open \.message-reaction-button::after\s*\{[^}]*inset:\s*-7px -5px;/s);
    expect(styles).toMatch(/\.community-chat-open \.message-reaction-button span\s*\{\s*font-size:\s*14px;/s);
    expect(styles).toMatch(/html body \.community-chat-open \.chat-message-content \.message-reaction-button\s*\{[^}]*height:\s*30px !important;[^}]*min-height:\s*30px !important;[^}]*max-height:\s*30px !important;/s);
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

  it("replaces a disabled composer with an explicit closed-topic notice", () => {
    const section = read("CommunitySection.vue");
    const styles = read("community.css");
    expect(section).toContain('class="chat-compose-unavailable"');
    expect(section).toContain("Тема закрыта. Новые сообщения недоступны.");
    expect(section).toContain('v-if="canWrite"');
    expect(styles).toMatch(/\.community-chat-open \.chat-compose-unavailable\s*\{[^}]*min-height:\s*44px;/s);
  });

  it("clears a denied microphone error when the draft or topic is reset", () => {
    const recorder = read("useVoiceRecorder.ts");
    const cancelBody = recorder.match(/function cancel\(\)\s*\{(?<body>[\s\S]*?)\n\s*\}/)?.groups?.body ?? "";
    expect(cancelBody).toContain("error.value = null");
  });

  it("shows a pressed loading state while voice or images are uploading", () => {
    const section = read("CommunitySection.vue");
    expect(section).toContain(':aria-busy="messageSaving"');
    expect(section).toContain("LoaderCircle");
    expect(section).toContain("chat-draft-send-loading");
    expect(section).toContain('aria-label="Отправить голосовое сообщение"');
  });

  it("keeps draft media actions at least 44px tall", () => {
    const styles = read("community.css");
    expect(styles).toMatch(/\.chat-voice-draft-action\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
    expect(styles).toMatch(/\.chat-image-draft > button\s*\{[^}]*min-height:\s*44px;/s);
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
    expect(recorder).toContain("recorder.start();");
    expect(recorder).not.toContain("recorder.start(250)");
  });

  it("provides poll creation and voting controls", () => {
    expect(read("ChatPollComposer.vue")).toContain("Анонимный опрос");
    expect(read("ChatPollComposer.vue")).toContain("Можно выбрать несколько");
    expect(read("ChatPollMessage.vue")).toContain("totalVoters");
    expect(read("ChatPollMessage.vue")).toContain("Завершить опрос");
  });
});
