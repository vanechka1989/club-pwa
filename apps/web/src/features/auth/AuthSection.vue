<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { detectInstallPlatform } from "@/features/app/installPlatform";
import { getInstalledPwaDisplayModeQueries, isInstalledPwaDisplay } from "@/features/app/pwaDisplay";
import { Download, Mail, Share, ShieldCheck } from "lucide-vue-next";
import { requestPwaInstallPrompt } from "@/features/app/pwaInstall";
import { useSessionStore } from "@/stores/session";

type AuthRequestError = Error & { retryAfterSeconds?: number };

const session = useSessionStore();
const email = ref("");
const code = ref("");
const localError = ref<string | null>(null);
const resendAvailableAt = ref<number | null>(null);
const nowMs = ref(Date.now());
const isInstalledPwa = ref(isStandalonePwa());
const isIosInstallDevice = ref(detectIosInstallDevice());
const installFallbackVisible = ref(false);
const resendCooldownMs = 60_000;
let resendCooldownTimer: number | null = null;
let removeInstalledPwaListeners: Array<() => void> = [];

const isCodeStep = computed(() => Boolean(session.pendingEmail));
const resendRemainingSeconds = computed(() => {
  if (!resendAvailableAt.value) {
    return 0;
  }

  return Math.max(0, Math.ceil((resendAvailableAt.value - nowMs.value) / 1000));
});
const resendButtonLabel = computed(() =>
  resendRemainingSeconds.value > 0 ? `Отправить код ещё раз через ${resendRemainingSeconds.value}с` : "Отправить код ещё раз"
);
const requestButtonLabel = computed(() =>
  resendRemainingSeconds.value > 0 ? `Получить код через ${resendRemainingSeconds.value}с` : "Получить код"
);
const canRequestCode = computed(() => !session.loading && Boolean(email.value) && resendRemainingSeconds.value <= 0);
const canResendCode = computed(() => !session.loading && resendRemainingSeconds.value <= 0);
const isIosInstallFlow = computed(() => isIosInstallDevice.value && !isInstalledPwa.value);
const installTitle = computed(() => (isIosInstallFlow.value ? "Добавьте Club на экран Домой" : "Установите приложение"));
const installLead = computed(() =>
  isIosInstallFlow.value
    ? "На iPhone кнопка сайта не может открыть окно установки автоматически. Установите Club через меню браузера, затем откройте новую иконку."
    : "Вход по email доступен только из установленного приложения Club."
);

function isStandalonePwa() {
  return isInstalledPwaDisplay();
}

const referralCode = computed(() => {
  if (typeof window === "undefined") {
    return null;
  }

  const value = new URLSearchParams(window.location.search).get("ref");
  return value?.trim() || null;
});

function stopResendCooldownTimer() {
  if (resendCooldownTimer) {
    window.clearInterval(resendCooldownTimer);
    resendCooldownTimer = null;
  }
}

function tickResendCooldown() {
  nowMs.value = Date.now();
  if (resendRemainingSeconds.value <= 0) {
    resendAvailableAt.value = null;
    session.setPendingEmailResendAvailableAt(null);
    stopResendCooldownTimer();
  }
}

function applyResendCooldown(availableAt: number | null) {
  stopResendCooldownTimer();
  nowMs.value = Date.now();
  resendAvailableAt.value = availableAt && availableAt > nowMs.value ? availableAt : null;
  if (resendAvailableAt.value) {
    resendCooldownTimer = window.setInterval(tickResendCooldown, 1000);
  }
}

function startResendCooldown(seconds = resendCooldownMs / 1000) {
  const availableAt = Date.now() + Math.max(1, seconds) * 1000;
  session.setPendingEmailResendAvailableAt(availableAt);
  applyResendCooldown(availableAt);
}

function restoreResendCooldown() {
  applyResendCooldown(session.pendingEmailResendAvailableAt);
}

function getRetryAfterSeconds(error: unknown) {
  return typeof error === "object" && error && "retryAfterSeconds" in error && typeof (error as AuthRequestError).retryAfterSeconds === "number"
    ? (error as AuthRequestError).retryAfterSeconds
    : null;
}

