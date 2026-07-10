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

  it("defaults new clients to the dark soft-touch appearance with the single midnight palette", () => {
    const ui = useUiStore();

    expect(ui.theme).toBe("dark");
    expect(ui.colorScheme).toBe("midnight");
    expect(ui.designTheme).toBe("dark-soft-touch");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.scheme).toBe("midnight");
    expect(document.documentElement.dataset.designTheme).toBe("dark-soft-touch");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem("club-appearance-version")).toBe("6");
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
    localStorage.setItem("club-theme", "light");
    localStorage.setItem("club-design-theme", "graphite-electric-blue");

    const ui = useUiStore();

    expect(ui.theme).toBe("light");
    expect(ui.designTheme).toBe("graphite-electric-blue");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.designTheme).toBe("graphite-electric-blue");
  });

  it("falls back to Dark Soft Touch for an unknown saved design theme", () => {
    localStorage.setItem("club-design-theme", "legacy-blue");

    const ui = useUiStore();

    expect(ui.designTheme).toBe("dark-soft-touch");
    expect(localStorage.getItem("club-design-theme")).toBe("dark-soft-touch");
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

  it("keeps a saved day or night choice but collapses legacy color palettes to midnight", () => {
    localStorage.setItem("club-appearance-version", "4");
    localStorage.setItem("club-theme", "light");
    localStorage.setItem("club-color-scheme", "coffee");

    const ui = useUiStore();

    expect(ui.theme).toBe("light");
    expect(ui.colorScheme).toBe("midnight");
    expect(document.documentElement.dataset.scheme).toBe("midnight");
    expect(localStorage.getItem("club-color-scheme")).toBe("midnight");
    expect(localStorage.getItem("club-appearance-version")).toBe("6");
  });

  it("persists visual scale as a numeric root variable for adaptive UI density", () => {
    const ui = useUiStore();

    ui.setVisualScale(1.7);

    expect(ui.visualScale).toBe(1.7);
    expect(localStorage.getItem("club-visual-scale")).toBe("1.7");
    expect(localStorage.getItem("club-visual-scale-version")).toBe("3");
    expect(document.documentElement.dataset.visualScale).toBe("1.7");
    expect(document.documentElement.style.getPropertyValue("--club-user-visual-scale")).toBe("1.7");
    expect(document.documentElement.style.getPropertyValue("--club-user-font-root")).toBe("27.2px");
    expect(document.documentElement.style.getPropertyValue("--club-user-font-base")).toBe("25.5px");
  });

  it("maps scale 1.0 to the normal mobile baseline", () => {
    const ui = useUiStore();

    ui.setVisualScale(1);

    expect(document.documentElement.style.getPropertyValue("--club-user-font-root")).toBe("16.0px");
    expect(document.documentElement.style.getPropertyValue("--club-user-font-base")).toBe("15.0px");
  });

  it("migrates legacy saved visual scale to the normal 1.0 baseline", () => {
    localStorage.setItem("club-visual-scale", "2.0");

    const ui = useUiStore();

    expect(ui.visualScale).toBe(1);
    expect(localStorage.getItem("club-visual-scale")).toBe("1.0");
    expect(localStorage.getItem("club-visual-scale-version")).toBe("3");
    expect(document.documentElement.style.getPropertyValue("--club-user-font-root")).toBe("16.0px");
  });

  it("clamps visual scale to one decimal between 1 and 2", () => {
    const ui = useUiStore();

    ui.setVisualScale(0.5);
    expect(ui.visualScale).toBe(1);

    ui.setVisualScale(2.8);
    expect(ui.visualScale).toBe(2);

    ui.setVisualScale(1.24);
    expect(ui.visualScale).toBe(1.2);
  });
});
