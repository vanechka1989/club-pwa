import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  dismissActiveTextFieldBeforeOperation,
  ensureFocusedTextFieldVisible,
  isTextFieldElement,
  keepActiveSupportFieldVisible
} from "./keyboardFocus";

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
    expect(appSource).toContain("const keyboardThreshold = keyboardWasOpen ? 56 : 96");
    expect(appSource).toContain("const isKeyboardOpen = visualBottomGap > keyboardThreshold && isTextFieldElement(document.activeElement)");
    expect(appSource).toContain("isTextFieldElement");
    expect(appSource).not.toContain("isIosPlatform && visualBottomGap > 80");
    expect(appSource).toContain("ensureFocusedTextFieldVisible");
    expect(appSource).toContain('document.addEventListener("focusin", handleTextFieldFocusIn)');
    expect(appSource).toContain("keepActiveSupportFieldVisible");
    expect(appSource).toMatch(/syncViewportHeight\(\)[\s\S]*keepActiveSupportFieldVisible\(\)/);
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

  it("nudges support task fields inside their own scroll body without page-level center scrolling", () => {
    const supportLayer = document.createElement("div");
    supportLayer.className = "support-task-screen task-screen-route-layer";
    const taskScreen = document.createElement("section");
    taskScreen.className = "task-screen";
    const taskBody = document.createElement("div");
    taskBody.className = "task-screen-body";
    const textarea = document.createElement("textarea");
    const scrollIntoView = vi.fn();
    const scrollBy = vi.fn();
    const schedule = vi.fn((handler: () => void) => {
      handler();
      return 1;
    });
    textarea.scrollIntoView = scrollIntoView;
    taskBody.scrollBy = scrollBy;
    textarea.getBoundingClientRect = () =>
      ({ top: 430, bottom: 510, left: 0, right: 300, width: 300, height: 80, x: 0, y: 430, toJSON: () => ({}) }) as DOMRect;
    taskBody.append(textarea);
    taskScreen.append(taskBody);
    supportLayer.append(taskScreen);
    document.body.append(supportLayer);
    document.documentElement.style.setProperty("--club-visible-viewport-top", "80px");
    document.documentElement.style.setProperty("--club-visible-viewport-height", "320px");

    ensureFocusedTextFieldVisible(textarea, schedule);

    expect(schedule).toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollBy).toHaveBeenCalledWith({ top: 126, behavior: "auto" });
    supportLayer.remove();
    document.documentElement.style.removeProperty("--club-visible-viewport-top");
    document.documentElement.style.removeProperty("--club-visible-viewport-height");
  });

  it("rechecks the active support field after the iOS visual viewport settles", () => {
    const supportLayer = document.createElement("div");
    supportLayer.className = "support-task-screen task-screen-route-layer";
    const taskBody = document.createElement("div");
    taskBody.className = "task-screen-body";
    const textarea = document.createElement("textarea");
    const scrollBy = vi.fn();
    taskBody.scrollBy = scrollBy;
    textarea.getBoundingClientRect = () =>
      ({ top: 430, bottom: 510, left: 0, right: 300, width: 300, height: 80, x: 0, y: 430, toJSON: () => ({}) }) as DOMRect;
    taskBody.append(textarea);
    supportLayer.append(taskBody);
    document.body.append(supportLayer);
    document.documentElement.style.setProperty("--club-visible-viewport-top", "80px");
    document.documentElement.style.setProperty("--club-visible-viewport-height", "320px");
    textarea.focus();

    keepActiveSupportFieldVisible();

    expect(scrollBy).toHaveBeenCalledWith({ top: 126, behavior: "auto" });
    supportLayer.remove();
    document.documentElement.style.removeProperty("--club-visible-viewport-top");
    document.documentElement.style.removeProperty("--club-visible-viewport-height");
  });

  it("does not scroll the routed support layer for a footer composer", () => {
    const supportLayer = document.createElement("div");
    supportLayer.className = "support-task-screen support-ticket-task-screen task-screen-route-layer";
    const taskScreen = document.createElement("section");
    taskScreen.className = "task-screen";
    const taskBody = document.createElement("div");
    taskBody.className = "task-screen-body";
    const footer = document.createElement("footer");
    footer.className = "task-screen-footer";
    const textarea = document.createElement("textarea");
    const routeScrollBy = vi.fn();
    const bodyScrollBy = vi.fn();
    const scrollIntoView = vi.fn();
    textarea.scrollIntoView = scrollIntoView;
    textarea.getBoundingClientRect = () =>
      ({ top: 430, bottom: 510, left: 0, right: 300, width: 300, height: 80, x: 0, y: 430, toJSON: () => ({}) }) as DOMRect;
    supportLayer.scrollBy = routeScrollBy;
    taskBody.scrollBy = bodyScrollBy;
    footer.append(textarea);
    taskScreen.append(taskBody, footer);
    supportLayer.append(taskScreen);
    document.body.append(supportLayer);
    document.documentElement.style.setProperty("--club-visible-viewport-top", "80px");
    document.documentElement.style.setProperty("--club-visible-viewport-height", "320px");

    ensureFocusedTextFieldVisible(textarea, (handler) => {
      handler();
      return 1;
    });

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(routeScrollBy).not.toHaveBeenCalled();
    expect(bodyScrollBy).not.toHaveBeenCalled();
    supportLayer.remove();
    document.documentElement.style.removeProperty("--club-visible-viewport-top");
    document.documentElement.style.removeProperty("--club-visible-viewport-height");
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

  it("waits for the iOS keyboard dismissal before a blocking operation starts", async () => {
    document.body.classList.add("club-ios", "club-keyboard-open");
    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    textarea.focus();
    const wait = vi.fn(async () => undefined);

    await dismissActiveTextFieldBeforeOperation(wait);

    expect(document.activeElement).not.toBe(textarea);
    expect(wait).toHaveBeenCalledWith(280);
    textarea.remove();
    document.body.classList.remove("club-ios", "club-keyboard-open");
  });

  it("does not delay operations on Android after dismissing the active field", async () => {
    document.body.classList.add("club-android", "club-keyboard-open");
    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    textarea.focus();
    const wait = vi.fn(async () => undefined);

    await dismissActiveTextFieldBeforeOperation(wait);

    expect(document.activeElement).not.toBe(textarea);
    expect(wait).not.toHaveBeenCalled();
    textarea.remove();
    document.body.classList.remove("club-android", "club-keyboard-open");
  });
});
