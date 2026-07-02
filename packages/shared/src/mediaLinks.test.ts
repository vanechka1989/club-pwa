import { describe, expect, it } from "vitest";
import { getYouTubeEmbedUrl, isYouTubeMediaUrl, normalizeExternalMediaUrl } from "./index";

describe("media link helpers", () => {
  it("accepts only http and https external media urls", () => {
    expect(normalizeExternalMediaUrl(" https://cdn.example.com/video.mp4 ")).toBe("https://cdn.example.com/video.mp4");
    expect(normalizeExternalMediaUrl("http://cdn.example.com/audio.mp3")).toBe("http://cdn.example.com/audio.mp3");
    expect(normalizeExternalMediaUrl("ftp://cdn.example.com/video.mp4")).toBeNull();
    expect(normalizeExternalMediaUrl("not a url")).toBeNull();
  });

  it("builds YouTube embed urls from common YouTube links", () => {
    expect(getYouTubeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1"
    );
    expect(getYouTubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1"
    );
    expect(getYouTubeEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1"
    );
    expect(getYouTubeEmbedUrl("https://www.youtube.com/live/EVHs7jmRdXk")).toBe(
      "https://www.youtube.com/embed/EVHs7jmRdXk?rel=0&playsinline=1"
    );
  });

  it("does not treat ordinary links as YouTube", () => {
    expect(isYouTubeMediaUrl("https://cdn.example.com/video.mp4")).toBe(false);
    expect(getYouTubeEmbedUrl("https://cdn.example.com/video.mp4")).toBeNull();
  });
});
