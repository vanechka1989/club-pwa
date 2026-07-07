import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./ui";

describe("ui store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-scheme");
    document.documentElement.removeAttribute("data-visual-scale");
    document.documentElement.style.removeProperty("--club-user-visual-scale");
    document.documentElement.style.removeProperty("--club-user-font-root");
    document.documentElement.style.removeProperty("--club-user-font-base");
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
