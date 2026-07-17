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
  screenHeight?: number | null;
  screenAvailHeight?: number | null;
  devicePixelRatio?: number | null;
};

export type MobileDeviceShellScaleInput = ViewportWidthInput & {
  layoutWidth: number;
  layoutHeight?: number | null;
  hasTouchInput: boolean;
  isStandaloneDisplay?: boolean | null;
  userAgent?: string | null;
};

export type DeviceLayoutSessionMode = "signed-out" | "signed-in";

export type DeviceLayoutSnapshotInput = MobileDeviceShellScaleInput & {
  platform?: string | null;
  viewportHeight?: number | null;
  sessionMode: DeviceLayoutSessionMode;
  forceMobileShell?: boolean | null;
};

export type DeviceLayoutSnapshot = {
  isMobileDeviceShell: boolean;
  scale: number;
  classes: string[];
  cssVariables: Record<string, string>;
  removedCssVariables: string[];
};

export type DeviceInsetInput = {
  top?: number | null;
  bottom?: number | null;
  left?: number | null;
  right?: number | null;
};

export type DeviceDiagnosticsInput = {
  installationId?: string | null;
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
  screenWidth?: number | null;
  screenHeight?: number | null;
  screenAvailWidth?: number | null;
  screenAvailHeight?: number | null;
  devicePixelRatio?: number | null;
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
  "club-screen-tall",
  "club-mobile-device",
  "club-mobile-auth-scaled",
  "club-mobile-app-scaled"
] as const;

export const deviceLayoutCssVariables = [
  "--club-auth-wide-viewport-scale",
  "--club-app-wide-viewport-scale",
  "--club-app-wide-font-root",
  "--club-app-wide-font-base"
] as const;

