/// <reference types="vite/client" />

interface TelegramWebApp {
  initData: string;
  viewportHeight?: number;
  viewportStableHeight?: number;
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  safeAreaInset?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  contentSafeAreaInset?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  showAlert?: (message: string) => void;
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
