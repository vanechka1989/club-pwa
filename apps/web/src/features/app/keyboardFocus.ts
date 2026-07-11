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

function numericCssVariable(name: string) {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function closestScrollContainer(element: HTMLElement) {
  return element.closest<HTMLElement>(".task-screen-route-layer, .app-shell");
}

function nudgeFocusedFieldIntoVisibleViewport(element: HTMLElement) {
  const visibleHeight = numericCssVariable("--club-visible-viewport-height") ?? window.visualViewport?.height ?? null;
  if (visibleHeight === null || !Number.isFinite(visibleHeight) || visibleHeight <= 0) {
    return;
  }

  const viewportHeight = visibleHeight;
  const rect = element.getBoundingClientRect();
  const padding = 16;
  let delta = 0;

  if (rect.bottom > viewportHeight - padding) {
    delta = rect.bottom - viewportHeight + padding;
  } else if (rect.top < padding) {
    delta = rect.top - padding;
  }

  if (Math.abs(delta) < 1) {
    return;
  }

  const scrollContainer = closestScrollContainer(element);
  if (scrollContainer) {
    try {
      scrollContainer.scrollBy?.({ top: delta, behavior: "auto" });
    } catch {
      // Some test DOMs do not implement scrollBy; browsers do.
    }
    return;
  }

  try {
    window.scrollBy({ top: delta, behavior: "auto" });
  } catch {
    // Some test DOMs do not implement scrollBy; browsers do.
  }
}

export function ensureFocusedTextFieldVisible(
  element: Element | null,
  schedule: (handler: () => void, timeout: number) => number = window.setTimeout
) {
  if (!isTextFieldElement(element)) {
    return;
  }

  const isTaskScreenField = Boolean(element.closest(".task-screen"));

  schedule(() => {
    const isKeyboardManagedField = Boolean(
      !isTaskScreenField &&
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

    element.scrollIntoView({ block: "center", inline: "nearest", behavior: isTaskScreenField ? "auto" : "smooth" });
    nudgeFocusedFieldIntoVisibleViewport(element);
    for (const timeout of isTaskScreenField ? [80, 180, 360, 640] : [180]) {
      schedule(() => nudgeFocusedFieldIntoVisibleViewport(element), timeout);
    }
  }, isTaskScreenField ? 40 : 320);
}
