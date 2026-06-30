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
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }, 320);
}
