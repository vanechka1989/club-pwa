import { computed, ref } from "vue";

type Point = { x: number; y: number };

export function useImageViewerGestures() {
  const scale = ref(1);
  const translateX = ref(0);
  const translateY = ref(0);
  const pointers = new Map<number, Point>();
  let previousDistance = 0;
  let previousCenter: Point | null = null;

  const imageStyle = computed(() => ({
    transform: `translate3d(${translateX.value}px, ${translateY.value}px, 0) scale(${scale.value})`
  }));

  function reset() {
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    pointers.clear();
    previousDistance = 0;
    previousCenter = null;
  }

  function distance([a, b]: Point[]) {
    return Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0));
  }

  function center([a, b]: Point[]) {
    return { x: ((a?.x ?? 0) + (b?.x ?? 0)) / 2, y: ((a?.y ?? 0) + (b?.y ?? 0)) / 2 };
  }

  function onPointerDown(event: PointerEvent) {
    (event.currentTarget as HTMLElement)?.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.values()];
    previousCenter = pointers.size === 2 ? center(points) : points[0] ?? null;
    previousDistance = pointers.size === 2 ? distance(points) : 0;
  }

  function onPointerMove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.values()];
    if (pointers.size === 2) {
      const nextDistance = distance(points);
      const nextCenter = center(points);
      if (previousDistance > 0) scale.value = Math.min(4, Math.max(1, scale.value * (nextDistance / previousDistance)));
      if (previousCenter && scale.value > 1) {
        translateX.value += nextCenter.x - previousCenter.x;
        translateY.value += nextCenter.y - previousCenter.y;
      }
      previousDistance = nextDistance;
      previousCenter = nextCenter;
      return;
    }
    if (scale.value > 1 && previousCenter) {
      translateX.value += event.clientX - previousCenter.x;
      translateY.value += event.clientY - previousCenter.y;
    }
    previousCenter = points[0] ?? null;
  }

  function onPointerUp(event: PointerEvent) {
    pointers.delete(event.pointerId);
    const points = [...pointers.values()];
    previousCenter = points[0] ?? null;
    previousDistance = 0;
    if (scale.value <= 1.01) reset();
  }

  function toggleZoom() {
    if (scale.value > 1) reset();
    else scale.value = 2;
  }

  return { imageStyle, scale, reset, toggleZoom, onPointerDown, onPointerMove, onPointerUp };
}
