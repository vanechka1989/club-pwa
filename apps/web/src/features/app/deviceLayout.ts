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

export type MobileDeviceShellScaleInput = ViewportWidthInput & {
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
  browser: {
    displayMode?: string | null;
    standalone?: boolean | null;
    safeAreaInset?: DeviceInsetInput | null;
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
  bottomOffsetPx: number;
  source: "android" | "ios" | "browser";
};

export const deviceLayoutClasses = [
  "club-ios",
  "club-android",
  "club-screen-narrow",
  "club-screen-short",
  "club-screen-tall"
] as const;

export function getDeviceLayoutClasses({ platform = "", userAgent }: DeviceLayoutInput) {
  const normalizedPlatform = platform.toLowerCase();
  const isIos = normalizedPlatform === "ios" || normalizedPlatform === "macos" || /iPad|iPhone|iPod/.test(userAgent);
  const isAndroid = normalizedPlatform === "android" || /Android/i.test(userAgent);

  return [
    isIos && "club-ios",
    isAndroid && "club-android"
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
  appHeight,
  visualHeight,
  browserHeight
}: {
  appHeight?: number | null;
  visualHeight?: number | null;
  browserHeight?: number | null;
}) {
  const candidates = [appHeight, visualHeight, browserHeight].filter(
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

export function getMobileDeviceShellScale(input: MobileDeviceShellScaleInput) {
  const deviceScreenWidth = getCssDeviceScreenWidth(input);
  const viewportScale = deviceScreenWidth > 0 ? input.layoutWidth / deviceScreenWidth : 1;
  const needsViewportCompensation = input.hasTouchInput && input.layoutWidth >= 700 && viewportScale >= 1.35;
  const isMobileDeviceShell = input.hasTouchInput && (needsViewportCompensation || (deviceScreenWidth > 0 && deviceScreenWidth <= 720));

  return {
    isMobileDeviceShell,
    scale: needsViewportCompensation ? roundedTo(Math.min(2.8, Math.max(1, viewportScale)), 3) : 1
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
  const bottomInset = maxInsetSide("bottom", input.safeAreaInset, input.contentSafeAreaInset);
  const bottomOffsetPx = rounded(Math.max(bottomInset, finiteNumber(input.visualBottomGap, 0)));

  return {
    bottomOffsetPx,
    source: isAndroid ? "android" : isIos ? "ios" : "browser"
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
    browser: {
      displayMode: input.browser.displayMode ?? null,
      standalone: input.browser.standalone ?? null,
      safeAreaInset: insetOrNull(input.browser.safeAreaInset)
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
  const isStandaloneDisplay =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const displayMode = window.matchMedia?.("(display-mode: fullscreen)").matches
    ? "fullscreen"
    : isStandaloneDisplay
      ? "standalone"
      : "browser";
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
    browser: {
      displayMode,
      standalone: isStandaloneDisplay,
      safeAreaInset: null
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