async function submitEmail() {
  if (!canRequestCode.value) {
    return;
  }

  localError.value = null;
  try {
    await session.requestEmailCode(email.value, referralCode.value);
    code.value = "";
    startResendCooldown();
  } catch (error) {
    const retryAfterSeconds = getRetryAfterSeconds(error);
    if (retryAfterSeconds) {
      startResendCooldown(retryAfterSeconds);
    }
    localError.value = error instanceof Error ? error.message : "Не удалось отправить код.";
  }
}

async function submitCode() {
  localError.value = null;
  try {
    await session.verifyEmailCode(session.pendingEmail, code.value, referralCode.value);
  } catch (error) {
    localError.value = error instanceof Error ? error.message : "Не удалось войти.";
  }
}

async function resendCode() {
  if (!canResendCode.value) {
    return;
  }

  localError.value = null;
  try {
    await session.requestEmailCode(session.pendingEmail, referralCode.value);
    code.value = "";
    startResendCooldown();
  } catch (error) {
    const retryAfterSeconds = getRetryAfterSeconds(error);
    if (retryAfterSeconds) {
      startResendCooldown(retryAfterSeconds);
    }
    localError.value = error instanceof Error ? error.message : "Не удалось отправить код.";
  }
}

function changeEmail() {
  session.resetEmailAuth();
  email.value = "";
  code.value = "";
  resendAvailableAt.value = null;
  stopResendCooldownTimer();
}

function detectIosInstallDevice() {
  return detectInstallPlatform().isIos;
}

function installApp() {
  installFallbackVisible.value = true;
  if (isIosInstallFlow.value) {
    return;
  }

  requestPwaInstallPrompt();
}

function refreshInstalledPwaState() {
  isInstalledPwa.value = isStandalonePwa();
}

function addInstalledPwaListeners() {
  if (typeof window === "undefined") {
    return;
  }

  removeInstalledPwaListeners.forEach((removeListener) => removeListener());
  removeInstalledPwaListeners = [];

  const addWindowListener = (eventName: string) => {
    window.addEventListener(eventName, refreshInstalledPwaState);
    removeInstalledPwaListeners.push(() => window.removeEventListener(eventName, refreshInstalledPwaState));
  };

  addWindowListener("appinstalled");
  addWindowListener("focus");
  addWindowListener("pageshow");
  document.addEventListener("visibilitychange", refreshInstalledPwaState);
  removeInstalledPwaListeners.push(() => document.removeEventListener("visibilitychange", refreshInstalledPwaState));

  getInstalledPwaDisplayModeQueries().forEach((query) => {
    const mediaQuery = window.matchMedia?.(query);
    if (!mediaQuery) {
      return;
    }

    mediaQuery.addEventListener?.("change", refreshInstalledPwaState);
    mediaQuery.addListener?.(refreshInstalledPwaState);
    removeInstalledPwaListeners.push(() => {
      mediaQuery.removeEventListener?.("change", refreshInstalledPwaState);
      mediaQuery.removeListener?.(refreshInstalledPwaState);
    });
  });
}

onMounted(() => {
  isIosInstallDevice.value = detectIosInstallDevice();
  refreshInstalledPwaState();
  addInstalledPwaListeners();
  restoreResendCooldown();
});

onBeforeUnmount(() => {
  stopResendCooldownTimer();
  removeInstalledPwaListeners.forEach((removeListener) => removeListener());
  removeInstalledPwaListeners = [];
});
</script>

