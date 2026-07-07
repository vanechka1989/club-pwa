export type InstallPlatformKind = "ios" | "android" | "windows" | "macos" | "desktop";

export type InstallPlatformInput = {
  maxTouchPoints?: number;
  platform?: string;
  userAgentData?: {
    mobile?: boolean;
    platform?: string;
  };
  userAgent?: string;
  viewportWidth?: number;
};

export type InstallPlatform = {
  kind: InstallPlatformKind;
  isIos: boolean;
  isAndroid: boolean;
  isWindows: boolean;
  isMacOs: boolean;
};

export type InstallGuideCardKind = "ios" | "android" | "chrome-desktop" | "edge-desktop" | "safari-mac";

export type InstallGuideCard = {
  kind: InstallGuideCardKind;
  title: string;
  steps: string[];
};

export type InstallGuide = {
  title: string;
  lead: string;
  primarySteps: string[];
  manualTitle: string;
  manualLead: string;
  nativePromptUnavailable: boolean;
  cards: InstallGuideCard[];
};

export function detectInstallPlatform(input: InstallPlatformInput = {}): InstallPlatform {
  const userAgent = input.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const platform = input.platform ?? (typeof navigator !== "undefined" ? navigator.platform : "");
  const maxTouchPoints = input.maxTouchPoints ?? (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0);
  const userAgentData =
    input.userAgentData ??
    (typeof navigator !== "undefined"
      ? (navigator as Navigator & { userAgentData?: { mobile?: boolean; platform?: string } }).userAgentData
      : undefined);
  const userAgentDataPlatform = userAgentData?.platform ?? "";
  const viewportWidth = input.viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : undefined);
  const platformText = `${userAgent} ${platform} ${userAgentDataPlatform}`;
  const isTouchPhoneViewport = maxTouchPoints > 1 && typeof viewportWidth === "number" && viewportWidth > 0 && viewportWidth <= 820;
  const isIos = /iphone|ipad|ipod/i.test(platformText) || (platform === "MacIntel" && maxTouchPoints > 1);
  const isWindows = /windows|win32|win64/i.test(platformText);
  const isMacOs = !isIos && /macintosh|mac os x|macintel/i.test(platformText);
  const isAndroid =
    /android/i.test(platformText) ||
    (!isIos && !isWindows && !isMacOs && maxTouchPoints > 1 && userAgentData?.mobile === true && /linux|arm|aarch/i.test(platformText)) ||
    (!isIos && !isWindows && !isMacOs && isTouchPhoneViewport && /linux|arm|aarch/i.test(platformText));

  return {
    kind: isIos ? "ios" : isAndroid ? "android" : isWindows ? "windows" : isMacOs ? "macos" : "desktop",
    isIos,
    isAndroid,
    isWindows,
    isMacOs
  };
}

const androidGuide: InstallGuide = {
  title: "Установите Club на Android",
  lead: "Откройте клуб через иконку приложения. После этого вход по email станет доступен.",
  primarySteps: [
    "Откройте сайт в Chrome на Android.",
    "Нажмите меню Chrome ⋮ справа от адресной строки.",
    "Выберите “Добавить на главный экран”, затем “Установить”.",
    "Откройте Club через новую иконку на телефоне."
  ],
  manualTitle: "Как установить на Android",
  manualLead: "Если кнопка установки не открылась, установите Club через меню Chrome.",
  nativePromptUnavailable: false,
  cards: [
    {
      kind: "android",
      title: "Chrome Android",
      steps: ["Откройте меню Chrome ⋮.", "Нажмите “Добавить на главный экран”.", "Выберите “Установить” и откройте новую иконку Club."]
    }
  ]
};

const iosGuide: InstallGuide = {
  title: "Добавьте Club на экран Домой",
  lead: "На iPhone установка делается через меню Safari. После добавления клуб откроется без адресной строки, как обычное приложение.",
  primarySteps: [
    "Откройте сайт в Safari на iPhone.",
    "Нажмите “Поделиться”.",
    "Выберите “На экран Домой”.",
    "Включите “Открывать как веб-приложение”, если такой пункт показан.",
    "Нажмите “Добавить” и откройте Club через новую иконку."
  ],
  manualTitle: "Как установить на iPhone",
  manualLead: "iPhone не открывает системное окно установки по кнопке сайта. Используйте меню Safari.",
  nativePromptUnavailable: true,
  cards: [
    {
      kind: "ios",
      title: "Safari iPhone",
      steps: ["Откройте сайт в Safari.", "Нажмите “Поделиться”.", "Выберите “На экран Домой”, затем “Добавить”."]
    }
  ]
};

const windowsGuide: InstallGuide = {
  title: "Установите Club на Windows",
  lead: "После установки Club появится в меню Пуск и откроется отдельным окном приложения.",
  primarySteps: [
    "Откройте сайт в Chrome или Edge.",
    "Нажмите иконку установки в адресной строке.",
    "Подтвердите “Установить”.",
    "Откройте Club из меню Пуск или через созданную иконку."
  ],
  manualTitle: "Как установить на Windows",
  manualLead: "Если окно установки не появилось, используйте меню браузера.",
  nativePromptUnavailable: false,
  cards: [
    {
      kind: "chrome-desktop",
      title: "Chrome Windows",
      steps: [
        "Нажмите иконку установки в адресной строке.",
        "Если её нет: меню ⋮ → “Трансляция, сохранение и доступ” → “Установить страницу как приложение”.",
        "Откройте Club из меню Пуск."
      ]
    },
    {
      kind: "edge-desktop",
      title: "Edge Windows",
      steps: ["Нажмите иконку “Приложение доступно” в адресной строке.", "Нажмите “Установить”.", "Откройте Club из меню Пуск."]
    }
  ]
};

const macGuide: InstallGuide = {
  title: "Установите Club на macOS",
  lead: "На Mac Club можно добавить в Dock или установить через Chrome/Edge как отдельное приложение.",
  primarySteps: [
    "В Safari откройте сайт и нажмите “Поделиться” → “Добавить в Dock”.",
    "В Chrome или Edge нажмите иконку установки в адресной строке.",
    "Подтвердите установку.",
    "Откройте Club из Dock, Launchpad или Spotlight."
  ],
  manualTitle: "Как установить на macOS",
  manualLead: "Выберите инструкцию для браузера, которым открыт сайт.",
  nativePromptUnavailable: false,
  cards: [
    {
      kind: "safari-mac",
      title: "Safari macOS",
      steps: ["Откройте сайт в Safari.", "Нажмите “Поделиться” в панели инструментов.", "Выберите “Добавить в Dock” и нажмите “Добавить”."]
    },
    {
      kind: "chrome-desktop",
      title: "Chrome или Edge",
      steps: ["Нажмите иконку установки в адресной строке.", "Если её нет, откройте меню браузера и выберите установку приложения.", "Откройте Club из Dock или Launchpad."]
    }
  ]
};

const desktopGuide: InstallGuide = {
  ...windowsGuide,
  title: "Установите Club как приложение",
  lead: "Откройте клуб через отдельную иконку приложения. В браузерной вкладке вход закрыт."
};

export function getInstallGuide(platform: InstallPlatform = detectInstallPlatform()): InstallGuide {
  if (platform.isIos) {
    return iosGuide;
  }
  if (platform.isAndroid) {
    return androidGuide;
  }
  if (platform.isMacOs) {
    return macGuide;
  }
  if (platform.isWindows) {
    return windowsGuide;
  }

  return desktopGuide;
}
