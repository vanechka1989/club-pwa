import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import ChatVoiceWaveform from "./ChatVoiceWaveform.vue";

describe("ChatVoiceWaveform", () => {
  afterEach(cleanup);

  it("renders normalized bars and marks the played portion", () => {
    const { container } = render(ChatVoiceWaveform, {
      props: { levels: [0.2, 0.5, 0.8, 1], currentTime: 5, duration: 10, interactive: true }
    });
    expect(container.querySelectorAll(".chat-voice-wave-bar")).toHaveLength(4);
    expect(container.querySelectorAll(".chat-voice-wave-bar-played")).toHaveLength(2);
    expect(screen.getByRole("slider", { name: "Перемотка голосового сообщения" })).toBeTruthy();
  });

  it("emits the selected playback time", async () => {
    const { emitted } = render(ChatVoiceWaveform, {
      props: { levels: [0.2, 0.5, 0.8, 1], currentTime: 0, duration: 20, interactive: true }
    });
    await fireEvent.update(screen.getByRole("slider"), "7.5");
    expect(emitted().seek?.[0]).toEqual([7.5]);
  });

  it("keeps a recording waveform non-interactive", () => {
    render(ChatVoiceWaveform, {
      props: { levels: [0.3, 0.7], currentTime: 0, duration: 0, interactive: false }
    });
    expect(screen.queryByRole("slider")).toBeNull();
  });
});
