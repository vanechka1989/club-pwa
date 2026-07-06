export type DeviceLayoutInput = {
  platform?: string | undefined;
  userAgent: string;
};

export type ViewportSizeInput = {
  width: number;
  height: number;
};

export type ViewportWidthInput = {
  browserWidth?: number | null;
  visualWidth?: number | null;
  screenWidth?: number | null;
  screenAvailWidth?: number | null;
  devicePixelRatio?: number | null;
};

export type DesktopViewportMobileScaleInput = ViewportWidthInput & {
  layoutWidth: number;
  hasTouchInput: boolean;
};

export type DeviceInsetInput = {
  top?: number | null;
  bottom?: number | null;
  left?: number | null;
  right?: number | null;
};

export type DeviceDiagnosticsInput = {
  capturedAt?: string;
  platform?: string | null;
  colorScheme?: string | null;
  userAgent: string;
  screen: {
    width?: number | null;
    height?: number | null;
    availWidth?: number | null;
    availHeight?: number | null;
    pixelRatio?: number | null;
  };
  viewport: {
    width?: number | null;
    height?: number | null;
  };
  visualViewport?: {
    width?: number | null;
    height?: number | null;
    offsetTop?: number | null;
    scale?: number | null;
  } | null;
  telegram: {
    version?: string | null;
    platform?: string | null;
    viewportHeight?: number | null;
    viewportStableHeight?: number | null;
    safeAreaInset?: DeviceInsetInput | null;
    contentSafeAreaInset?: DeviceInsetInput | null;
  };
  layoutCalibration?: LayoutCalibration | null;
  classes: string[];
};

export type LayoutCalibrationInput = {
  platform?: string | null;
  userAgent?: string;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  safeAreaInset?: DeviceInsetInput | null;
  contentSafeAreaInset?: DeviceInsetInput | null;
  visualBottomGap?: number | null;
};

