<script setup lang="ts">
import { Download, Share, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { detectInstallPlatform, getInstallGuide } from "@/features/app/installPlatform";
import { isInstalledPwaDisplay, markInstalledPwa } from "@/features/app/pwaDisplay";
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
const installPlatform = ref(detectInstallPlatform());
const isDismissedForSession = ref(false);
let showTimer: number | null = null;
const installPromptDelayMs = 350;

const canUseNativePrompt = computed(() => Boolean(installPrompt.value));
const installGuide = computed(() => getInstallGuide(installPlatform.value));
const shouldShowManualInstructions = computed(() => !isInstalled.value && !canUseNativePrompt.value);
const title = computed(() => installGuide.value.title);
const lead = computed(() => installGuide.value.lead);

function detectPlatform() {
  if (typeof window === "undefined") {
    return;
  }

  installPlatform.value = detectInstallPlatform();
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
      (canUseNativePrompt.value || shouldShowManualInstructions.value)
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
  markInstalledPwa();
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
      markInstalledPwa();
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

      <ol v-if="shouldShowManualInstructions" class="pwa-install-steps">
        <li v-for="step in installGuide.primarySteps" :key="step">{{ step }}</li>
      </ol>
    </div>

    <button v-if="canUseNativePrompt" class="pwa-install-action" type="button" :disabled="isPrompting" @click="installApp">
      {{ isPrompting ? "Открываем..." : "Установить" }}
    </button>
  </aside>
</template>
