export type CommunityViewportAnchor = { elementId: string; offsetTop: number };

export function captureCommunityViewport(container: HTMLElement | null): CommunityViewportAnchor | null {
  if (!container) return null;
  const viewport = container.getBoundingClientRect();
  for (const element of container.querySelectorAll<HTMLElement>(".chat-message")) {
    const bounds = element.getBoundingClientRect();
    if (bounds.bottom > viewport.top && bounds.top < viewport.bottom) {
      return { elementId: element.id, offsetTop: bounds.top - viewport.top };
    }
  }
  return null;
}

export function restoreCommunityViewport(
  container: HTMLElement,
  anchor: CommunityViewportAnchor | null,
  fallbackScrollTop: number,
  previousScrollHeight?: number
) {
  const target = anchor ? document.getElementById(anchor.elementId) : null;
  if (target && container.contains(target)) {
    const viewportTop = container.getBoundingClientRect().top;
    container.scrollTop += target.getBoundingClientRect().top - viewportTop - anchor!.offsetTop;
    return;
  }
  container.scrollTop = previousScrollHeight === undefined
    ? fallbackScrollTop
    : fallbackScrollTop + (container.scrollHeight - previousScrollHeight);
}