export type LayoutCalibration = {
  topOffsetPx: number;
  chatTopOffsetPx: number;
  bottomOffsetPx: number;
  source: "android-narrow" | "android-wide" | "ios" | "default";
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

export function getMeasuredVisibleViewportHeight({
  telegramHeight,
  visualHeight,
  browserHeight
}: {
  telegramHeight?: number | null;
  visualHeight?: number | null;
  browserHeight?: number | null;
}) {
  const candidates = [telegramHeight, visualHeight, browserHeight].filter(
    (height): height is number => Number.isFinite(height) && Number(height) > 0
  );

  return candidates.length ? Math.min(...candidates) : 0;
}

export function getMeasuredKeyboardBottomGap({
  viewportBaseHeight,
  visibleHeight,
  visibleOffsetTop = 0
}: {
  viewportBaseHeight: number;
  visibleHeight: number;
  visibleOffsetTop?: number;
}) {
  if (!viewportBaseHeight || !visibleHeight) {
    return 0;
  }

  return Math.max(0, Math.round(viewportBaseHeight - visibleHeight - visibleOffsetTop));
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

function numberOrNull(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}

function finiteNumber(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function rounded(value: number) {
  return Math.round(value);
}

function roundedTo(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCssDeviceScreenWidth(input: ViewportWidthInput) {
  const screenWidths = [input.screenWidth, input.screenAvailWidth].filter(
    (width): width is number => Number.isFinite(width) && Number(width) > 0
  );
  if (!screenWidths.length) {
    return 0;
  }

  const rawScreenWidth = Math.min(...screenWidths);
  const pixelRatio = finiteNumber(input.devicePixelRatio, 1);
  const cssWidthFromPhysicalPixels = pixelRatio > 1 ? rawScreenWidth / pixelRatio : 0;
  const looksLikePhysicalPixels =
    cssWidthFromPhysicalPixels >= 280 && cssWidthFromPhysicalPixels <= 720 && cssWidthFromPhysicalPixels < rawScreenWidth * 0.75;

  return looksLikePhysicalPixels ? cssWidthFromPhysicalPixels : rawScreenWidth;
}

export function getMeasuredViewportWidth(input: ViewportWidthInput) {
  const liveWidths = [input.visualWidth, input.browserWidth].filter(
    (width): width is number => Number.isFinite(width) && Number(width) > 0
  );
  if (liveWidths.length) {
    return rounded(Math.max(...liveWidths));
  }

  return rounded(getCssDeviceScreenWidth(input));
}

export function getDesktopViewportMobileScale(input: DesktopViewportMobileScaleInput) {
  const deviceScreenWidth = getCssDeviceScreenWidth(input);
  const viewportScale = deviceScreenWidth > 0 ? input.layoutWidth / deviceScreenWidth : 1;
  const isDesktopViewportMobile = input.hasTouchInput && input.layoutWidth >= 700 && viewportScale >= 1.35;

  return {
    isDesktopViewportMobile,
    scale: isDesktopViewportMobile ? roundedTo(Math.min(2.8, Math.max(1, viewportScale)), 3) : 1
  };
}

function maxInsetSide(side: keyof DeviceInsetInput, ...insets: Array<DeviceInsetInput | null | undefined>) {
  return Math.max(0, ...insets.map((inset) => finiteNumber(inset?.[side], 0)));
}

function insetOrNull(value: DeviceInsetInput | null | undefined) {
  if (!value) {
    return null;
  }

  return {
    top: numberOrNull(value.top),
    bottom: numberOrNull(value.bottom),
    left: numberOrNull(value.left),
    right: numberOrNull(value.right)
  };
}

export function calculateLayoutCalibration(input: LayoutCalibrationInput): LayoutCalibration {
  const userAgent = input.userAgent ?? "";
  const classes = getDeviceLayoutClasses({ platform: input.platform ?? "", userAgent });
  const isAndroid = classes.includes("club-android");
  const isIos = classes.includes("club-ios");
  const width = finiteNumber(input.viewportWidth, 0);
  const height = finiteNumber(input.viewportHeight, 0);
  const isNarrow = width > 0 && width <= 380;
  const isShort = height > 0 && height <= 780;
  const topInset = maxInsetSide("top", input.safeAreaInset, input.contentSafeAreaInset);
  const bottomInset = maxInsetSide("bottom", input.safeAreaInset, input.contentSafeAreaInset);
  const bottomOffsetPx = rounded(Math.max(bottomInset, finiteNumber(input.visualBottomGap, 0)));

  if (isAndroid) {
    if (isNarrow) {
      const shortBonus = isShort ? 4 : 0;
      return {
        topOffsetPx: rounded(clamp(topInset + 52 + shortBonus, 92, 106)),
        chatTopOffsetPx: rounded(clamp(topInset + 70 + shortBonus, 112, 126)),
        bottomOffsetPx,
        source: "android-narrow"
      };
    }

    return {
      topOffsetPx: rounded(clamp(topInset + 28, 72, 92)),
      chatTopOffsetPx: rounded(clamp(topInset + 44, 88, 112)),
      bottomOffsetPx,
      source: "android-wide"
    };
  }

  if (isIos) {
    return {
      topOffsetPx: rounded(clamp(topInset + 16, 76, 96)),
      chatTopOffsetPx: rounded(clamp(topInset + 34, 96, 112)),
      bottomOffsetPx,
      source: "ios"
    };
  }

  return {
    topOffsetPx: rounded(clamp(topInset + 32, 72, 100)),
    chatTopOffsetPx: rounded(clamp(topInset + 48, 88, 116)),
    bottomOffsetPx,
    source: "default"
  };
}

export function collectDeviceDiagnostics(input: DeviceDiagnosticsInput) {
  return {
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    platform: input.platform ?? null,
    colorScheme: input.colorScheme ?? null,
    userAgent: input.userAgent,
    screen: {
      width: numberOrNull(input.screen.width),
      height: numberOrNull(input.screen.height),
      availWidth: numberOrNull(input.screen.availWidth),
      availHeight: numberOrNull(input.screen.availHeight),
      pixelRatio: numberOrNull(input.screen.pixelRatio)
    },
    viewport: {
      width: numberOrNull(input.viewport.width),
      height: numberOrNull(input.viewport.height)
    },
    visualViewport: input.visualViewport
      ? {
          width: numberOrNull(input.visualViewport.width),
          height: numberOrNull(input.visualViewport.height),
          offsetTop: numberOrNull(input.visualViewport.offsetTop),
          scale: numberOrNull(input.visualViewport.scale)
        }
      : null,
    telegram: {
      version: input.telegram.version ?? null,
      platform: input.telegram.platform ?? null,
      viewportHeight: numberOrNull(input.telegram.viewportHeight),
      viewportStableHeight: numberOrNull(input.telegram.viewportStableHeight),
      safeAreaInset: insetOrNull(input.telegram.safeAreaInset),
      contentSafeAreaInset: insetOrNull(input.telegram.contentSafeAreaInset)
    },
    layoutCalibration: input.layoutCalibration ?? null,
    classes: Array.from(new Set(input.classes))
  };
}

export function collectCurrentDeviceDiagnostics() {
  const viewportHeight = Math.max(window.visualViewport?.height ?? 0, window.innerHeight ?? 0);
  const viewportWidth = getMeasuredViewportWidth({
    browserWidth: window.innerWidth ?? null,
    visualWidth: window.visualViewport?.width ?? null,
    screenWidth: window.screen?.width ?? null,
    screenAvailWidth: window.screen?.availWidth ?? null,
    devicePixelRatio: window.devicePixelRatio ?? null
  });
  const platform = navigator.platform ?? null;
  const userAgent = navigator.userAgent;
  const classes = [
    ...getDeviceLayoutClasses({ platform: platform ?? "", userAgent }),
    ...getViewportSizeClasses({ width: viewportWidth, height: viewportHeight })
  ];

  return collectDeviceDiagnostics({
    platform,
    colorScheme: window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    userAgent,
    screen: {
      width: window.screen?.width ?? null,
      height: window.screen?.height ?? null,
      availWidth: window.screen?.availWidth ?? null,
      availHeight: window.screen?.availHeight ?? null,
      pixelRatio: window.devicePixelRatio ?? null
    },
    viewport: {
      width: window.innerWidth ?? null,
      height: window.innerHeight ?? null
    },
    visualViewport: window.visualViewport
      ? {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          offsetTop: window.visualViewport.offsetTop,
          scale: window.visualViewport.scale
        }
      : null,
    telegram: {
      version: null,
      platform: null,
      viewportHeight: null,
      viewportStableHeight: null,
      safeAreaInset: null,
      contentSafeAreaInset: null
    },
    layoutCalibration: calculateLayoutCalibration({
      platform,
      userAgent,
      viewportWidth,
      viewportHeight,
      safeAreaInset: null,
      contentSafeAreaInset: null,
      visualBottomGap:
        window.visualViewport && viewportHeight > 0
          ? Math.max(0, Math.round(viewportHeight - window.visualViewport.height - window.visualViewport.offsetTop))
          : 0
    }),
    classes
  });
}
