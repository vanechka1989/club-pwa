import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ensureFocusedTextFieldVisible, isTextFieldElement } from "./keyboardFocus";

const appSource = readFileSync(resolve(__dirname, "../../App.vue"), "utf8");
const adminSource = readFileSync(resolve(__dirname, "../admin/AdminSection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

describe("keyboard focus handling", () => {
  it("blurs active text fields when switching main sections", () => {
    expect(appSource).toContain("blurActiveTextField");
    expect(appSource).toMatch(/async function selectSection[\s\S]*blurActiveTextField\(\)/);
    expect(appSource).toContain("@click=\"toggleNavCollapsed\"");
  });

  it("blurs active text fields when switching admin tabs", () => {
    expect(adminSource).toContain("selectAdminPanel");
    expect(adminSource).toMatch(/function selectAdminPanel[\s\S]*blurActiveTextField\(\)/);
    expect(adminSource).toContain("@click=\"selectAdminPanel(panel.id)\"");
  });

  it("keeps focused text fields visible above the mobile keyboard", () => {
    expect(appSource).toContain("--club-keyboard-bottom");
    expect(appSource).toContain("club-keyboard-open");
    expect(appSource).toContain("visualBottomGap > 80");
    expect(appSource).toContain("ensureFocusedTextFieldVisible");
    expect(appSource).toContain('document.addEventListener("focusin", handleTextFieldFocusIn)');
    expect(styles).toContain("body.club-keyboard-open .app-shell");
    expect(styles).toContain("body.club-keyboard-open .admin-modal-backdrop");
    expect(styles).toContain("body.club-keyboard-open .support-modal-backdrop");
  });

  it("scrolls focused text fields into the visible viewport", () => {
    const input = document.createElement("input");
    const scrollIntoView = vi.fn();
    input.scrollIntoView = scrollIntoView;

    ensureFocusedTextFieldVisible(input, (handler) => {
      handler();
      return 1;
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", inline: "nearest", behavior: "smooth" });
  });

  it("does not center-scroll the iOS chat composer input", () => {
    document.body.classList.add("club-ios", "community-chat-open");
    const form = document.createElement("form");
    form.className = "chat-compose";
    const input = document.createElement("input");
    const scrollIntoView = vi.fn();
    input.scrollIntoView = scrollIntoView;
    form.append(input);
    document.body.append(form);

    ensureFocusedTextFieldVisible(input, (handler) => {
      handler();
      return 1;
    });

    expect(scrollIntoView).not.toHaveBeenCalled();
    form.remove();
    document.body.classList.remove("club-ios", "community-chat-open");
  });

  it("detects regular and rich text fields", () => {
    const input = document.createElement("input");
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");

    expect(isTextFieldElement(input)).toBe(true);
    expect(isTextFieldElement(editor)).toBe(true);
    expect(isTextFieldElement(document.createElement("button"))).toBe(false);
  });
});
