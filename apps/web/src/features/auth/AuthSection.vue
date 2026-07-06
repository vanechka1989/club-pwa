<script setup lang="ts">
import { computed, ref } from "vue";
import { Mail, ShieldCheck } from "lucide-vue-next";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const email = ref("");
const code = ref("");
const localError = ref<string | null>(null);

const isCodeStep = computed(() => Boolean(session.pendingEmail));

const referralCode = computed(() => {
  if (typeof window === "undefined") {
    return null;
  }

  const value = new URLSearchParams(window.location.search).get("ref");
  return value?.trim() || null;
});

async function submitEmail() {
  localError.value = null;
  try {
    await session.requestEmailCode(email.value, referralCode.value);
    code.value = "";
  } catch (error) {
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
  localError.value = null;
  try {
    await session.requestEmailCode(session.pendingEmail, referralCode.value);
    code.value = "";
  } catch (error) {
    localError.value = error instanceof Error ? error.message : "Не удалось отправить код.";
  }
}

function changeEmail() {
  session.resetEmailAuth();
  email.value = "";
  code.value = "";
}
</script>

<template>
  <section class="auth-panel" aria-labelledby="auth-title">
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
      <button class="primary-button" type="submit" :disabled="session.loading || !email">
        Получить код
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
      <button class="secondary-button" type="button" :disabled="session.loading" @click="resendCode">
        Отправить код ещё раз
      </button>
      <button class="secondary-button" type="button" :disabled="session.loading" @click="changeEmail">
        Изменить email
      </button>
    </form>

    <p v-if="session.authMessage" class="auth-hint">{{ session.authMessage }}</p>
    <p v-if="localError || session.error" class="auth-error">{{ localError || session.error }}</p>
  </section>
</template>
