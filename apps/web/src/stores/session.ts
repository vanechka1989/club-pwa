import type { ClubUser } from "@club/shared";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { createCheckout, getMe } from "@/api/client";

export const useSessionStore = defineStore("session", () => {
  const user = ref<ClubUser | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isMember = computed(() => user.value?.membershipStatus === "active");

  async function load() {
    loading.value = true;
    error.value = null;

    try {
      const response = await getMe();
      user.value = response.user;
    } catch {
      error.value = "Откройте приложение внутри Telegram, чтобы подтвердить доступ к клубу.";
    } finally {
      loading.value = false;
    }
  }

  async function subscribe() {
    const response = await createCheckout();
    if (response.checkoutUrl) {
      window.location.href = response.checkoutUrl;
    }
    return response.message;
  }

  return { user, loading, error, isMember, load, subscribe };
});