const mobileAppWideViewportFontBasePx = 16;

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
  const isMobileOrTabletWidth = width > 0 && width <= 768;
  const isPhoneWidth = width > 0 && width <= 600;

  return [
    width > 0 && width <= 380 && "club-screen-narrow",
    isPhoneWidth && height > 0 && height <= 850 && "club-screen-short",
    isMobileOrTabletWidth && height >= 900 && "club-screen-tall"
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

export function getMeasuredKeyboardOcclusion({
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

  const viewportShrink = Math.max(0, Math.round(viewportBaseHeight - visibleHeight));
  const bottomGap = getMeasuredKeyboardBottomGap({
    viewportBaseHeight,
    visibleHeight,
    visibleOffsetTop
  });

  // iOS may pan the visual viewport after focusing a field. The pan reduces
  // the measured bottom gap even though the keyboard still occupies the same
  // amount of screen, so use the full viewport shrink for keyboard detection.
  return Math.max(viewportShrink, bottomGap);
}

export function getKeyboardViewportBaseHeight({
  previousBaseHeight,
  currentViewportHeight,
  hasFocusedTextField
}: {
  previousBaseHeight: number;
  currentViewportHeight: number;
  hasFocusedTextField: boolean;
}) {
  const current = Number.isFinite(currentViewportHeight) && currentViewportHeight > 0
    ? Math.round(currentViewportHeight)
    : 0;
  const previous = Number.isFinite(previousBaseHeight) && previousBaseHeight > 0
    ? Math.round(previousBaseHeight)
    : 0;

  if (!current) {
    return previous;
  }

  // Some iOS standalone builds resize both innerHeight and visualViewport when
  // the keyboard opens. Preserve the last unfocused height so the keyboard is
  // still detectable instead of comparing two already-shrunken viewports.
  return hasFocusedTextField ? Math.max(previous, current) : current;
}

export function getMeasuredSystemBottomGap({
  keyboardOpen,
  visualBottomGap
}: {
  keyboardOpen: boolean;
  visualBottomGap: number;
}) {
  return keyboardOpen ? 0 : Math.max(0, Math.round(visualBottomGap));
}

export function syncLayoutClasses(targets: Array<HTMLElement | null | undefined>, classes: string[]) {
  const enabledClasses = new Set(classes);

  for (const target of targets) {
    if (!target) {
      continue;
    }

    for (const className of deviceLayoutClasses) {
      target.classList.toggle(className, enabledClasses.has(className));
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

function getCssDeviceScreenHeight(input: ViewportWidthInput) {
  const screenHeights = [input.screenHeight, input.screenAvailHeight].filter(
    (height): height is number => Number.isFinite(height) && Number(height) > 0
  );
  if (!screenHeights.length) {
    return 0;
  }

  const rawScreenHeight = Math.max(...screenHeights);
  const pixelRatio = finiteNumber(input.devicePixelRatio, 1);
  const cssHeightFromPhysicalPixels = pixelRatio > 1 ? rawScreenHeight / pixelRatio : 0;
  const looksLikePhysicalPixels =
    cssHeightFromPhysicalPixels >= 480 &&
    cssHeightFromPhysicalPixels <= 1400 &&
    cssHeightFromPhysicalPixels < rawScreenHeight * 0.75;

  return looksLikePhysicalPixels ? cssHeightFromPhysicalPixels : rawScreenHeight;
}

function isPhysicalPhoneScreen(input: ViewportWidthInput) {
  const screenWidth = getCssDeviceScreenWidth(input);
  const screenHeight = getCssDeviceScreenHeight(input);
  const pixelRatio = finiteNumber(input.devicePixelRatio, 1);

  return screenWidth > 0 && screenWidth <= 600 && (screenHeight === 0 || screenHeight <= 1200) && pixelRatio >= 2;
}

function hasMobileUserAgent(userAgent: string | null | undefined) {
  return /Android|iPhone|iPad|iPod/i.test(userAgent ?? "");
}

function hasHandheldMobileUserAgent(userAgent: string | null | undefined) {
  const normalizedUserAgent = userAgent ?? "";
  return /iPhone|iPod/i.test(normalizedUserAgent) || (/Android/i.test(normalizedUserAgent) && /Mobile/i.test(normalizedUserAgent));
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
  const layoutHeight = finiteNumber(input.layoutHeight, 0);
  const viewportScale = deviceScreenWidth > 0 ? input.layoutWidth / deviceScreenWidth : 1;
  const isSmallCssScreen = deviceScreenWidth > 0 && deviceScreenWidth <= 480;
  const isPhysicalPhone = isPhysicalPhoneScreen(input);
  const isAnyMobileUserAgent = hasMobileUserAgent(input.userAgent);
  const isHandheldMobileUserAgent = hasHandheldMobileUserAgent(input.userAgent);
  const isTallPortraitWideViewport =
    input.layoutWidth >= 700 && input.layoutWidth <= 1100 && layoutHeight >= input.layoutWidth * 1.45;
  const needsStandaloneWideViewportScale =
    Boolean(input.isStandaloneDisplay) &&
    isSmallCssScreen &&
    input.layoutWidth >= 700 &&
    input.layoutWidth <= 1100 &&
    layoutHeight >= input.layoutWidth * 1.45;
  const hasMobileShellSignal =
    input.hasTouchInput ||
    isPhysicalPhone ||
    isAnyMobileUserAgent ||
    needsStandaloneWideViewportScale ||
    (Boolean(input.isStandaloneDisplay) && isTallPortraitWideViewport);
  const needsViewportCompensation = hasMobileShellSignal && input.layoutWidth >= 700 && viewportScale >= 1.35;
  const isMobileUserAgent = hasMobileShellSignal && isAnyMobileUserAgent;
  const needsHandheldWideViewportScale =
    hasMobileShellSignal && input.layoutWidth >= 700 && isHandheldMobileUserAgent;
  const needsTallPortraitWideViewportScale = hasMobileShellSignal && isTallPortraitWideViewport;
  const isMobileDeviceShell =
    hasMobileShellSignal &&
    (isMobileUserAgent ||
      needsViewportCompensation ||
      needsStandaloneWideViewportScale ||
      needsTallPortraitWideViewportScale ||
      (deviceScreenWidth > 0 && deviceScreenWidth <= 720));
  const scale = needsViewportCompensation
    ? roundedTo(Math.min(2.8, Math.max(1, viewportScale)), 3)
    : needsHandheldWideViewportScale || needsStandaloneWideViewportScale || needsTallPortraitWideViewportScale
      ? roundedTo(Math.min(2.8, Math.max(1, input.layoutWidth / 390)), 3)
      : 1;

  return {
    isMobileDeviceShell,
    scale
  };
}

function formatScaledCssPx(basePx: number, scale: number) {
  return `${roundedTo(basePx * scale, 2)}px`;
}

export function createDeviceLayoutSnapshot(input: DeviceLayoutSnapshotInput): DeviceLayoutSnapshot {
  const userAgent = input.userAgent ?? "";
  const mobileDeviceShell = getMobileDeviceShellScale({ ...input, layoutHeight: input.viewportHeight ?? null });
  const isMobileDeviceShell = mobileDeviceShell.isMobileDeviceShell || Boolean(input.forceMobileShell);
  const shouldScaleWideViewport = mobileDeviceShell.isMobileDeviceShell && mobileDeviceShell.scale > 1;
  const shouldScaleAuth = shouldScaleWideViewport && input.sessionMode === "signed-out";
  const shouldScaleApp = shouldScaleWideViewport && input.sessionMode === "signed-in";
  const deviceScreenWidth = getCssDeviceScreenWidth(input);
  const deviceScreenHeight = getCssDeviceScreenHeight(input);
  const shouldUsePhysicalScreenForSizeClasses =
    mobileDeviceShell.isMobileDeviceShell && shouldScaleWideViewport && deviceScreenWidth > 0 && deviceScreenHeight > 0;
  const platformClasses = getDeviceLayoutClasses({ platform: input.platform ?? "", userAgent });
  const inferredAndroidPhysicalShell =
    !platformClasses.includes("club-ios") &&
    !platformClasses.includes("club-android") &&
    isLikelyAndroidPhysicalShell({
      platform: input.platform ?? null,
      userAgent,
      viewportWidth: input.layoutWidth,
      viewportHeight: input.viewportHeight ?? null,
      screenWidth: input.screenWidth ?? null,
      screenHeight: input.screenHeight ?? null,
      screenAvailWidth: input.screenAvailWidth ?? null,
      screenAvailHeight: input.screenAvailHeight ?? null,
      devicePixelRatio: input.devicePixelRatio ?? null
    });
  const cssVariables: Record<string, string> = {};
  const classes = [
    ...platformClasses,
    inferredAndroidPhysicalShell && "club-android",
    ...getViewportSizeClasses({
      width: shouldUsePhysicalScreenForSizeClasses ? deviceScreenWidth : input.layoutWidth,
      height: shouldUsePhysicalScreenForSizeClasses ? deviceScreenHeight : finiteNumber(input.viewportHeight, 0)
    }),
    isMobileDeviceShell && "club-mobile-device",
    shouldScaleAuth && "club-mobile-auth-scaled",
    shouldScaleApp && "club-mobile-app-scaled"
  ].filter((className): className is string => Boolean(className));

  if (shouldScaleAuth) {
    cssVariables["--club-auth-wide-viewport-scale"] = `${mobileDeviceShell.scale}`;
  }

  if (shouldScaleApp) {
    cssVariables["--club-app-wide-viewport-scale"] = `${mobileDeviceShell.scale}`;
    cssVariables["--club-app-wide-font-root"] = formatScaledCssPx(mobileAppWideViewportFontBasePx, mobileDeviceShell.scale);
    cssVariables["--club-app-wide-font-base"] = formatScaledCssPx(mobileAppWideViewportFontBasePx, mobileDeviceShell.scale);
  }

  return {
    isMobileDeviceShell,
    scale: mobileDeviceShell.scale,
    classes: Array.from(new Set(classes)),
    cssVariables,
    removedCssVariables: deviceLayoutCssVariables.filter((variableName) => !(variableName in cssVariables))
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
  const isAndroid = classes.includes("club-android") || isLikelyAndroidPhysicalShell(input);
  const isIos = classes.includes("club-ios");
  const bottomInset = maxInsetSide("bottom", input.safeAreaInset, input.contentSafeAreaInset);
  const bottomOffsetPx = rounded(Math.max(bottomInset, finiteNumber(input.visualBottomGap, 0)));

  return {
    bottomOffsetPx,
    source: isAndroid ? "android" : isIos ? "ios" : "browser"
  };
}

function isLikelyAndroidPhysicalShell(input: LayoutCalibrationInput) {
  if (getDeviceLayoutClasses({ platform: input.platform ?? "", userAgent: input.userAgent ?? "" }).includes("club-ios")) {
    return false;
  }

  const platform = input.platform?.toLowerCase() ?? "";
  const userAgent = input.userAgent?.toLowerCase() ?? "";
  const isLinuxShell = platform.includes("linux") || userAgent.includes("linux");
  const viewportWidth = finiteNumber(input.viewportWidth, 0);
  const screenWidth = getCssDeviceScreenWidth(input);
  const scale = screenWidth > 0 ? viewportWidth / screenWidth : 1;

  return isLinuxShell && isPhysicalPhoneScreen(input) && (viewportWidth >= 700 || scale >= 1.35);
}

export function collectDeviceDiagnostics(input: DeviceDiagnosticsInput) {
  return {
    installationId: input.installationId ?? null,
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
    window.matchMedia?.("(display-mode: window-controls-overlay)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const displayMode = window.matchMedia?.("(display-mode: fullscreen)").matches
    ? "fullscreen"
    : isStandaloneDisplay
      ? "standalone"
      : "browser";
  const classes = [
    ...createDeviceLayoutSnapshot({
      layoutWidth: viewportWidth,
      viewportHeight,
      screenWidth: window.screen?.width ?? null,
      screenHeight: window.screen?.height ?? null,
      screenAvailWidth: window.screen?.availWidth ?? null,
      screenAvailHeight: window.screen?.availHeight ?? null,
      devicePixelRatio: window.devicePixelRatio ?? null,
      hasTouchInput: Boolean(window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0),
      isStandaloneDisplay,
      platform,
      sessionMode: "signed-in",
      userAgent
    }).classes,
    ...(typeof document === "undefined"
      ? []
      : [...document.documentElement.classList, ...document.body.classList].filter((className) =>
          className.startsWith("club-")
        ))
  ];

  return collectDeviceDiagnostics({
    installationId: getOrCreateDeviceInstallationId(),
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
      screenWidth: window.screen?.width ?? null,
      screenHeight: window.screen?.height ?? null,
      screenAvailWidth: window.screen?.availWidth ?? null,
      screenAvailHeight: window.screen?.availHeight ?? null,
      devicePixelRatio: window.devicePixelRatio ?? null,
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

const deviceInstallationStorageKey = "club-device-installation-id";

export function getOrCreateDeviceInstallationId() {
  const stored = window.localStorage.getItem(deviceInstallationStorageKey);
  if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
    return stored;
  }

  const installationId = window.crypto.randomUUID();
  window.localStorage.setItem(deviceInstallationStorageKey, installationId);
  return installationId;
}
