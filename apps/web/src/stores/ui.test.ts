import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./ui";

describe("ui store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-scheme");
    document.documentElement.removeAttribute("data-design-theme");
    document.documentElement.removeAttribute("data-visual-scale");
    document.documentElement.style.removeProperty("--club-user-visual-scale");
    document.documentElement.style.removeProperty("--club-user-font-root");
    document.documentElement.style.removeProperty("--club-user-font-base");
    document.documentElement.style.colorScheme = "";
    setActivePinia(createPinia());
  });

  it("defaults new clients to Warm Clay in day mode with the single midnight palette", () => {
    const ui = useUiStore();

    expect(ui.theme).toBe("light");
    expect(ui.colorScheme).toBe("midnight");
    expect(ui.designTheme).toBe("warm-clay");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.scheme).toBe("midnight");
    expect(document.documentElement.dataset.designTheme).toBe("warm-clay");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(localStorage.getItem("club-appearance-version")).toBe("7");
  });

  it("migrates an existing version-6 appearance to Warm Clay day exactly once", () => {
    localStorage.setItem("club-appearance-version", "6");
    localStorage.setItem("club-theme", "dark");
    localStorage.setItem("club-design-theme", "graphite-electric-blue");

    const ui = useUiStore();

    expect(ui.theme).toBe("light");
    expect(ui.designTheme).toBe("warm-clay");
    expect(localStorage.getItem("club-theme")).toBe("light");
    expect(localStorage.getItem("club-design-theme")).toBe("warm-clay");
    expect(localStorage.getItem("club-appearance-version")).toBe("7");
  });

  it("restores a valid version-7 appearance after the migration", () => {
    localStorage.setItem("club-appearance-version", "7");
    localStorage.setItem("club-theme", "dark");
    localStorage.setItem("club-design-theme", "pine-teal");

    const ui = useUiStore();

    expect(ui.theme).toBe("dark");
    expect(ui.designTheme).toBe("pine-teal");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.designTheme).toBe("pine-teal");
  });

  it("switches design themes independently from day and night mode", () => {
    const ui = useUiStore();

    ui.setTheme("light");
    ui.setDesignTheme("graphite-electric-blue");

    expect(ui.theme).toBe("light");
    expect(ui.designTheme).toBe("graphite-electric-blue");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.designTheme).toBe("graphite-electric-blue");
    expect(localStorage.getItem("club-theme")).toBe("light");
    expect(localStorage.getItem("club-design-theme")).toBe("graphite-electric-blue");

    ui.setTheme("dark");

    expect(ui.designTheme).toBe("graphite-electric-blue");
    expect(document.documentElement.dataset.designTheme).toBe("graphite-electric-blue");
  });

  it("restores a saved Graphite design theme without changing the saved mode", () => {
    localStorage.setItem("club-appearance-version", "7");
    localStorage.setItem("club-theme", "light");
    localStorage.setItem("club-design-theme", "graphite-electric-blue");

    const ui = useUiStore();

    expect(ui.theme).toBe("light");
    expect(ui.designTheme).toBe("graphite-electric-blue");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.designTheme).toBe("graphite-electric-blue");
  });

  it.each(["pine-teal", "warm-clay", "plum-rose"] as const)(
    "restores the saved %s design theme independently from the mode",
    (savedDesignTheme) => {
      localStorage.setItem("club-appearance-version", "7");
      localStorage.setItem("club-theme", "light");
      localStorage.setItem("club-design-theme", savedDesignTheme);

      const ui = useUiStore();

      expect(ui.theme).toBe("light");
      expect(ui.designTheme).toBe(savedDesignTheme);
      expect(document.documentElement.dataset.designTheme).toBe(savedDesignTheme);
      expect(localStorage.getItem("club-design-theme")).toBe(savedDesignTheme);
    }
  );

  it("falls back to Warm Clay day for an unknown version-7 design theme", () => {
    localStorage.setItem("club-appearance-version", "7");
    localStorage.setItem("club-theme", "dark");
    localStorage.setItem("club-design-theme", "legacy-blue");

    const ui = useUiStore();

    expect(ui.theme).toBe("light");
    expect(ui.designTheme).toBe("warm-clay");
    expect(localStorage.getItem("club-theme")).toBe("light");
    expect(localStorage.getItem("club-design-theme")).toBe("warm-clay");
  });

  it("switches the browser controls between day and night themes", () => {
    const ui = useUiStore();

    ui.setTheme("light");

    expect(ui.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");

    ui.setTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("resets a legacy appearance while collapsing its color palette to midnight", () => {
    localStorage.setItem("club-appearance-version", "4");
    localStorage.setItem("club-theme", "dark");
    localStorage.setItem("club-design-theme", "graphite-electric-blue");
    localStorage.setItem("club-color-scheme", "coffee");

    const ui = useUiStore();

    expect(ui.theme).toBe("light");
    expect(ui.designTheme).toBe("warm-clay");
    expect(ui.colorScheme).toBe("midnight");
    expect(document.documentElement.dataset.scheme).toBe("midnight");
    expect(localStorage.getItem("club-color-scheme")).toBe("midnight");
    expect(localStorage.getItem("club-appearance-version")).toBe("7");
  });

  it("persists visual scale as a numeric root variable for adaptive UI density", () => {
    const ui = useUiStore();

    ui.setVisualScale(1.3);

    expect(ui.visualScale).toBe(1.3);
    expect(localStorage.getItem("club-visual-scale")).toBe("1.3");
    expect(localStorage.getItem("club-visual-scale-version")).toBe("4");
    expect(document.documentElement.dataset.visualScale).toBe("1.3");
    expect(document.documentElement.style.getPropertyValue("--club-user-visual-scale")).toBe("1.3");
    expect(document.documentElement.style.getPropertyValue("--club-user-font-root")).toBe("20.8px");
    expect(document.documentElement.style.getPropertyValue("--club-user-font-base")).toBe("19.5px");
  });

  it("maps scale 1.0 to the normal mobile baseline", () => {
    const ui = useUiStore();

    ui.setVisualScale(1);

    expect(document.documentElement.style.getPropertyValue("--club-user-font-root")).toBe("16.0px");
    expect(document.documentElement.style.getPropertyValue("--club-user-font-base")).toBe("15.0px");
  });

  it("migrates legacy saved visual scale to the compact 0.9 baseline", () => {
    localStorage.setItem("club-visual-scale", "2.0");

    const ui = useUiStore();

    expect(ui.visualScale).toBe(0.9);
    expect(localStorage.getItem("club-visual-scale")).toBe("0.9");
    expect(localStorage.getItem("club-visual-scale-version")).toBe("4");
    expect(document.documentElement.style.getPropertyValue("--club-user-font-root")).toBe("14.4px");
  });

  it("clamps visual scale to one decimal between 0.8 and 1.4", () => {
    const ui = useUiStore();

    ui.setVisualScale(0.5);
    expect(ui.visualScale).toBe(0.8);

    ui.setVisualScale(2.8);
    expect(ui.visualScale).toBe(1.4);

    ui.setVisualScale(1.24);
    expect(ui.visualScale).toBe(1.2);
  });
});
