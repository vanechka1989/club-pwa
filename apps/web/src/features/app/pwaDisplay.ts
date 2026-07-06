const installedPwaDisplayModes = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"] as const;

export function getInstalledPwaDisplayModeQueries() {
  return installedPwaDisplayModes.map((mode) => `(display-mode: ${mode})`);
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
  const isAndroidAppLaunch = typeof document !== "undefined" && document.referrer.startsWith("android-app://");

  return isInstalledDisplayMode || isStandaloneNavigator || isAndroidAppLaunch;
}
