export type AvatarGesturePoint = {
  clientX: number;
  clientY: number;
};

export type AvatarGestureMetrics = {
  centerX: number;
  centerY: number;
  distance: number | null;
};

export type AvatarGestureInput = {
  startPositionX: number;
  startPositionY: number;
  startScale: number;
  startCenterX: number;
  startCenterY: number;
  currentCenterX: number;
  currentCenterY: number;
  startDistance?: number | null;
  currentDistance?: number | null;
  previewWidth: number;
  previewHeight: number;
};

export type AvatarGestureResult = {
  positionX: number;
  positionY: number;
  scale: number;
};

export function clampAvatarPosition(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function clampAvatarScale(value: number) {
  return Math.min(2.5, Math.max(1, Math.round(value * 100) / 100));
}

export function getAvatarGestureMetrics(points: AvatarGesturePoint[]): AvatarGestureMetrics | null {
  if (!points.length) {
    return null;
  }

  if (points.length === 1) {
    const point = points[0];
    if (!point) {
      return null;
    }

    return {
      centerX: point.clientX,
      centerY: point.clientY,
      distance: null
    };
  }

  const [first, second] = points;
  if (!first || !second) {
    return null;
  }

  const centerX = (first.clientX + second.clientX) / 2;
  const centerY = (first.clientY + second.clientY) / 2;
  const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);

  return { centerX, centerY, distance };
}

export function applyAvatarGesture(input: AvatarGestureInput): AvatarGestureResult {
  const distanceRatio =
    input.startDistance && input.currentDistance && input.startDistance > 0
      ? input.currentDistance / input.startDistance
      : 1;
  const scale = clampAvatarScale(input.startScale * distanceRatio);
  const previewWidth = Math.max(1, input.previewWidth);
  const previewHeight = Math.max(1, input.previewHeight);
  const deltaX = ((input.currentCenterX - input.startCenterX) / previewWidth) * (100 / scale);
  const deltaY = ((input.currentCenterY - input.startCenterY) / previewHeight) * (100 / scale);

  return {
    positionX: clampAvatarPosition(input.startPositionX - deltaX),
    positionY: clampAvatarPosition(input.startPositionY - deltaY),
    scale
  };
}
