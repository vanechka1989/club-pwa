<script setup lang="ts">
import type { AdminIntegrationHealthResponse, AdminServerErrorLog, AdminServerStatus } from "@club/shared";
import { computed, onMounted, ref } from "vue";
import { createAdminDatabaseBackupDownloadLink, getAdminIntegrationHealth, getAdminServerErrors, getAdminServerStatus, restoreAdminDatabaseBackup } from "@/api/client";
import { useAppDialogsStore } from "@/stores/appDialogs";

const dialogs = useAppDialogsStore();
const status = ref<AdminServerStatus | null>(null);
const integrations = ref<AdminIntegrationHealthResponse | null>(null);
const errors = ref<AdminServerErrorLog[]>([]);
const loading = ref(false);
const message = ref("");
const restoreFile = ref<File | null>(null);
const restoreConfirmation = ref("");
const canRestore = computed(() => Boolean(restoreFile.value) && restoreConfirmation.value === "ВОССТАНОВИТЬ" && !loading.value);
const integrationLabels = { healthy: "Работает", warning: "Внимание", disabled: "Отключено", error: "Ошибка" } as const;
const formatBytes = (value: number) => value >= 1073741824 ? `${(value / 1073741824).toFixed(1)} ГБ` : `${(value / 1048576).toFixed(0)} МБ`;
const formatDate = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const uptime = (seconds: number) => `${Math.floor(seconds / 86400)} д. ${Math.floor((seconds % 86400) / 3600)} ч.`;

async function load() {
  loading.value = true;
  message.value = "";
  try {
    const [server, health, logs] = await Promise.all([getAdminServerStatus(), getAdminIntegrationHealth(), getAdminServerErrors()]);
    status.value = server.status;
    integrations.value = health;
    errors.value = logs.errors;
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : "Не удалось загрузить мониторинг.";
  } finally {
    loading.value = false;
  }
}

async function downloadBackup() {
  loading.value = true;
  try {
    const link = await createAdminDatabaseBackupDownloadLink();
    window.location.assign(link.url);
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : "Не удалось скачать базу.";
  } finally { loading.value = false; }
}

