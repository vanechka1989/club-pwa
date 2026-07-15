export type DeviceMode = "mobile" | "mobile-desktop" | "desktop" | "unknown";
export type DeviceModeNoticeKind = "mobile-desktop" | "desktop";

export type DeviceModeInput = {
  userAgent: string;
  platform?: string | null;
  userAgentDataMobile?: boolean | null;
  maxTouchPoints?: number | null;
  pointerCoarse?: boolean | null;
  pointerFine?: boolean | null;
  screenWidth?: number | null;
  screenHeight?: number | null;
  screenAvailWidth?: number | null;
  screenAvailHeight?: number | null;
  devicePixelRatio?: number | null;
  layoutWidth: number;
  layoutHeight: number;
  isStandaloneDisplay?: boolean | null;
};

export type DeviceModeReason =
  | "physical-phone"
  | "handheld-user-agent"
  | "mobile-client-hint"
  | "desktop-browser-signals"
  | "desktop-hardware-signals"
  | "tablet-protected"
  | "insufficient-signals";

export type DeviceModeResult = {
  mode: DeviceMode;
  reasons: DeviceModeReason[];
};

function finitePositive(value: number | null | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}

function getRawScreenWidth(input: DeviceModeInput) {
  const candidates = [input.screenWidth, input.screenAvailWidth]
    .map(finitePositive)
    .filter((value) => value > 0);

  return candidates.length ? Math.min(...candidates) : 0;
}

function getRawScreenHeight(input: DeviceModeInput) {
  const candidates = [input.screenHeight, input.screenAvailHeight]
    .map(finitePositive)
    .filter((value) => value > 0);

  return candidates.length ? Math.max(...candidates) : 0;
}

function getCssScreenWidth(input: DeviceModeInput) {
  const rawWidth = getRawScreenWidth(input);
  const pixelRatio = Math.max(1, finitePositive(input.devicePixelRatio) || 1);
  const scaledWidth = rawWidth / pixelRatio;
  const rawHeight = getRawScreenHeight(input);
  const scaledHeight = rawHeight / pixelRatio;
  const looksLikePhysicalPixels =
    pixelRatio > 1 &&
    scaledWidth >= 280 &&
    scaledWidth <= 720 &&
    (rawHeight === 0 || (scaledHeight >= 480 && scaledHeight <= 1400)) &&
    scaledWidth < rawWidth * 0.75;

  return looksLikePhysicalPixels ? scaledWidth : rawWidth;
}

function getCssScreenHeight(input: DeviceModeInput) {
  const rawHeight = getRawScreenHeight(input);
  const pixelRatio = Math.max(1, finitePositive(input.devicePixelRatio) || 1);
  const scaledHeight = rawHeight / pixelRatio;
  const cssWidth = getCssScreenWidth(input);
  const rawWidth = getRawScreenWidth(input);
  const widthWasScaled = rawWidth > 0 && cssWidth > 0 && cssWidth < rawWidth * 0.75;

  return widthWasScaled && scaledHeight >= 480 && scaledHeight <= 1400 ? scaledHeight : rawHeight;
}

function isProtectedTablet(input: DeviceModeInput, hasTouch: boolean) {
  const userAgent = input.userAgent ?? "";
  const platform = input.platform ?? "";
  const rawWidth = getRawScreenWidth(input);
  const rawHeight = getRawScreenHeight(input);
  const shortestRawSide = Math.min(rawWidth || Number.POSITIVE_INFINITY, rawHeight || Number.POSITIVE_INFINITY);
  const longestRawSide = Math.max(rawWidth, rawHeight);
  const explicitIpad = /iPad/i.test(userAgent);
  const desktopIpadIdentity =
    platform === "MacIntel" &&
    hasTouch &&
    input.layoutWidth >= 700 &&
    shortestRawSide >= 744 &&
    longestRawSide <= 1700;

  return explicitIpad || desktopIpadIdentity;
}

export function classifyDeviceMode(input: DeviceModeInput): DeviceModeResult {
  const userAgent = input.userAgent ?? "";
  const platform = input.platform ?? "";
  const maxTouchPoints = finitePositive(input.maxTouchPoints);
  const hasTouch = maxTouchPoints > 0 || input.pointerCoarse === true;
  const handheldUserAgent = /iPhone|iPod/i.test(userAgent) || (/Android/i.test(userAgent) && /Mobile/i.test(userAgent));
  const hasDesktopUserAgent = /Windows NT|Macintosh|X11|CrOS/i.test(userAgent) || /Win32|Win64|MacIntel|Linux x86/i.test(platform);
  const cssScreenWidth = getCssScreenWidth(input);
  const cssScreenHeight = getCssScreenHeight(input);
  const pixelRatio = Math.max(1, finitePositive(input.devicePixelRatio) || 1);
  const physicalPhone =
    hasTouch &&
    cssScreenWidth >= 280 &&
    cssScreenWidth <= 600 &&
    (cssScreenHeight === 0 || (cssScreenHeight >= 480 && cssScreenHeight <= 1400)) &&
    pixelRatio >= 1.5;

  if (isProtectedTablet(input, hasTouch)) {
    return { mode: "unknown", reasons: ["tablet-protected"] };
  }

  if (physicalPhone) {
    const hasDesktopBrowserSignals =
      input.layoutWidth >= 700 ||
      input.userAgentDataMobile === false ||
      (hasDesktopUserAgent && !handheldUserAgent);

    if (hasDesktopBrowserSignals) {
      return { mode: "mobile-desktop", reasons: ["physical-phone", "desktop-browser-signals"] };
    }

    return {
      mode: "mobile",
      reasons: [
        "physical-phone",
        ...(input.userAgentDataMobile === true ? (["mobile-client-hint"] as DeviceModeReason[]) : []),
        ...(handheldUserAgent ? (["handheld-user-agent"] as DeviceModeReason[]) : [])
      ]
    };
  }

  if (input.userAgentDataMobile === true || handheldUserAgent) {
    return {
      mode: input.layoutWidth >= 700 && hasTouch ? "mobile-desktop" : "mobile",
      reasons: [
        ...(input.userAgentDataMobile === true ? (["mobile-client-hint"] as DeviceModeReason[]) : []),
        ...(handheldUserAgent ? (["handheld-user-agent"] as DeviceModeReason[]) : []),
        ...(input.layoutWidth >= 700 && hasTouch ? (["desktop-browser-signals"] as DeviceModeReason[]) : [])
      ]
    };
  }

  const rawScreenWidth = getRawScreenWidth(input);
  const hasLargeDesktopScreen = cssScreenWidth >= 720 || rawScreenWidth >= 1024;
  const hasDesktopHardwareSignals =
    hasDesktopUserAgent &&
    hasLargeDesktopScreen &&
    (input.pointerFine === true || !hasTouch || rawScreenWidth >= 1200);

  if (hasDesktopHardwareSignals) {
    return { mode: "desktop", reasons: ["desktop-hardware-signals"] };
  }

  return { mode: "unknown", reasons: ["insufficient-signals"] };
}

export function getDeviceModeNoticeKind(mode: DeviceMode, isStandaloneDisplay: boolean): DeviceModeNoticeKind | null {
  if (mode === "mobile-desktop") {
    return isStandaloneDisplay ? null : "mobile-desktop";
  }

  return mode === "desktop" ? "desktop" : null;
}

export function shouldForceMobilePresentation(mode: DeviceMode) {
  return mode !== "unknown";
}

export function getSafeQrTarget(href: string) {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "";
    }

    return `${url.origin}/`;
  } catch {
    return "";
  }
}
