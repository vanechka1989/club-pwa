<script setup lang="ts">
import { Download, Share, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { isInstalledPwaDisplay } from "@/features/app/pwaDisplay";
import { pwaInstallRequestEventName } from "@/features/app/pwaInstall";

const props = withDefaults(
  defineProps<{
    showCard?: boolean;
  }>(),
  {
    showCard: true
  }
);

type BeforeInstallPromptChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  platforms: string[];
  userChoice: Promise<BeforeInstallPromptChoice>;
  prompt: () => Promise<void>;
};

const installPrompt = ref<BeforeInstallPromptEvent | null>(null);
const isVisible = ref(false);
const isInstalled = ref(false);
const isPrompting = ref(false);
const isIos = ref(false);
const isDismissedForSession = ref(false);
let showTimer: number | null = null;
const installPromptDelayMs = 350;

const canUseNativePrompt = computed(() => Boolean(installPrompt.value));
const shouldShowIosInstructions = computed(() => isIos.value && !isInstalled.value);
const shouldShowFallbackInstructions = computed(() => !isInstalled.value && !canUseNativePrompt.value && !shouldShowIosInstructions.value);
const title = computed(() => (shouldShowIosInstructions.value ? "Добавьте Club на экран Домой" : "Установите Club как приложение"));
const lead = computed(() =>
  shouldShowIosInstructions.value
    ? "На iPhone установка делается через меню Safari. После добавления клуб откроется без адресной строки, как обычное приложение."
    : "Так клуб появится иконкой на телефоне и будет открываться без браузерной панели."
);

function detectPlatform() {
  if (typeof window === "undefined") {
    return;
  }

  const userAgent = window.navigator.userAgent;
  const platform = window.navigator.platform;
  isIos.value =
    /iphone|ipad|ipod/i.test(userAgent) ||
    (platform === "MacIntel" && navigator.maxTouchPoints > 1);
  isInstalled.value = isInstalledPwaDisplay();
}

function scheduleInstallCard() {
  if (!props.showCard || showTimer || isInstalled.value || isDismissedForSession.value) {
    return;
  }

  showTimer = window.setTimeout(() => {
    showTimer = null;
    if (
      props.showCard &&
      !isInstalled.value &&
      !isDismissedForSession.value &&
      (canUseNativePrompt.value || shouldShowIosInstructions.value || shouldShowFallbackInstructions.value)
    ) {
      isVisible.value = true;
    }
  }, installPromptDelayMs);
}

function handleBeforeInstallPrompt(event: Event) {
  event.preventDefault();
  installPrompt.value = event as BeforeInstallPromptEvent;
  scheduleInstallCard();
}

function handleAppInstalled() {
  isInstalled.value = true;
  isVisible.value = false;
  installPrompt.value = null;
}

async function installApp() {
  if (!installPrompt.value || isPrompting.value) {
    return;
  }

  isPrompting.value = true;
  const promptEvent = installPrompt.value;
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    installPrompt.value = null;

    if (choice.outcome === "accepted") {
      isInstalled.value = true;
    } else {
      isDismissedForSession.value = true;
    }

    isVisible.value = false;
  } finally {
    isPrompting.value = false;
  }
}

function dismissInstallCard() {
  isDismissedForSession.value = true;
  isVisible.value = false;
}

function handleInstallRequest() {
  isDismissedForSession.value = false;
  if (installPrompt.value) {
    void installApp();
    return;
  }

  if (props.showCard && !isInstalled.value) {
    isVisible.value = true;
  }
}

onMounted(() => {
  detectPlatform();
  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
  window.addEventListener(pwaInstallRequestEventName, handleInstallRequest);
  scheduleInstallCard();
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.removeEventListener("appinstalled", handleAppInstalled);
  window.removeEventListener(pwaInstallRequestEventName, handleInstallRequest);
  if (showTimer) {
    window.clearTimeout(showTimer);
    showTimer = null;
  }
});
</script>

<template>
  <aside v-if="props.showCard && isVisible" class="pwa-install-card" aria-live="polite" :aria-label="title">
    <button class="pwa-install-close" type="button" aria-label="Закрыть подсказку установки" @click="dismissInstallCard">
      <X class="h-4 w-4" aria-hidden="true" />
    </button>

    <div class="pwa-install-icon" aria-hidden="true">
      <Download v-if="canUseNativePrompt" class="h-5 w-5" />
      <Share v-else class="h-5 w-5" />
    </div>

    <div class="pwa-install-copy">
      <strong>{{ title }}</strong>
      <p>{{ lead }}</p>

      <ol v-if="shouldShowIosInstructions" class="pwa-install-steps">
        <li>Откройте сайт в Safari.</li>
        <li>Нажмите кнопку “Поделиться”.</li>
        <li>Выберите “На экран Домой”.</li>
      </ol>

      <p v-else-if="!canUseNativePrompt" class="pwa-install-steps pwa-install-note">
        Если кнопки установки нет, откройте меню браузера и выберите “Установить приложение”.
      </p>
    </div>

    <button v-if="canUseNativePrompt" class="pwa-install-action" type="button" :disabled="isPrompting" @click="installApp">
      {{ isPrompting ? "Открываем..." : "Установить" }}
    </button>
  </aside>
</template>
