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

type WaitForKeyboardDismiss = (timeout: number) => Promise<void>;

function waitForKeyboardDismiss(timeout: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, timeout));
}

export async function dismissActiveTextFieldBeforeOperation(
  wait: WaitForKeyboardDismiss = waitForKeyboardDismiss
) {
  const active = document.activeElement;
  if (!isTextFieldElement(active)) {
    return;
  }

  const shouldWaitForIosKeyboard =
    document.body.classList.contains("club-ios") && document.body.classList.contains("club-keyboard-open");

  active.blur();

  // iOS keeps the visual viewport reduced during the keyboard closing animation.
  // Starting a blocking operation before it ends leaves the progress UI behind
  // the translucent keyboard. Android restores the viewport synchronously here.
  if (shouldWaitForIosKeyboard) {
    await wait(280);
  }
}

function numericCssVariable(name: string) {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function closestScrollContainer(element: HTMLElement) {
  return element.closest<HTMLElement>(".task-screen-body, .task-screen-route-layer, .app-shell");
}

function visibleBottomBeforeTaskFooter(element: HTMLElement, viewportTop: number, viewportBottom: number) {
  const taskScreen = element.closest<HTMLElement>(".task-screen");
  const footer = taskScreen?.querySelector<HTMLElement>(":scope > .task-screen-footer");
  if (!footer || footer.contains(element)) {
    return viewportBottom;
  }

  const footerRect = footer.getBoundingClientRect();
  if (footerRect.height <= 0 || footerRect.top <= viewportTop || footerRect.top >= viewportBottom) {
    return viewportBottom;
  }

  return footerRect.top;
}

function nudgeFocusedFieldIntoVisibleViewport(element: HTMLElement) {
  const visibleHeight = numericCssVariable("--club-visible-viewport-height") ?? window.visualViewport?.height ?? null;
  if (visibleHeight === null || !Number.isFinite(visibleHeight) || visibleHeight <= 0) {
    return;
  }

  const cssViewportTop = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--club-visible-viewport-top")
  );
  const viewportTop = Number.isFinite(cssViewportTop)
    ? Math.max(0, cssViewportTop)
    : Math.max(0, window.visualViewport?.offsetTop ?? 0);
  const viewportBottom = viewportTop + visibleHeight;
  const visibleBottom = visibleBottomBeforeTaskFooter(element, viewportTop, viewportBottom);
  const rect = element.getBoundingClientRect();
  const padding = 16;
  let delta = 0;

  if (rect.bottom > visibleBottom - padding) {
    delta = rect.bottom - visibleBottom + padding;
  } else if (rect.top < viewportTop + padding) {
    delta = rect.top - viewportTop - padding;
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

export function keepActiveSupportFieldVisible() {
  const active = document.activeElement;
  if (!isTextFieldElement(active) || !active.closest(".support-task-screen")) {
    return;
  }

  // The reply composer is fixed to the task footer and follows the visual
  // viewport itself. Moving its route layer would shift the whole ticket.
  if (active.closest(".task-screen-footer, .support-reply-form")) {
    return;
  }

  nudgeFocusedFieldIntoVisibleViewport(active);
}

export function ensureFocusedTextFieldVisible(
  element: Element | null,
  schedule: (handler: () => void, timeout: number) => number = window.setTimeout
) {
  if (!isTextFieldElement(element)) {
    return;
  }

  // iOS can pan the visual viewport after focusing a field. Support screens must
  // correct only their internal scroll body; scrollIntoView here would move the
  // standalone page as well and cause the double-jump seen in Safari.
  if (element.closest(".support-task-screen")) {
    // Reply composers live in the fixed task footer, outside the scroll body.
    // Scrolling their closest route layer moves the entire ticket (header and
    // message history included) above the iOS visual viewport.
    if (element.closest(".task-screen-footer, .support-reply-form")) {
      return;
    }
    for (const timeout of [40, 120, 260, 520, 720]) {
      schedule(() => nudgeFocusedFieldIntoVisibleViewport(element), timeout);
    }
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
