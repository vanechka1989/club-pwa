<script setup lang="ts">
import type { AdminActionLog, OwnerEmailLoginCodeResponse } from "@club/shared";
import { computed, onMounted, ref } from "vue";
import { generateOwnerEmailLoginCode, getAdminProjectSettings, getAdminSettingsAudit, updateAdminProjectSettings } from "@/api/client";

const props = defineProps<{ isOwner: boolean }>();
const rewardDays = ref(10);
const loading = ref(false);
const message = ref("");
const audit = ref<AdminActionLog[]>([]);
const email = ref("");
const generated = ref<OwnerEmailLoginCodeResponse | null>(null);
const auditLabels: Record<string, string> = {
  "project.settings.update": "Настройки проекта",
  "storage.s3.update": "Настройки S3",
  "payment.provider.create": "Платёжная система",
  "payment.provider.update": "Платёжная система"
};

const validReward = computed(() => Number.isInteger(rewardDays.value) && rewardDays.value >= 1 && rewardDays.value <= 3650);
const actorTitle = (log: AdminActionLog) => log.actor?.firstName || log.actor?.username || log.actor?.telegramId || "Система";
const formatDate = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

async function load() {
  loading.value = true;
  message.value = "";
  try {
    const [settings, history] = await Promise.all([getAdminProjectSettings(), getAdminSettingsAudit()]);
    rewardDays.value = settings.settings.referralRewardDays;
    audit.value = history.logs;
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : "Не удалось загрузить настройки.";
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!validReward.value) return;
  loading.value = true;
  message.value = "";
  try {
    const response = await updateAdminProjectSettings({ referralRewardDays: rewardDays.value });
    rewardDays.value = response.settings.referralRewardDays;
    message.value = "Настройки сохранены.";
    audit.value = (await getAdminSettingsAudit()).logs;
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : "Не удалось сохранить настройки.";
  } finally {
    loading.value = false;
  }
}

async function createCode() {
  loading.value = true;
  message.value = "";
  try {
    generated.value = await generateOwnerEmailLoginCode({ email: email.value.trim() });
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : "Не удалось создать код.";
  } finally {
    loading.value = false;
  }
}

async function copyCode() {
  if (generated.value) await navigator.clipboard.writeText(generated.value.code);
}

onMounted(load);
</script>

<template>
  <section class="ops-panel">
    <header class="ops-head"><div><h3>Настройки проекта</h3><p>Параметры клуба и журнал важных изменений.</p></div><button class="ops-button" type="button" :disabled="loading" @click="load">Обновить</button></header>
    <article class="ops-card">
      <div><h4>Реферальная система</h4><p>Бонус пригласившему после первой успешной оплаты.</p></div>
      <form class="settings-form" @submit.prevent="save"><label><span>Дней вознаграждения</span><input v-model.number="rewardDays" min="1" max="3650" type="number" inputmode="numeric"></label><button class="primary-action" type="submit" :disabled="loading || !validReward">Сохранить</button></form>
    </article>
    <article v-if="props.isOwner" class="ops-card">
      <div><h4>Аварийный вход по email</h4><p>Одноразовый код для клиента, который не получил письмо.</p></div>
      <form v-if="!generated" class="settings-form" @submit.prevent="createCode"><label><span>Email</span><input v-model.trim="email" type="email" autocomplete="email" required placeholder="client@example.com"></label><button class="primary-action" type="submit" :disabled="loading">Сгенерировать</button></form>
      <div v-else class="code-result"><span>{{ generated.email }}</span><strong>{{ generated.code }}</strong><small>До {{ formatDate(generated.expiresAt) }}</small><div><button class="ops-button" type="button" @click="copyCode">Скопировать</button><button class="ops-button" type="button" @click="generated = null">Другой код</button></div></div>
    </article>
    <p v-if="message" class="ops-note">{{ message }}</p>
    <article class="ops-card">
      <div><h4>История настроек</h4><p>Кто и когда менял критичные параметры проекта.</p></div>
      <div class="audit-list"><div v-for="log in audit" :key="log.id"><strong>{{ auditLabels[log.action] || log.summary }}</strong><span>{{ actorTitle(log) }} · {{ formatDate(log.createdAt) }}</span><small>{{ log.summary }}</small></div><p v-if="!audit.length">Изменений пока нет.</p></div>
    </article>
  </section>
</template>

<style scoped>
.ops-panel{display:grid;gap:16px}.ops-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.ops-head h3,.ops-card h4{margin:0}.ops-head p,.ops-card p{margin:4px 0 0;color:var(--muted)}.ops-button,.primary-action{min-height:44px;padding:0 16px;border:1px solid var(--border);border-radius:14px;background:var(--surface-2);color:var(--text);font:inherit;font-weight:750}.primary-action{border-color:transparent;background:var(--accent);color:var(--accent-contrast,#071615)}.ops-card{display:grid;gap:14px;padding:16px;border:1px solid var(--border);border-radius:18px;background:var(--surface)}.settings-form{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:10px}.settings-form label{display:grid;gap:7px;font-weight:700}.settings-form input{min-width:0;min-height:46px;padding:0 13px;border:1px solid var(--border);border-radius:14px;background:var(--surface-2);color:var(--text);font:inherit}.code-result{display:grid;gap:8px}.code-result strong{font-size:1.8rem;letter-spacing:.16em}.code-result>div{display:flex;flex-wrap:wrap;gap:8px}.ops-note{margin:0;padding:12px 14px;border-radius:14px;background:color-mix(in srgb,var(--accent) 12%,transparent)}.audit-list{display:grid;gap:8px}.audit-list>div{display:grid;gap:3px;padding:12px;border:1px solid var(--border);border-radius:14px}.audit-list span,.audit-list small{color:var(--muted)}@media(max-width:420px){.ops-head{align-items:flex-start}.settings-form{grid-template-columns:1fr}.primary-action{width:100%}}
</style>
