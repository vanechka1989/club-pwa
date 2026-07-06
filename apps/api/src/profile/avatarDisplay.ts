export type AvatarDisplayInput = {
  avatarPositionX?: unknown;
  avatarPositionY?: unknown;
  avatarScale?: unknown;
} | null | undefined;

export type AvatarDisplay = {
  avatarPositionX: number;
  avatarPositionY: number;
  avatarScale: number;
};

function toFiniteNumber(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundDisplayValue(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizeAvatarDisplay(input: AvatarDisplayInput): AvatarDisplay {
  return {
    avatarPositionX: roundDisplayValue(clamp(toFiniteNumber(input?.avatarPositionX, 50), 0, 100)),
    avatarPositionY: roundDisplayValue(clamp(toFiniteNumber(input?.avatarPositionY, 50), 0, 100)),
    avatarScale: roundDisplayValue(clamp(toFiniteNumber(input?.avatarScale, 1), 1, 2.5))
  };
}
