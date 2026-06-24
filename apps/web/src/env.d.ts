/// <reference types="vite/client" />

interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  showAlert?: (message: string) => void;
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
