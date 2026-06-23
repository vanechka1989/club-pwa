<script setup lang="ts">
import { BarChart3 } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { getLearningHome } from "@/api/client";
import { useI18n } from "@/features/app/i18n";
import { useSessionStore } from "@/stores/session";

defineEmits<{
  openPayments: [];
}>();

const session = useSessionStore();
const { t } = useI18n();

const isMember = computed(() => session.user?.membershipStatus === "active");
const totalItems = ref(0);
const completedItems = ref(0);
const lastOpenedTitle = ref<string | null>(null);
const accessUntil = computed(() =>
  session.user?.membershipExpiresAt ? new Date(session.user.membershipExpiresAt).toLocaleDateString() : t("notActive")
);
const subscriptionProgress = computed(() => (isMember.value ? 72 : 18));
const learningProgress = computed(() => {
  if (!totalItems.value) {
    return 0;
  }

  return Math.round((completedItems.value / totalItems.value) * 100);
});
const isStatsEmpty = computed(() => completedItems.value === 0 && !lastOpenedTitle.value);

onMounted(async () => {
  try {
    const response = await getLearningHome();
    totalItems.value = response.progress.totalItems;
    completedItems.value = response.progress.completedItems;
    lastOpenedTitle.value = response.progress.lastOpenedItem?.title ?? null;
  } catch {
    totalItems.value = 0;
    completedItems.value = 0;
    lastOpenedTitle.value = null;
  }
});
</script>

<template>
    <section class="soft-home space-y-4">
    <section class="soft-hero compact-hero">
      <h2>{{ t("softTitle") }}</h2>
    </section>

    <section class="soft-card">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="section-eyebrow">{{ t("status") }}</p>
          <h3>{{ isMember ? t("softPremiumActive") : t("homeInactive") }}</h3>
        </div>
        <span class="soft-pill">{{ accessUntil }}</span>
      </div>
      <div class="mt-4">
        <div class="subscription-bar">
          <span :style="{ width: `${subscriptionProgress}%` }"></span>
        </div>
        <div class="mt-2 flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
          <span>{{ isMember ? "Доступ активен" : "Ожидает оплаты" }}</span>
          <span>{{ subscriptionProgress }}%</span>
        </div>
      </div>
      <button class="soft-inline-button mt-4" type="button" @click="$emit('openPayments')">
        {{ isMember ? t("homeExtend") : t("joinClub") }}
      </button>
    </section>

    <section class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h3 class="soft-section-title">{{ t("yourStats") }}</h3>
        <span class="soft-link">{{ learningProgress }}%</span>
      </div>

      <div class="grid gap-2">
        <article v-if="isStatsEmpty" class="soft-list-card">
          <div class="soft-code">
            <BarChart3 class="h-4 w-4" aria-hidden="true" />
          </div>
          <div class="min-w-0 flex-1">
            <h4>{{ t("statsEmptyTitle") }}</h4>
            <p>{{ t("statsEmptyText") }}</p>
          </div>
        </article>

        <article v-else class="soft-list-card">
          <div class="soft-code">{{ completedItems }}</div>
          <div class="min-w-0 flex-1">
            <h4>{{ t("learningProgress") }}</h4>
            <p>{{ completedItems }} / {{ totalItems }} · {{ lastOpenedTitle || t("lastOpenedEmpty") }}</p>
          </div>
        </article>
      </div>
    </section>

  </section>
</template>
