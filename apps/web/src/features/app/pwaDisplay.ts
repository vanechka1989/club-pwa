const installedPwaDisplayModes = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"] as const;
const installedPwaHintStorageKey = "club-pwa-installed";

export function getInstalledPwaDisplayModeQueries() {
  return installedPwaDisplayModes.map((mode) => `(display-mode: ${mode})`);
}

export function markInstalledPwa() {
  try {
    localStorage.setItem(installedPwaHintStorageKey, "1");
  } catch {
    // The display-mode checks still work if storage is unavailable.
  }
}

function hasInstalledPwaHint() {
  try {
    return localStorage.getItem(installedPwaHintStorageKey) === "1";
  } catch {
    return false;
  }
}

function hasPwaStartSource() {
  try {
    return new URL(window.location.href).searchParams.get("source") === "pwa";
  } catch {
    return false;
  }
}

export function isInstalledPwaDisplay() {
  if (typeof window === "undefined") {
    return false;
  }

  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  const isStandaloneNavigator = navigatorWithStandalone.standalone === true;
  const isInstalledDisplayMode = getInstalledPwaDisplayModeQueries().some(
    (query) => window.matchMedia?.(query).matches ?? false
  );
  const isBrowserDisplayMode = window.matchMedia?.("(display-mode: browser)").matches ?? false;
  const isNonBrowserDisplaySurface = typeof window.matchMedia === "function" && !isBrowserDisplayMode;
  const isAndroidAppLaunch = typeof document !== "undefined" && document.referrer.startsWith("android-app://");
  const hasAppLaunchHint = hasPwaStartSource() || (hasInstalledPwaHint() && !isBrowserDisplayMode);

  return isInstalledDisplayMode || isStandaloneNavigator || isAndroidAppLaunch || hasAppLaunchHint || isNonBrowserDisplaySurface;
}
