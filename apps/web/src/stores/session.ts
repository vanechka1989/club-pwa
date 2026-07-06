import type { ClubUser } from "@club/shared";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { createCheckout, getMe, logoutSession, refreshAvatar, requestEmailCode as requestEmailCodeApi, verifyEmailCode as verifyEmailCodeApi } from "@/api/client";

type AuthRequestError = Error & { retryAfterSeconds?: number };

function getRetryAfterSeconds(reason: unknown) {
  if (typeof reason !== "object" || !reason || !("data" in reason) || typeof reason.data !== "object" || !reason.data) {
    return null;
  }

  const retryAfterSeconds = (reason.data as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? Math.ceil(retryAfterSeconds)
    : null;
}

export const useSessionStore = defineStore("session", () => {
  const user = ref<ClubUser | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const authMessage = ref<string | null>(null);
  const pendingEmail = ref("");

  const isMember = computed(() => user.value?.membershipStatus === "active");

  async function load(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      loading.value = true;
      error.value = null;
    }

    try {
      const response = await getMe();
      user.value = response.user;
      error.value = null;
    } catch {
      if (!options.silent) {
        user.value = null;
        error.value = "Войдите по email, чтобы открыть клуб.";
      }
    } finally {
      if (!options.silent) {
        loading.value = false;
      }
    }
  }

  async function subscribe() {
    const response = await createCheckout();
    if (response.checkoutUrl) {
      window.location.href = response.checkoutUrl;
    }
    return response.message;
  }

  async function updateAvatar() {
    const response = await refreshAvatar();
    user.value = response.user;
    return response.user;
  }

  async function requestEmailCode(email: string, referralCode?: string | null) {
    const normalizedEmail = email.trim().toLowerCase();
    loading.value = true;
    error.value = null;
    authMessage.value = null;
    try {
      const response = await requestEmailCodeApi({
        email: normalizedEmail,
        ...(referralCode ? { referralCode } : {})
      });
      pendingEmail.value = normalizedEmail;
      authMessage.value = response.devCode
        ? `Код для разработки: ${response.devCode}. Введите его ниже.`
        : `Код отправлен на ${normalizedEmail}. Введите 6 цифр ниже.`;
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить код.";
      const authError: AuthRequestError = new Error(message);
      const retryAfterSeconds = getRetryAfterSeconds(error);
      if (retryAfterSeconds) {
        authError.retryAfterSeconds = retryAfterSeconds;
      }
      authMessage.value = null;
      throw authError;
    } finally {
      loading.value = false;
    }
  }

  async function verifyEmailCode(email: string, code: string, referralCode?: string | null) {
    const normalizedEmail = email.trim().toLowerCase();
    loading.value = true;
    error.value = null;
    try {
      await verifyEmailCodeApi({
        email: normalizedEmail,
        code,
        ...(referralCode ? { referralCode } : {})
      });
      await load({ silent: true });
      pendingEmail.value = "";
      authMessage.value = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось войти.";
      throw new Error(message);
    } finally {
      loading.value = false;
    }
  }

  function resetEmailAuth() {
    pendingEmail.value = "";
    authMessage.value = null;
    error.value = null;
  }

  async function logout() {
    await logoutSession();
    user.value = null;
    resetEmailAuth();
  }

  return { user, loading, error, authMessage, pendingEmail, isMember, load, subscribe, updateAvatar, requestEmailCode, verifyEmailCode, resetEmailAuth, logout };
});
