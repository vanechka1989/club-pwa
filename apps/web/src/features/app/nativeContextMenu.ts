const nativeContextMenuAllowedSelector = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  "[data-native-context-menu]"
].join(", ");

function targetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }

  return target instanceof Node ? target.parentElement : null;
}

export function shouldAllowNativeContextMenu(target: EventTarget | null) {
  return targetElement(target)?.closest(nativeContextMenuAllowedSelector) !== null;
}

export function installNativeContextMenuGuard(root: Document = document) {
  const preventNativeContextMenu = (event: MouseEvent) => {
    if (!shouldAllowNativeContextMenu(event.target)) {
      event.preventDefault();
    }
  };

  root.addEventListener("contextmenu", preventNativeContextMenu, true);

  return () => {
    root.removeEventListener("contextmenu", preventNativeContextMenu, true);
  };
}
