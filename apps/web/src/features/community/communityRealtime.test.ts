import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(resolve(__dirname, "CommunitySection.vue"), "utf8");
const clientSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf8");

describe("community realtime client", () => {
  it("opens the cookie-authenticated EventSource endpoint", () => {
    expect(clientSource).toContain("export function createCommunityEventSource");
    expect(clientSource).toContain('params.set("pwa", "1")');
    expect(clientSource).toContain('`${apiUrl.replace(/\\\/$/, "")}/community/events?${params.toString()}`');
    expect(clientSource).toContain("withCredentials: true");
  });

  it("syncs chats from SSE and cleans up the connection", () => {
    expect(componentSource).toContain("createCommunityEventSource");
    expect(componentSource).toContain('addEventListener("community.changed"');
    expect(componentSource).toContain('addEventListener("ready"');
    expect(componentSource).toContain("scheduleRealtimeSync");
    expect(componentSource).toContain("communityEventSource.close()");
  });

  it("removes the two-second selected-chat polling loop", () => {
    expect(componentSource).not.toContain("startMessageRefresh");
    expect(componentSource).not.toContain("stopMessageRefresh");
    expect(componentSource).not.toMatch(/setInterval\([\s\S]{0,220}refreshSelectedTopic[\s\S]{0,80}2000/);
  });

  it("keeps an open chat synchronized while the event stream is disconnected", () => {
    expect(componentSource).toContain("function startRealtimeFallback");
    expect(componentSource).toContain("function stopRealtimeFallback");
    expect(componentSource).toMatch(/startRealtimeFallback[\s\S]*selectedTopic\.value[\s\S]*refreshSelectedTopic/);
    expect(componentSource).toMatch(/eventSource\.onerror[\s\S]{0,180}startRealtimeFallback\(\)/);
    expect(componentSource).toMatch(/eventSource\.onopen[\s\S]{0,180}stopRealtimeFallback\(\)/);
  });

  it("replays an invalidation received while messages are already refreshing", () => {
    expect(componentSource).toContain("refreshSelectedTopicQueued");
    expect(componentSource).toMatch(/if \(refreshInFlight\)[\s\S]{0,100}refreshSelectedTopicQueued = true/);
    expect(componentSource).toMatch(/finally[\s\S]{0,180}refreshSelectedTopicQueued[\s\S]{0,180}refreshSelectedTopic/);
  });
});
