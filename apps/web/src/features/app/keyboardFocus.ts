export function isTextFieldElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const tagName = element.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || element.isContentEditable || element.getAttribute("contenteditable") === "true";
}

export function blurActiveTextField() {
  const active = document.activeElement;
  if (isTextFieldElement(active)) {
    active.blur();
  }
}

export function ensureFocusedTextFieldVisible(
  element: Element | null,
  schedule: (handler: () => void, timeout: number) => number = window.setTimeout
) {
  if (!isTextFieldElement(element)) {
    return;
  }

  schedule(() => {
    const isKeyboardManagedField = Boolean(
      element.closest(
        [
          ".chat-compose",
          ".support-ticket-modal",
          ".admin-client-modal",
          ".admin-client-message-modal",
          ".module-name-modal",
          ".lesson-preview-modal",
          ".notification-center-panel"
        ].join(", ")
      )
    );

    if (isKeyboardManagedField) {
      return;
    }

    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }, 320);
}
