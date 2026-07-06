import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./ui";

describe("ui store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-scheme");
    document.documentElement.removeAttribute("data-visual-scale");
    document.documentElement.style.colorScheme = "";
    setActivePinia(createPinia());
  });

  it("defaults new clients to the day lagoon appearance", () => {
    const ui = useUiStore();

    expect(ui.theme).toBe("light");
    expect(ui.colorScheme).toBe("azure");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.scheme).toBe("azure");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("persists visual scale as a root dataset for adaptive UI density", () => {
    const ui = useUiStore();

    ui.setVisualScale("large");

    expect(ui.visualScale).toBe("large");
    expect(localStorage.getItem("club-visual-scale")).toBe("large");
    expect(document.documentElement.dataset.visualScale).toBe("large");
  });
});
