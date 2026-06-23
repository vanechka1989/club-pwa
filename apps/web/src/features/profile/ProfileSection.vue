<script setup lang="ts">
import { BarChart3, Check, Moon, Palette, Sun } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { getLearningHome } from "@/api/client";
import { useI18n } from "@/features/app/i18n";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type ColorScheme, type Theme } from "@/stores/ui";

defineEmits<{
  openPayments: [];
}>();

const session = useSessionStore();
const ui = useUiStore();
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
const themeOptions: Array<{ value: Theme; label: string; icon: typeof Moon }> = [
  { value: "dark", label: "Ночь", icon: Moon },
  { value: "light", label: "День", icon: Sun }
];
const colorOptions: Array<{ value: ColorScheme; label: string; colors: string[] }> = [
  { value: "midnight", label: "Полночь", colors: ["#080922", "#f2f2f7"] },
  { value: "emerald", label: "Хвоя", colors: ["#12382d", "#7dd3b0"] },
  { value: "graphite", label: "Графит", colors: ["#242833", "#d6d9e2"] },
  { value: "sakura", label: "Сакура", colors: ["#3a2034", "#f9a8d4"] }
];

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

    <section class="soft-card profile-settings">
      <div class="flex items-center justify-between gap-3">
        <h3 class="soft-section-title">Оформление</h3>
        <Palette class="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
      </div>

      <div class="theme-choice-row mt-3">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          class="theme-choice"
          :class="{ 'theme-choice-active': ui.theme === option.value }"
          type="button"
          @click="ui.setTheme(option.value)"
        >
          <component :is="option.icon" class="h-4 w-4" aria-hidden="true" />
          <span>{{ option.label }}</span>
        </button>
      </div>

      <div class="scheme-grid mt-3">
        <button
          v-for="option in colorOptions"
          :key="option.value"
          class="scheme-choice"
          :class="{ 'scheme-choice-active': ui.colorScheme === option.value }"
          type="button"
          @click="ui.setColorScheme(option.value)"
        >
          <span class="scheme-swatch" aria-hidden="true">
            <span :style="{ background: option.colors[0] }"></span>
            <span :style="{ background: option.colors[1] }"></span>
          </span>
          <span>{{ option.label }}</span>
          <Check v-if="ui.colorScheme === option.value" class="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
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
