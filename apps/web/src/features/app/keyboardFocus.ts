export function blurActiveTextField() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) {
    return;
  }

  const tagName = active.tagName.toLowerCase();
  const isTextField = tagName === "input" || tagName === "textarea" || active.isContentEditable;
  if (isTextField) {
    active.blur();
  }
}
