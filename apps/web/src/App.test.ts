import { cleanup, render, screen } from "@testing-library/vue";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";

describe("App", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the app shell", () => {
    render(App, {
      global: {
        plugins: [createPinia()]
      }
    });

    expect(screen.getByRole("button", { name: "Профиль" })).toBeTruthy();
  });

  it("resets window scroll when changing sections", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

    render(App, {
      global: {
        plugins: [createPinia()]
      }
    });

    await screen.getByRole("button", { name: "Модули" }).click();

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });
});
