<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Download, Mail, ShieldCheck } from "lucide-vue-next";
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
const resendCooldownMs = 60_000;
let resendCooldownTimer: number | null = null;

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

function isStandalonePwa() {
  if (typeof window === "undefined") {
    return false;
  }

  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return (window.matchMedia?.("(display-mode: standalone)").matches ?? false) || navigatorWithStandalone.standalone === true;
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
    stopResendCooldownTimer();
  }
}

function startResendCooldown(seconds = resendCooldownMs / 1000) {
  const timestamp = Date.now();
  resendAvailableAt.value = timestamp + Math.max(1, seconds) * 1000;
  nowMs.value = timestamp;
  stopResendCooldownTimer();
  resendCooldownTimer = window.setInterval(tickResendCooldown, 1000);
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

function installApp() {
  requestPwaInstallPrompt();
}

onMounted(() => {
  isInstalledPwa.value = isStandalonePwa();
});

onBeforeUnmount(() => {
  stopResendCooldownTimer();
});
</script>

<template>
  <section v-if="!isInstalledPwa" class="auth-panel auth-install-required" aria-labelledby="auth-install-title">
    <div class="auth-panel-head">
      <span class="auth-panel-icon">
        <Download class="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <h2 id="auth-install-title">Установите приложение</h2>
        <p>Вход по email доступен только из установленного приложения Club.</p>
      </div>
    </div>

    <ol class="auth-install-steps">
      <li>Нажмите “Установить приложение”.</li>
      <li>Подтвердите установку в окне браузера.</li>
      <li>Откройте Club через новую иконку на экране телефона.</li>
    </ol>

    <button class="primary-button" type="button" @click="installApp">
      Установить приложение
    </button>

    <p class="auth-hint">
      Если окно установки не открылось, нажмите меню браузера ⋮ и выберите “Установить приложение”.
    </p>
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
