import type { ClubUser } from "@club/shared";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  createCheckout,
  getMe,
  logoutSession,
  requestEmailCode as requestEmailCodeApi,
  updateAvatarDisplay as updateAvatarDisplayApi,
  updateDisplayName as updateDisplayNameApi,
  uploadAvatar as uploadAvatarApi,
  verifyEmailCode as verifyEmailCodeApi
} from "@/api/client";

type AuthRequestError = Error & {
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
  code?: string;
};

const pendingEmailAuthStorageKey = "club-pending-email-auth";
const pendingEmailAuthTtlMs = 10 * 60 * 1000;
const pendingEmailResendCooldownMs = 60 * 1000;

type StoredPendingEmailAuth = {
  email: string;
  expiresAt: number;
  resendAvailableAt?: number | null;
};

function normalizeStoredPendingEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320 ? email : null;
}

function normalizeStoredTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > Date.now() ? value : null;
}

function readPendingEmailAuth() {
  if (typeof localStorage === "undefined") {
    return { email: "", resendAvailableAt: null };
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(pendingEmailAuthStorageKey) ?? "null") as Partial<StoredPendingEmailAuth> | null;
    const email = normalizeStoredPendingEmail(parsed?.email);
    if (!email || typeof parsed?.expiresAt !== "number" || parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(pendingEmailAuthStorageKey);
      return { email: "", resendAvailableAt: null };
    }

    return {
      email,
      resendAvailableAt: normalizeStoredTimestamp(parsed.resendAvailableAt)
    };
  } catch {
    localStorage.removeItem(pendingEmailAuthStorageKey);
    return { email: "", resendAvailableAt: null };
  }
}

function savePendingEmailAuth(email: string, resendAvailableAt?: number | null) {
  try {
    localStorage.setItem(
      pendingEmailAuthStorageKey,
      JSON.stringify({
        email,
        expiresAt: Date.now() + pendingEmailAuthTtlMs,
        resendAvailableAt: normalizeStoredTimestamp(resendAvailableAt)
      } satisfies StoredPendingEmailAuth)
    );
  } catch {
    // The in-memory auth step still works if storage is unavailable.
  }
}

function clearPendingEmailAuth() {
  try {
    localStorage.removeItem(pendingEmailAuthStorageKey);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

function getRetryAfterSeconds(reason: unknown) {
  if (typeof reason !== "object" || !reason || !("data" in reason) || typeof reason.data !== "object" || !reason.data) {
    return null;
  }

  const retryAfterSeconds = (reason.data as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? Math.ceil(retryAfterSeconds)
    : null;
}

function getAuthRequestError(reason: unknown, fallback: string): AuthRequestError {
  const data = typeof reason === "object" && reason && "data" in reason && typeof reason.data === "object" && reason.data
    ? (reason.data as { error?: unknown; retryAfterSeconds?: unknown; attemptsRemaining?: unknown; code?: unknown })
    : null;
  const message = typeof data?.error === "string" && data.error.trim()
    ? data.error
    : reason instanceof Error && reason.message
      ? reason.message
      : fallback;
  const authError: AuthRequestError = new Error(message);
  if (typeof data?.retryAfterSeconds === "number" && Number.isFinite(data.retryAfterSeconds) && data.retryAfterSeconds > 0) {
    authError.retryAfterSeconds = Math.ceil(data.retryAfterSeconds);
  }
  if (typeof data?.attemptsRemaining === "number" && Number.isFinite(data.attemptsRemaining)) {
    authError.attemptsRemaining = Math.max(0, Math.floor(data.attemptsRemaining));
  }
  if (typeof data?.code === "string") authError.code = data.code;
  return authError;
}

export const useSessionStore = defineStore("session", () => {
  const restoredPendingEmailAuth = readPendingEmailAuth();
  const user = ref<ClubUser | null>(null);
  const loading = ref(false);
  const initialized = ref(false);
  const error = ref<string | null>(null);
  const authMessage = ref<string | null>(null);
  const pendingEmail = ref(restoredPendingEmailAuth.email);
  const pendingEmailResendAvailableAt = ref<number | null>(restoredPendingEmailAuth.resendAvailableAt);

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
      pendingEmail.value = "";
      pendingEmailResendAvailableAt.value = null;
      authMessage.value = null;
      clearPendingEmailAuth();
    } catch {
      if (!options.silent) {
        user.value = null;
        error.value = pendingEmail.value ? null : "Войдите по email, чтобы открыть клуб.";
      }
    } finally {
      if (!options.silent) {
        loading.value = false;
        initialized.value = true;
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

  async function uploadAvatar(file: File) {
    const response = await uploadAvatarApi(file);
    user.value = response.user;
    return response.user;
  }

  async function updateAvatarDisplay(payload: { avatarPositionX: number; avatarPositionY: number; avatarScale: number }) {
    const response = await updateAvatarDisplayApi(payload);
    user.value = response.user;
    return response.user;
  }

  async function updateDisplayName(displayName: string) {
    const response = await updateDisplayNameApi(displayName);
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
      const resendAvailableAt = Date.now() + pendingEmailResendCooldownMs;
      pendingEmail.value = normalizedEmail;
      pendingEmailResendAvailableAt.value = resendAvailableAt;
      savePendingEmailAuth(normalizedEmail, resendAvailableAt);
      authMessage.value = response.devCode
        ? `Код для разработки: ${response.devCode}. Введите его ниже.`
        : null;
      return response;
    } catch (error) {
      const authError = getAuthRequestError(error, "Не удалось отправить код.");
      const retryAfterSeconds = authError.retryAfterSeconds ?? getRetryAfterSeconds(error);
      if (retryAfterSeconds) {
        const resendAvailableAt = Date.now() + retryAfterSeconds * 1000;
        pendingEmail.value = normalizedEmail;
        pendingEmailResendAvailableAt.value = resendAvailableAt;
        savePendingEmailAuth(normalizedEmail, resendAvailableAt);
        authMessage.value = null;
        authError.retryAfterSeconds = retryAfterSeconds;
      } else {
        authMessage.value = null;
      }
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
      pendingEmailResendAvailableAt.value = null;
      authMessage.value = null;
      clearPendingEmailAuth();
    } catch (error) {
      throw getAuthRequestError(error, "Не удалось войти.");
    } finally {
      loading.value = false;
    }
  }

  function resetEmailAuth() {
    pendingEmail.value = "";
    pendingEmailResendAvailableAt.value = null;
    authMessage.value = null;
    error.value = null;
    clearPendingEmailAuth();
  }

  function setPendingEmailResendAvailableAt(value: number | null) {
    pendingEmailResendAvailableAt.value = normalizeStoredTimestamp(value);
    if (pendingEmail.value) {
      savePendingEmailAuth(pendingEmail.value, pendingEmailResendAvailableAt.value);
    }
  }

  async function logout() {
    await logoutSession();
    user.value = null;
    resetEmailAuth();
  }

  return {
    user,
    loading,
    initialized,
    error,
    authMessage,
    pendingEmail,
    pendingEmailResendAvailableAt,
    isMember,
    load,
    subscribe,
    uploadAvatar,
    updateAvatarDisplay,
    updateDisplayName,
    requestEmailCode,
    verifyEmailCode,
    resetEmailAuth,
    setPendingEmailResendAvailableAt,
    logout
  };
});
