import { computed, ref } from "vue";

export const portalTaskLayerDepth = ref(0);
export const hasPortalTaskLayer = computed(() => portalTaskLayerDepth.value > 0);

export function activatePortalTaskLayer(layer?: HTMLElement | null) {
  let active = true;
  portalTaskLayerDepth.value += 1;

  const focusedElement = document.activeElement;
  if (focusedElement instanceof HTMLElement && layer && !layer.contains(focusedElement)) {
    focusedElement.blur();
  }

  layer?.querySelector<HTMLElement>(".ui-page-header__back")?.focus({ preventScroll: true });

  return () => {
    if (!active) {
      return;
    }
    active = false;
    portalTaskLayerDepth.value = Math.max(0, portalTaskLayerDepth.value - 1);
  };
}

export function resetPortalTaskLayersForTests() {
  portalTaskLayerDepth.value = 0;
}
