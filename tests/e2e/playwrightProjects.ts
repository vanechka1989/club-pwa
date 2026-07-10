import { devices } from "@playwright/test";

const huaweiNova9Se = {
  name: "huawei-nova-9-se",
  use: {
    viewport: { width: 360, height: 796 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "chromium" as const,
    userAgent:
      "Mozilla/5.0 (Linux; Android 12; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.105 Mobile Safari/537.36 Telegram-Android/12.8.3 (Huawei JLN-LX1; Android 12; SDK 31; HIGH)"
  }
};

const oneplusMt2111 = {
  name: "oneplus-mt2111",
  use: {
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "chromium" as const,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.159 Mobile Safari/537.36 Telegram-Android/12.8.1.0 (Oneplus MT2111; Android 14; SDK 34; HIGH)"
  }
};

const androidWideLayout980 = {
  name: "android-wide-layout-980",
  use: {
    viewport: { width: 980, height: 1914 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "chromium" as const,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
  }
};

const androidStandaloneNoTouch980 = {
  name: "android-standalone-no-touch-980",
  use: {
    viewport: { width: 980, height: 1914 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: false,
    defaultBrowserType: "chromium" as const,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
  }
};

const compactAndroid320 = {
  name: "android-compact-320",
  use: {
    viewport: { width: 320, height: 640 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "chromium" as const,
    userAgent:
      "Mozilla/5.0 (Linux; Android 12; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.159 Mobile Safari/537.36 Telegram-Android/12.8.3 (Android Compact; SDK 31; HIGH)"
  }
};

export const smokeProjects = [
  {
    name: "desktop-chrome",
    use: { ...devices["Desktop Chrome"] }
  },
  {
    name: "iphone-se",
    use: { ...devices["iPhone SE"] }
  },
  {
    name: "iphone-15-pro-max",
    use: { ...devices["iPhone 15 Pro Max"] }
  },
  {
    name: "pixel-7",
    use: { ...devices["Pixel 7"] }
  },
  {
    name: "galaxy-s24",
    use: { ...devices["Galaxy S24"] }
  },
  androidWideLayout980,
  androidStandaloneNoTouch980,
  huaweiNova9Se,
  oneplusMt2111
];

export const fullProjects = [
  ...smokeProjects,
  {
    name: "iphone-12-mini",
    use: { ...devices["iPhone 12 Mini"] }
  },
  {
    name: "iphone-15",
    use: { ...devices["iPhone 15"] }
  },
  {
    name: "iphone-16-pro-max",
    use: { ...devices["iPhone 16 Pro Max"] }
  },
  {
    name: "ipad-mini",
    use: { ...devices["iPad Mini"] }
  },
  {
    name: "ipad-pro-11",
    use: { ...devices["iPad Pro 11"] }
  },
  {
    name: "pixel-5",
    use: { ...devices["Pixel 5"] }
  },
  {
    name: "pixel-8-pro",
    use: { ...devices["Pixel 8 Pro"] }
  },
  {
    name: "pixel-9-pro-xl",
    use: { ...devices["Pixel 9 Pro XL"] }
  },
  {
    name: "galaxy-s8",
    use: { ...devices["Galaxy S8"] }
  },
  {
    name: "galaxy-a55",
    use: { ...devices["Galaxy A55"] }
  },
  {
    name: "galaxy-z-fold-6-cover",
    use: { ...devices["Galaxy Z Fold 6 Cover"] }
  },
  {
    name: "galaxy-z-flip-6",
    use: { ...devices["Galaxy Z Flip 6"] }
  },
  compactAndroid320
];
