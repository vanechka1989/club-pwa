import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./ui";

describe("ui store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-scheme");
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
});
