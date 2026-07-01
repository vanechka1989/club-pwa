import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  webServer: {
    command: "pnpm --filter @club/web dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    screenshot: "only-on-failure",
    trace: "on-first-retry"
  },
  projects: [
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
    {
      name: "huawei-nova-9-se",
      use: {
        viewport: { width: 360, height: 796 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        defaultBrowserType: "chromium",
        userAgent:
          "Mozilla/5.0 (Linux; Android 12; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.105 Mobile Safari/537.36 Telegram-Android/12.8.3 (Huawei JLN-LX1; Android 12; SDK 31; HIGH)"
      }
    }
  ]
});
