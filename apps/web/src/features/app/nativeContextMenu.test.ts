import { afterEach, describe, expect, it } from "vitest";
import { installNativeContextMenuGuard, shouldAllowNativeContextMenu } from "./nativeContextMenu";

const mountedElements: Element[] = [];
const guardCleanups: Array<() => void> = [];

function mountElement<T extends Element>(element: T): T {
  document.body.append(element);
  mountedElements.push(element);
  return element;
}

function dispatchContextMenu(target: Element) {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function installGuard() {
  const cleanup = installNativeContextMenuGuard(document);
  guardCleanups.push(cleanup);
  return cleanup;
}

afterEach(() => {
  for (const cleanup of guardCleanups.splice(0)) {
    cleanup();
  }
  for (const element of mountedElements.splice(0)) {
    element.remove();
  }
});

describe("native context menu guard", () => {
  it("prevents the browser context menu on ordinary application UI", () => {
    const removeGuard = installGuard();
    const button = mountElement(document.createElement("button"));
    const link = mountElement(document.createElement("a"));

    expect(dispatchContextMenu(button).defaultPrevented).toBe(true);
    expect(dispatchContextMenu(link).defaultPrevented).toBe(true);

    removeGuard();
  });

  it.each(["input", "textarea", "select"])("keeps native editing actions available in %s", (tagName) => {
    const removeGuard = installGuard();
    const control = mountElement(document.createElement(tagName));

    expect(dispatchContextMenu(control).defaultPrevented).toBe(false);

    removeGuard();
  });

  it("allows descendants of editable and explicitly opted-out regions", () => {
    const removeGuard = installGuard();
    const editable = mountElement(document.createElement("div"));
    editable.setAttribute("contenteditable", "true");
    const editableChild = document.createElement("span");
    editable.append(editableChild);

    const optedOut = mountElement(document.createElement("div"));
    optedOut.dataset.nativeContextMenu = "";
    const optedOutChild = document.createElement("span");
    optedOut.append(optedOutChild);

    expect(shouldAllowNativeContextMenu(editableChild)).toBe(true);
    expect(dispatchContextMenu(editableChild).defaultPrevented).toBe(false);
    expect(dispatchContextMenu(optedOutChild).defaultPrevented).toBe(false);

    removeGuard();
  });

  it("removes the document listener during cleanup", () => {
    const removeGuard = installGuard();
    const button = mountElement(document.createElement("button"));

    removeGuard();

    expect(dispatchContextMenu(button).defaultPrevented).toBe(false);
  });
});
