<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "@/features/app/i18n";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const { t } = useI18n();
const checkoutMessage = ref<string | null>(null);

async function handleSubscribe() {
  checkoutMessage.value = await session.subscribe();
}
</script>

<template>
  <section class="space-y-5">
    <div class="section-head">
      <div>
        <h2 class="section-title">Оплата</h2>
        <p class="section-subtitle">Подписка, продление и платежи.</p>
      </div>
    </div>

    <div class="surface-card">
      <p class="font-semibold text-[var(--text)]">{{ t("monthlyMembership") }}</p>
      <p class="mt-2 text-sm leading-6 text-[var(--muted)]">
        {{ t("paymentDescription") }}
      </p>
      <button v-if="!session.isMember" class="primary-button mt-4" type="button" @click="handleSubscribe">
        {{ t("joinClub") }}
      </button>
      <p v-if="checkoutMessage" class="mt-3 text-sm text-[var(--muted-strong)]">{{ checkoutMessage }}</p>
    </div>
  </section>
</template>