function selectRestoreFile(event: Event) {
  restoreFile.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

async function restoreBackup() {
  if (!canRestore.value || !restoreFile.value) return;
  const accepted = await dialogs.confirm({ title: "Восстановить базу?", description: "Текущие данные клуба будут полностью заменены содержимым резервной копии.", confirmLabel: "Восстановить", tone: "danger" });
  if (!accepted) return;
  loading.value = true;
  try {
    await restoreAdminDatabaseBackup({ file: restoreFile.value, confirmation: restoreConfirmation.value });
    message.value = "База восстановлена. Обновите приложение после перезапуска API.";
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : "Не удалось восстановить базу.";
  } finally { loading.value = false; }
}

onMounted(load);
</script>

<template>
  <section class="ops-panel">
    <header class="ops-head"><div><h3>Сервер и интеграции</h3><p>Нагрузка API, внешние сервисы и постоянный журнал ошибок.</p></div><button class="ops-button" type="button" :disabled="loading" @click="load">{{ loading ? "Загрузка…" : "Обновить" }}</button></header>
    <div v-if="status" class="metric-grid">
      <article><span>API</span><strong>{{ status.ok ? "Работает" : "Ошибка" }}</strong><small>Uptime {{ uptime(status.processUptimeSeconds) }}</small></article>
      <article><span>Запросы</span><strong>{{ status.requestMetrics.requestsPerMinute.toFixed(1) }}/мин</strong><small>{{ status.requestMetrics.requests }} за {{ status.requestMetrics.windowSeconds }} сек.</small></article>
      <article><span>Задержка p95</span><strong>{{ status.requestMetrics.p95DurationMs.toFixed(0) }} мс</strong><small>Средняя {{ status.requestMetrics.averageDurationMs.toFixed(0) }} мс</small></article>
      <article :class="{ danger: status.requestMetrics.errorRatePercent > 2 }"><span>Ошибки запросов</span><strong>{{ status.requestMetrics.errorRatePercent.toFixed(1) }}%</strong><small>{{ status.requestMetrics.failedRequests }} запросов</small></article>
      <article><span>Node RSS</span><strong>{{ formatBytes(status.processMemory.rssBytes) }}</strong><small>Heap {{ formatBytes(status.processMemory.heapUsedBytes) }}</small></article>
      <article><span>Сервер / диск</span><strong>{{ status.systemMemory.usedPercent }}% / {{ status.disk?.usedPercent ?? "—" }}%</strong><small>{{ status.cpuCount }} CPU · load {{ status.loadAverage.join(" / ") }}</small></article>
    </div>
    <section class="ops-card"><div><h4>Интеграции</h4><p>Проверяется не наличие поля в настройках, а возможность работы сервиса.</p></div><div class="integration-list"><article v-for="item in integrations?.items ?? []" :key="item.id"><div><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></div><em :class="`state-${item.status}`">{{ integrationLabels[item.status] }}</em></article></div></section>
    <section class="ops-card"><div><h4>База данных</h4><p>Резервная копия и восстановление PostgreSQL.</p></div><button class="ops-button" type="button" :disabled="loading" @click="downloadBackup">Скачать резервную копию</button><div class="restore"><input type="file" accept=".dump,application/octet-stream" @change="selectRestoreFile"><input v-model.trim="restoreConfirmation" placeholder="Введите ВОССТАНОВИТЬ"><button class="danger-action" type="button" :disabled="!canRestore" @click="restoreBackup">Восстановить</button></div></section>
    <p v-if="message" class="ops-note">{{ message }}</p>
    <section class="ops-card"><div><h4>Ошибки API</h4><p>{{ status?.serverErrorCount ?? errors.length }} записей сохраняются между перезапусками.</p></div><div class="error-list"><article v-for="entry in errors" :key="entry.id"><strong>{{ entry.title }}</strong><span>{{ entry.method || "CLIENT" }} {{ entry.path || "—" }} · {{ formatDate(entry.createdAt) }}</span><small>{{ entry.detail }}</small></article><p v-if="!errors.length">Ошибок пока нет.</p></div></section>
  </section>
</template>

<style scoped>
.ops-panel{display:grid;gap:16px}.ops-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.ops-head h3,.ops-card h4{margin:0}.ops-head p,.ops-card p{margin:4px 0 0;color:var(--muted)}.ops-button,.danger-action{min-height:44px;padding:0 16px;border:1px solid var(--border);border-radius:14px;background:var(--surface-2);color:var(--text);font:inherit;font-weight:750}.metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.metric-grid article{display:grid;gap:5px;padding:14px;border:1px solid var(--border);border-radius:16px;background:var(--surface)}.metric-grid span,.metric-grid small{color:var(--muted)}.metric-grid strong{font-size:1.25rem}.metric-grid .danger strong{color:#ff8e8e}.ops-card{display:grid;gap:14px;padding:16px;border:1px solid var(--border);border-radius:18px;background:var(--surface)}.integration-list,.error-list{display:grid;gap:8px}.integration-list article{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--border);border-radius:14px}.integration-list article>div,.error-list article{display:grid;gap:3px;min-width:0}.integration-list small,.error-list span,.error-list small{color:var(--muted)}.integration-list em{flex:none;padding:6px 9px;border-radius:999px;font-size:.78rem;font-style:normal;font-weight:800}.state-healthy{color:#4bd29f;background:rgba(38,183,128,.13)}.state-warning{color:#e1b747;background:rgba(215,170,48,.13)}.state-disabled{color:var(--muted);background:var(--surface-2)}.state-error{color:#ff8e8e;background:rgba(190,50,50,.14)}.restore{display:grid;grid-template-columns:1fr 1fr auto;gap:8px}.restore input{min-width:0;min-height:44px;padding:8px 12px;border:1px solid var(--border);border-radius:14px;background:var(--surface-2);color:var(--text)}.danger-action{color:#ff9b9b}.error-list article{padding:12px;border:1px solid var(--border);border-radius:14px}.error-list small{max-height:7rem;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.ops-note{margin:0;padding:12px 14px;border-radius:14px;background:color-mix(in srgb,var(--accent) 12%,transparent)}@media(max-width:620px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.restore{grid-template-columns:1fr}.ops-head{align-items:flex-start}}@media(max-width:360px){.metric-grid{grid-template-columns:1fr}}
</style>
