export type InstallPlatformKind = "ios" | "android" | "desktop";

export type InstallPlatformInput = {
  maxTouchPoints?: number;
  platform?: string;
  userAgent?: string;
};

export type InstallPlatform = {
  kind: InstallPlatformKind;
  isIos: boolean;
  isAndroid: boolean;
};

export function detectInstallPlatform(input: InstallPlatformInput = {}): InstallPlatform {
  const userAgent = input.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const platform = input.platform ?? (typeof navigator !== "undefined" ? navigator.platform : "");
  const maxTouchPoints = input.maxTouchPoints ?? (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0);
  const isIos = /iphone|ipad|ipod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  const isAndroid = /android/i.test(userAgent);

  return {
    kind: isIos ? "ios" : isAndroid ? "android" : "desktop",
    isIos,
    isAndroid
  };
}