<template>
  <section v-if="!isInstalledPwa" class="auth-panel auth-install-required" aria-labelledby="auth-install-title">
    <div class="auth-panel-head">
      <span class="auth-panel-icon">
        <Share v-if="isIosInstallFlow" class="h-5 w-5" aria-hidden="true" />
        <Download v-else class="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <h2 id="auth-install-title">{{ installTitle }}</h2>
        <p>{{ installLead }}</p>
      </div>
    </div>

    <ol v-if="isIosInstallFlow" class="auth-install-steps">
      <li>Откройте сайт в Safari или текущем браузере на iPhone.</li>
      <li>Нажмите “Поделиться”.</li>
      <li>Выберите “На экран Домой” и нажмите “Добавить”.</li>
      <li>Откройте Club через новую иконку на экране телефона.</li>
    </ol>
    <ol v-else class="auth-install-steps">
      <li>Нажмите “Установить приложение”.</li>
      <li>Подтвердите установку в окне браузера.</li>
      <li>Откройте Club через новую иконку на экране телефона.</li>
    </ol>

    <button v-if="!isIosInstallFlow" class="primary-button" type="button" @click="installApp">
      Установить приложение
    </button>

    <div v-if="installFallbackVisible || isIosInstallFlow" class="auth-install-manual" aria-live="polite">
      <div class="auth-install-manual-head">
        <strong>{{ isIosInstallFlow ? "Как установить на iPhone" : "Chrome не открыл окно установки автоматически" }}</strong>
        <span>
          {{
            isIosInstallFlow
              ? "Системное окно установки на iPhone не открывается кнопкой сайта. Используйте меню браузера."
              : "Если окно установки не появилось, выберите свой браузер и установите Club вручную."
          }}
        </span>
      </div>

      <div class="auth-install-guide-grid">
        <article class="auth-install-guide-card" aria-labelledby="install-chrome-title">
          <div class="auth-install-shot auth-install-shot-chrome" aria-hidden="true">
            <div class="auth-install-shot-bar">
              <span>club2.myn8nservertest.ru</span>
              <b>+</b>
              <em>⋮</em>
            </div>
            <div class="auth-install-shot-menu">
              <span>Сохранить и поделиться</span>
              <strong>Установить страницу как приложение</strong>
            </div>
          </div>
          <div>
            <strong id="install-chrome-title">Chrome</strong>
            <ol>
              <li>Нажмите иконку установки в адресной строке.</li>
              <li>Если её нет, откройте меню Chrome, затем Сохранить и поделиться и Установить страницу как приложение.</li>
              <li>На Android откройте меню Chrome, затем Добавить на главный экран и Установить.</li>
            </ol>
          </div>
        </article>

        <article class="auth-install-guide-card" aria-labelledby="install-safari-title">
          <div class="auth-install-shot auth-install-shot-safari" aria-hidden="true">
            <div class="auth-install-phone-top"></div>
            <div class="auth-install-safari-toolbar">
              <span>AA</span>
              <b>Поделиться</b>
              <em>...</em>
            </div>
            <div class="auth-install-share-sheet">
              <strong>На экран Домой</strong>
              <span>Добавить</span>
            </div>
          </div>
          <div>
            <strong id="install-safari-title">Safari iPhone</strong>
            <ol>
              <li>Откройте сайт в Safari.</li>
              <li>Нажмите Поделиться.</li>
              <li>Выберите На экран Домой и нажмите Добавить.</li>
            </ol>
          </div>
        </article>
      </div>
    </div>
  </section>

  <section v-else class="auth-panel" aria-labelledby="auth-title">
    <div class="auth-panel-head">
      <span class="auth-panel-icon">
        <Mail v-if="!isCodeStep" class="h-5 w-5" aria-hidden="true" />
        <ShieldCheck v-else class="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <h2 id="auth-title">{{ isCodeStep ? "Код из письма" : "Вход в клуб" }}</h2>
        <p>{{ isCodeStep ? "Введите 6 цифр из письма." : "Введите email, на который открыть доступ." }}</p>
      </div>
    </div>

    <form v-if="!isCodeStep" class="auth-form" @submit.prevent="submitEmail">
      <label>
        <span>Email</span>
        <input v-model.trim="email" class="text-input" type="email" autocomplete="email" placeholder="you@example.com" required />
      </label>
      <button class="primary-button" type="submit" :disabled="!canRequestCode">
        {{ requestButtonLabel }}
      </button>
    </form>

    <form v-else class="auth-form" @submit.prevent="submitCode">
      <label>
        <span>Код</span>
        <input v-model.trim="code" class="text-input" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" required />
      </label>
      <button class="primary-button" type="submit" :disabled="session.loading || code.length < 6">
        Войти
      </button>
      <button class="secondary-button" type="button" :disabled="!canResendCode" @click="resendCode">
        {{ resendButtonLabel }}
      </button>
      <button class="secondary-button" type="button" :disabled="session.loading" @click="changeEmail">
        Изменить email
      </button>
    </form>

    <p v-if="session.authMessage" class="auth-hint">{{ session.authMessage }}</p>
    <p v-if="localError || session.error" class="auth-error">{{ localError || session.error }}</p>
  </section>
</template>
