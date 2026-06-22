<script setup lang="ts">
import { BookOpen, FileText, Layers } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n, type MessageKey } from "@/features/app/i18n";
import { useSessionStore } from "@/stores/session";

defineEmits<{
  openPayments: [];
}>();

const session = useSessionStore();
const { t } = useI18n();

const isMember = computed(() => session.user?.membershipStatus === "active");
const accessUntil = computed(() =>
  session.user?.membershipExpiresAt ? new Date(session.user.membershipExpiresAt).toLocaleDateString() : t("notActive")
);
const subscriptionProgress = computed(() => (isMember.value ? 72 : 18));

const materials: Array<{ code: string; title: MessageKey; text: MessageKey; icon: typeof BookOpen }> = [
  { code: "A", title: "softStartProgram", text: "softStartProgramText", icon: BookOpen },
  { code: "B", title: "softTemplates", text: "softTemplatesText", icon: Layers },
  { code: "C", title: "softAnswers", text: "softAnswersText", icon: FileText }
];
</script>

<template>
  <section class="soft-home space-y-4">
    <section class="soft-hero compact-hero">
      <p class="section-eyebrow">{{ t("softEyebrow") }}</p>
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
        <h3 class="soft-section-title">{{ t("softMaterials") }}</h3>
        <span class="soft-link">{{ t("homeWatchAll") }}</span>
      </div>

      <div class="grid gap-3">
        <article v-for="item in materials" :key="item.code" class="soft-list-card">
          <div class="soft-code">{{ item.code }}</div>
          <div class="min-w-0 flex-1">
            <h4>{{ t(item.title) }}</h4>
            <p>{{ t(item.text) }}</p>
          </div>
          <component :is="item.icon" class="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
        </article>
      </div>
    </section>

  </section>
</template>
