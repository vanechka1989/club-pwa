<script setup lang="ts">
import { Moon, Sun } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import AdminSection from "@/features/admin/AdminSection.vue";
import PaymentsSection from "@/features/billing/PaymentsSection.vue";
import { useI18n, type Locale } from "@/features/app/i18n";
import LearningSection from "@/features/learning/LearningSection.vue";
import { navItems, type AppSection } from "@/features/app/navigation";
import ProfileSection from "@/features/profile/ProfileSection.vue";
import SupportSection from "@/features/support/SupportSection.vue";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type Theme } from "@/stores/ui";

const session = useSessionStore();
const ui = useUiStore();
const { currentLocale, setLocale, t } = useI18n();
const activeSection = ref<AppSection>("profile");

const visibleNavItems = computed(() =>
  navItems.filter((item) => !item.adminOnly || session.user?.role === "admin" || session.user?.role === "owner")
);

function changeLocale(locale: Locale) {
  setLocale(locale);
}

function changeTheme(theme: Theme) {
  ui.setTheme(theme);
}

onMounted(() => {
  window.Telegram?.WebApp?.ready();
  window.Telegram?.WebApp?.expand();
  void session.load();
});
</script>

<template>
  <main class="app-root min-h-screen pb-24 text-[var(--text)]">
    <h1 class="sr-only">{{ t("brand") }}</h1>
    <section class="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5">
      <header class="mb-3 space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div v-if="activeSection !== 'profile'">
            <p class="section-eyebrow">{{ t("tagline") }}</p>
            <h1 class="mt-2 max-w-xl text-2xl font-semibold leading-tight sm:text-3xl">
              {{ t("headline") }}
            </h1>
          </div>
          <div v-else></div>
          <div class="compact-controls shrink-0 self-start">
            <button
              type="button"
              :aria-label="t('language')"
              @click="changeLocale(currentLocale === 'ru' ? 'en' : 'ru')"
            >
              {{ currentLocale.toUpperCase() }}
            </button>
            <button
              type="button"
              :aria-label="t('theme')"
              @click="changeTheme(ui.theme === 'dark' ? 'light' : 'dark')"
            >
              <Sun v-if="ui.theme === 'dark'" class="h-4 w-4" aria-hidden="true" />
              <Moon v-else class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div class="content-panel p-4 sm:p-5">
        <div v-if="session.loading" class="text-sm text-[var(--muted)]">{{ t("loading") }}</div>

        <div v-else-if="session.error" class="space-y-3">
          <p class="text-lg font-semibold">{{ t("authTitle") }}</p>
          <p class="text-sm leading-6 text-[var(--muted)]">{{ session.error }}</p>
        </div>

        <div v-else-if="session.user">
          <ProfileSection v-if="activeSection === 'profile'" @open-payments="activeSection = 'payments'" />
          <LearningSection v-else-if="activeSection === 'learning'" />
          <PaymentsSection v-else-if="activeSection === 'payments'" />
          <SupportSection v-else-if="activeSection === 'support'" />
          <AdminSection v-else />
        </div>
      </div>
    </section>

    <nav class="bottom-nav" aria-label="Club sections">
      <button
        v-for="item in visibleNavItems"
        :key="item.id"
        class="bottom-nav-item"
        :class="{ 'bottom-nav-item-active': activeSection === item.id }"
        type="button"
        :aria-pressed="activeSection === item.id"
        @click="activeSection = item.id"
      >
        <component :is="item.icon" class="h-5 w-5" aria-hidden="true" />
        <span>{{ t(item.labelKey) }}</span>
      </button>
    </nav>
  </main>
</template>
