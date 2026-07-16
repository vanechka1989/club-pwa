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
    expect(appSource).toContain("@click=\"selectSection(item.id)\"");
    expect(appSource).toContain('mobilePrimaryNavIds.includes(item.id)');
    expect(appSource).not.toContain("@click=\"toggleNavCollapsed\"");
  });

  it("blurs active text fields when switching admin tabs", () => {
    expect(adminSource).toContain("selectAdminPanel");
    expect(adminSource).toMatch(/function selectAdminPanel[\s\S]*blurActiveTextField\(\)/);
    expect(adminSource).toContain("@click=\"selectAdminPanel(panel.id)\"");
  });

  it("keeps focused text fields visible above the mobile keyboard", () => {
    expect(appSource).toContain("--club-keyboard-bottom");
    expect(appSource).toContain("--club-visible-viewport-bottom");
    expect(appSource).toContain("club-keyboard-open");
    expect(appSource).toContain("const isKeyboardOpen = visualBottomGap > 80 && isTextFieldElement(document.activeElement)");
    expect(appSource).toContain("isTextFieldElement");
    expect(appSource).not.toContain("isIosPlatform && visualBottomGap > 80");
    expect(appSource).toContain("ensureFocusedTextFieldVisible");
    expect(appSource).toContain('document.addEventListener("focusin", handleTextFieldFocusIn)');
    expect(styles).toContain("body.club-keyboard-open .app-shell");
    expect(styles).toContain("body.club-keyboard-open .admin-modal-backdrop");
    expect(styles).toContain("body.club-keyboard-open .support-modal-backdrop");
    expect(styles).toContain("body.club-keyboard-open .admin-client-modal");
    expect(styles).toContain("body.club-keyboard-open .lesson-preview-modal");
    expect(styles).toContain("max-height: var(--club-visible-viewport-height");
    expect(styles).toContain("body.club-ios .chat-input-row .text-input");
    expect(styles).toContain("font-size: 16px");
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

  it("does not center-scroll the chat composer input", () => {
    document.body.classList.add("club-android", "community-chat-open");
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
    document.body.classList.remove("club-android", "community-chat-open");
  });

  it("does not center-scroll fields inside keyboard-managed modals", () => {
    for (const className of ["support-ticket-modal", "admin-client-message-modal"]) {
      const modal = document.createElement("article");
      modal.className = className;
      const input = document.createElement("textarea");
      const scrollIntoView = vi.fn();
      input.scrollIntoView = scrollIntoView;
      modal.append(input);
      document.body.append(modal);

      ensureFocusedTextFieldVisible(input, (handler) => {
        handler();
        return 1;
      });

      expect(scrollIntoView).not.toHaveBeenCalled();
      modal.remove();
    }
  });

  it("does not center-scroll the module modal fields", () => {
    const modal = document.createElement("aside");
    modal.className = "module-name-modal";
    const input = document.createElement("input");
    const scrollIntoView = vi.fn();
    input.scrollIntoView = scrollIntoView;
    modal.append(input);
    document.body.append(modal);

    ensureFocusedTextFieldVisible(input, (handler) => {
      handler();
      return 1;
    });

    expect(scrollIntoView).not.toHaveBeenCalled();
    modal.remove();
  });

  it("center-scrolls module modal fields when they are inside a routed task screen", () => {
    const taskScreen = document.createElement("section");
    taskScreen.className = "task-screen";
    const modal = document.createElement("aside");
    modal.className = "module-name-modal";
    const input = document.createElement("input");
    const scrollIntoView = vi.fn();
    input.scrollIntoView = scrollIntoView;
    modal.append(input);
    taskScreen.append(modal);
    document.body.append(taskScreen);

    ensureFocusedTextFieldVisible(input, (handler) => {
      handler();
      return 1;
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", inline: "nearest", behavior: "auto" });
    taskScreen.remove();
  });

  it("leaves support task fields to the keyboard-aware task layout instead of double-scrolling iOS", () => {
    const supportLayer = document.createElement("div");
    supportLayer.className = "support-task-screen task-screen-route-layer";
    const taskScreen = document.createElement("section");
    taskScreen.className = "task-screen";
    const taskBody = document.createElement("div");
    taskBody.className = "task-screen-body";
    const textarea = document.createElement("textarea");
    const scrollIntoView = vi.fn();
    const schedule = vi.fn(() => 1);
    textarea.scrollIntoView = scrollIntoView;
    taskBody.append(textarea);
    taskScreen.append(taskBody);
    supportLayer.append(taskScreen);
    document.body.append(supportLayer);

    ensureFocusedTextFieldVisible(textarea, schedule);

    expect(schedule).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    supportLayer.remove();
  });

  it("keeps the module modal footer compact above keyboard-safe areas", () => {
    const moduleActionsRule = styles.match(/\.module-name-modal \.admin-form-actions\s*\{(?<body>[^}]*)\}/s)?.groups?.body ?? "";

    expect(moduleActionsRule).not.toContain("--club-system-bottom");
    expect(moduleActionsRule).toContain("padding-bottom: 0;");
    expect(styles).toContain("body.club-keyboard-open .module-name-backdrop");
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
