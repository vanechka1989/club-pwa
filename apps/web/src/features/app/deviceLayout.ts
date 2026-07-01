export type DeviceLayoutInput = {
  platform?: string | undefined;
  userAgent: string;
};

export type ViewportSizeInput = {
  width: number;
  height: number;
};

export const deviceLayoutClasses = [
  "club-ios",
  "club-android",
  "club-samsung",
  "club-huawei",
  "club-android-compact-top",
  "club-screen-narrow",
  "club-screen-short",
  "club-screen-tall"
] as const;

export function getDeviceLayoutClasses({ platform = "", userAgent }: DeviceLayoutInput) {
  const normalizedPlatform = platform.toLowerCase();
  const isIos = normalizedPlatform === "ios" || normalizedPlatform === "macos" || /iPad|iPhone|iPod/.test(userAgent);
  const isAndroid = normalizedPlatform === "android" || /Android/i.test(userAgent);
  const isSamsung = /Samsung|SM-|SAMSUNG/i.test(userAgent);
  const isHuawei = /HUAWEI|HONOR|HarmonyOS|EMUI|JLN-LX1/i.test(userAgent);
  const usesCompactAndroidTopOffset = isAndroid && !isSamsung;

  return [
    isIos && "club-ios",
    isAndroid && "club-android",
    isSamsung && "club-samsung",
    isHuawei && "club-huawei",
    usesCompactAndroidTopOffset && "club-android-compact-top"
  ].filter((className): className is string => Boolean(className));
}

export function getViewportSizeClasses({ width, height }: ViewportSizeInput) {
  return [
    width > 0 && width <= 380 && "club-screen-narrow",
    height > 0 && height <= 780 && "club-screen-short",
    height >= 900 && "club-screen-tall"
  ].filter((className): className is string => Boolean(className));
}

export function syncLayoutClasses(targets: Array<HTMLElement | null | undefined>, classes: string[]) {
  for (const target of targets) {
    if (!target) {
      continue;
    }

    for (const className of deviceLayoutClasses) {
      target.classList.toggle(className, classes.includes(className));
    }
  }
}
