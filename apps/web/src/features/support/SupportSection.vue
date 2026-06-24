<script setup lang="ts">
import { useI18n, type MessageKey } from "@/features/app/i18n";

const { t } = useI18n();

const topics: Array<{ title: MessageKey; description: MessageKey }> = [
  { title: "supportPayment", description: "supportPaymentDescription" },
  { title: "supportAccess", description: "supportAccessDescription" },
  { title: "supportOther", description: "supportOtherDescription" }
];
</script>

<template>
  <section class="space-y-5">
    <div class="section-head">
      <div>
        <h2 class="section-title">Поддержка</h2>
        <p class="section-subtitle">Помощь по доступу, оплате и материалам.</p>
      </div>
    </div>

    <div class="grid gap-3">
      <article v-for="topic in topics" :key="topic.title" class="surface-card">
        <h3 class="font-semibold text-[var(--text)]">{{ t(topic.title) }}</h3>
        <p class="mt-1 text-sm leading-6 text-[var(--muted)]">{{ t(topic.description) }}</p>
      </article>
    </div>
  </section>
</template>
