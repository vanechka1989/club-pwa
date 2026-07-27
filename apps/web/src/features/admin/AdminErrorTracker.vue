<script setup lang="ts">
import type { AdminErrorGroup, AdminErrorTrackerDetailResponse, AdminErrorTrackerSettings, AdminErrorTrackerSummary, ErrorTrackerSeverity, ErrorTrackerSource, ErrorTrackerStatus } from "@club/shared";
import { onMounted, ref, watch } from "vue";
import { createAdminErrorTrackerTestIncident, getAdminErrorGroup, getAdminErrorGroups, getAdminErrorTrackerSettings, getAdminErrorTrackerSummary, updateAdminErrorGroupStatus, updateAdminErrorTrackerSettings } from "@/api/client";
import TaskScreen from "@/features/app/TaskScreen.vue";
import { buildAdminErrorReport, copyText } from "./errorReport";

const props = defineProps<{ errorId?: string | null }>();
const emit = defineEmits<{ "open-error": [id: string]; "close-error": [] }>();

const summary = ref<AdminErrorTrackerSummary | null>(null);
const groups = ref<AdminErrorGroup[]>([]);
const selected = ref<AdminErrorTrackerDetailResponse | null>(null);
const settings = ref<AdminErrorTrackerSettings>({ email: null, emailEnabled: true, pushEnabled: true });
const statusFilter = ref<ErrorTrackerStatus | "">("");
const severityFilter = ref<ErrorTrackerSeverity | "">("");
const sourceFilter = ref<ErrorTrackerSource | "">("");
const loading = ref(false);
const creatingTest = ref(false);
const updatingStatus = ref(false);
const message = ref("");
const copyMessage = ref("");

const severityLabels = { warning: "Внимание", error: "Ошибка", critical: "Критично" } as const;
const statusLabels = { new: "Новая", acknowledged: "В работе", resolved: "Решена", ignored: "Игнорируется" } as const;
const sourceLabels = { client: "Клиент", api: "API", "background-job": "Фоновая задача", "payment-webhook": "Webhook оплаты" } as const;
const formatDate = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function load() {
  loading.value = true;
  message.value = "";
  try {
    const filters = {
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
      ...(severityFilter.value ? { severity: severityFilter.value } : {}),
      ...(sourceFilter.value ? { source: sourceFilter.value } : {})
    };
    const [nextSummary, list, nextSettings] = await Promise.all([
      getAdminErrorTrackerSummary(), getAdminErrorGroups(filters), getAdminErrorTrackerSettings()
    ]);
    summary.value = nextSummary;
    groups.value = list.groups;
    settings.value = nextSettings;
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : "Не удалось загрузить центр ошибок.";
  } finally { loading.value = false; }
}

async function openGroup(group: AdminErrorGroup) {
  emit("open-error", group.id);
}

async function loadSelectedError(errorId: string | null | undefined) {
  copyMessage.value = "";
  if (!errorId) {
    selected.value = null;
    return;
  }
  try {
    selected.value = await getAdminErrorGroup(errorId);
  } catch (cause) {
    selected.value = null;
    message.value = cause instanceof Error ? cause.message : "Не удалось открыть ошибку.";
  }
}

async function setStatus(status: ErrorTrackerStatus) {
  if (!selected.value || updatingStatus.value) return;
  updatingStatus.value = true;
  message.value = "";
  try {
    const result = await updateAdminErrorGroupStatus(selected.value.group.id, status);
    selected.value.group = result.group;
    const index = groups.value.findIndex((entry) => entry.id === result.group.id);
    if (index >= 0) groups.value[index] = result.group;
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : "Не удалось изменить статус ошибки.";
  } finally {
    updatingStatus.value = false;
  }
}

async function saveSettings() {
  loading.value = true;
  try {
    settings.value = await updateAdminErrorTrackerSettings({
      ...settings.value,
      email: settings.value.email?.trim() || null
    });
    message.value = "Настройки уведомлений сохранены.";
  } catch (cause) { message.value = cause instanceof Error ? cause.message : "Не удалось сохранить настройки."; }
  finally { loading.value = false; }
}

async function createTestIncident() {
  creatingTest.value = true;
  message.value = "";
  try {
    const result = await createAdminErrorTrackerTestIncident();
    await load();
    emit("open-error", result.groupId);
    message.value = "Тестовая ошибка создана. Проверьте включённые push и email.";
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : "Не удалось создать тестовую ошибку.";
  } finally {
    creatingTest.value = false;
  }
}

async function copySelectedReport() {
  if (!selected.value) return;
  copyMessage.value = "";
  try {
    await copyText(buildAdminErrorReport(selected.value));
    copyMessage.value = "Отчёт скопирован.";
  } catch {
    copyMessage.value = "Не удалось скопировать отчёт.";
  }
}

async function copySelectedKind() {
  if (!selected.value) return;
  copyMessage.value = "";
  try {
    await copyText(selected.value.group.kind);
    copyMessage.value = "Технический тип скопирован.";
  } catch {
    copyMessage.value = "Не удалось скопировать технический тип.";
  }
}

watch(() => props.errorId, loadSelectedError, { immediate: true });
onMounted(load);
</script>

<template>
  <section class="tracker">
    <header class="tracker-head"><div><h4>Центр ошибок</h4><p>Сбои у клиентов, API и платёжных обработчиков без повторного спама.</p></div><div class="tracker-actions"><button type="button" :disabled="loading || creatingTest" @click="load">{{ loading ? "Загрузка…" : "Обновить" }}</button><button type="button" class="test-button" :disabled="loading || creatingTest" @click="createTestIncident">{{ creatingTest ? "Создание…" : "Создать тестовую ошибку" }}</button></div></header>
    <div class="tracker-summary">
      <article><span>Новые критичные</span><strong>{{ summary?.newCritical ?? 0 }}</strong></article>
      <article><span>Активные</span><strong>{{ summary?.activeGroups ?? 0 }}</strong></article>
      <article><span>Клиенты за 24 ч.</span><strong>{{ summary?.affectedUsers24h ?? 0 }}</strong></article>
      <article><span>События за 24 ч.</span><strong>{{ summary?.occurrences24h ?? 0 }}</strong></article>
    </div>
    <div class="tracker-filters">
      <label><span>Статус</span><select v-model="statusFilter" @change="load"><option value="">Все</option><option value="new">Новые</option><option value="acknowledged">В работе</option><option value="resolved">Решённые</option><option value="ignored">Игнорируемые</option></select></label>
      <label><span>Важность</span><select v-model="severityFilter" @change="load"><option value="">Все</option><option value="critical">Критичные</option><option value="error">Ошибки</option><option value="warning">Предупреждения</option></select></label>
      <label><span>Источник</span><select v-model="sourceFilter" @change="load"><option value="">Все</option><option value="client">Клиент</option><option value="api">API</option><option value="background-job">Фон</option><option value="payment-webhook">Оплата</option></select></label>
    </div>
    <div class="tracker-list">
      <button v-for="group in groups" :key="group.id" type="button" class="incident" :class="`severity-${group.severity}`" @click="openGroup(group)">
        <span class="incident-main"><strong>{{ group.title }}</strong><small>{{ sourceLabels[group.source] }} · {{ group.route || "раздел не определён" }} · v{{ group.latestRelease || "—" }}</small></span>
        <span class="incident-impact"><em>{{ severityLabels[group.severity] }}</em><b>{{ group.totalCount }} событий</b><small>{{ group.affectedUsers }} клиентов · {{ formatDate(group.lastSeenAt) }}</small></span>
      </button>
      <p v-if="!loading && !groups.length" class="tracker-empty">Подходящих ошибок нет.</p>
    </div>

    <TaskScreen v-if="props.errorId" class="admin-task-screen error-detail-task-screen" title="Ошибка" :subtitle="selected?.group.title || 'Загрузка инцидента…'" portal @back="emit('close-error')">
      <section v-if="selected" class="tracker-detail">
        <div class="detail-overview" :class="`severity-${selected.group.severity}`">
          <div class="detail-status"><span>{{ statusLabels[selected.group.status] }}</span><em>{{ severityLabels[selected.group.severity] }}</em></div>
          <h3>{{ selected.group.title }}</h3>
          <p>{{ sourceLabels[selected.group.source] }} · {{ selected.group.route || "Раздел не определён" }} · v{{ selected.group.latestRelease || "—" }}</p>
          <div class="detail-metrics"><span><b>{{ selected.group.totalCount }}</b> событий</span><span><b>{{ selected.group.affectedUsers }}</b> клиентов</span><span><b>{{ selected.group.affectedDevices }}</b> устройств</span></div>
        </div>
        <div class="detail-actions"><button type="button" :class="{ active: selected.group.status === 'acknowledged' }" :aria-pressed="selected.group.status === 'acknowledged'" :disabled="updatingStatus" @click="setStatus('acknowledged')">В работу</button><button type="button" :class="{ active: selected.group.status === 'resolved' }" :aria-pressed="selected.group.status === 'resolved'" :disabled="updatingStatus" @click="setStatus('resolved')">Решено</button><button type="button" :class="{ active: selected.group.status === 'ignored' }" :aria-pressed="selected.group.status === 'ignored'" :disabled="updatingStatus" @click="setStatus('ignored')">Игнорировать</button><button v-if="selected.group.status === 'ignored' || selected.group.status === 'resolved'" type="button" :disabled="updatingStatus" @click="setStatus('new')">Вернуть</button></div>
        <div class="copy-actions"><button type="button" class="copy-report" @click="copySelectedReport"><span aria-hidden="true">⧉</span> Скопировать отчёт</button></div>
        <div class="technical-type"><div><span>Технический тип</span><code>{{ selected.group.kind }}</code></div><button type="button" aria-label="Скопировать технический тип" @click="copySelectedKind">⧉</button></div>
        <p v-if="copyMessage" class="copy-note" aria-live="polite">{{ copyMessage }}</p>
        <section class="occurrence-list"><h4>События</h4><article v-for="item in selected.occurrences" :key="item.id" class="occurrence"><strong>{{ item.message }}</strong><small>{{ formatDate(item.occurredAt) }} · {{ item.platform || "платформа неизвестна" }} · {{ item.release || "версия неизвестна" }}</small><pre v-if="item.stack">{{ item.stack }}</pre></article></section>
        <div class="delivery-list"><span v-for="delivery in selected.deliveries" :key="delivery.id">{{ delivery.channel === 'push' ? 'PWA push' : 'Email' }}: {{ delivery.status }}</span></div>
      </section>
      <p v-else class="detail-loading">{{ message || "Загружаю данные ошибки…" }}</p>
    </TaskScreen>

    <section class="tracker-settings">
      <div><h5>Уведомления разработчику</h5><p>Push и email отправляются независимо. Повторы объединяются.</p></div>
      <label class="email-field"><span>Почта для ошибок</span><input v-model="settings.email" aria-label="Почта для ошибок" type="email" placeholder="developer@example.com"></label>
      <div class="channel-switches"><label><input v-model="settings.pushEnabled" aria-label="PWA push" type="checkbox"><span>PWA push</span></label><label><input v-model="settings.emailEnabled" aria-label="Email" type="checkbox"><span>Email</span></label></div>
      <button type="button" :disabled="loading" @click="saveSettings">Сохранить уведомления</button>
    </section>
    <p v-if="message" class="tracker-note">{{ message }}</p>
  </section>
</template>

<style scoped>
.tracker{display:grid;gap:12px}.tracker-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.tracker-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.tracker h4,.tracker h5,.tracker p{margin:0}.tracker-head p,.tracker-settings p{margin-top:4px;color:var(--muted)}button,select,input{font:inherit}.tracker-head button,.tracker-settings>button,.detail-actions button,.copy-actions button{min-height:44px;padding:0 14px;border:1px solid var(--border);border-radius:13px;background:var(--surface-2);color:var(--text);font-weight:750}.tracker-head .test-button{border-color:color-mix(in srgb,var(--accent) 52%,var(--border));background:color-mix(in srgb,var(--accent) 10%,var(--surface-2));color:var(--accent)}.tracker-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.tracker-summary article{display:grid;gap:4px;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--surface-2)}.tracker-summary span{color:var(--muted);font-size:.78rem}.tracker-summary strong{font-size:1.3rem}.tracker-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.tracker-filters label,.email-field{display:grid;gap:5px;color:var(--muted);font-size:.78rem}.tracker-filters select,.email-field input{width:100%;min-height:42px;padding:0 11px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);color:var(--text)}.tracker-list{display:grid;gap:8px}.incident{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;text-align:left;border:1px solid var(--border);border-left:4px solid #e1b747;border-radius:14px;background:var(--surface-2);color:var(--text)}.severity-critical{border-left-color:#ff7777}.severity-error{border-left-color:#ffab70}.incident-main,.incident-impact{display:grid;gap:4px;min-width:0}.incident-main small,.incident-impact small{color:var(--muted)}.incident-main strong{overflow-wrap:anywhere}.incident-impact{text-align:right;flex:none}.incident-impact em{font-size:.7rem;font-style:normal;color:var(--accent)}.tracker-settings{display:grid;gap:12px;padding:14px;border:1px solid var(--border);border-radius:16px;background:var(--surface)}.tracker-detail{display:grid;gap:14px;width:100%;max-width:760px;margin:0 auto}.detail-overview{display:grid;gap:9px;padding:16px;border:1px solid var(--border);border-left:4px solid #e1b747;border-radius:16px;background:var(--surface)}.detail-overview.severity-critical{border-left-color:#ff7777}.detail-overview.severity-error{border-left-color:#ffab70}.detail-overview h3{margin:0;overflow-wrap:anywhere}.detail-overview p{margin:0;color:var(--muted)}.detail-status{display:flex;justify-content:space-between;gap:12px}.detail-status span,.detail-status em{font-size:.75rem;font-style:normal;font-weight:800}.detail-status em{color:var(--accent)}.detail-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.detail-metrics span{display:grid;gap:2px;padding:9px;border-radius:10px;background:var(--surface-2);color:var(--muted);font-size:.72rem}.detail-metrics b{color:var(--text);font-size:1rem}.copy-actions{display:flex}.copy-actions .copy-report{width:100%;border-color:color-mix(in srgb,var(--accent) 55%,var(--border));background:color-mix(in srgb,var(--accent) 12%,var(--surface-2));color:var(--accent)}.copy-actions span{font-size:1.15rem}.detail-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.technical-type{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 10px 10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}.technical-type>div{display:grid;gap:4px;min-width:0}.technical-type span{color:var(--muted);font-size:.72rem}.technical-type code{overflow-wrap:anywhere;color:var(--text);font-size:.78rem}.technical-type button{display:grid;place-items:center;flex:0 0 44px;width:44px;height:44px;border:1px solid color-mix(in srgb,var(--accent) 45%,var(--border));border-radius:11px;background:color-mix(in srgb,var(--accent) 10%,var(--surface));color:var(--accent);font-size:1.1rem}.copy-note{padding:9px 11px;border-radius:10px;background:color-mix(in srgb,var(--accent) 10%,var(--surface-2));color:var(--accent);font-size:.8rem}.occurrence-list{display:grid;gap:8px}.occurrence-list h4{margin:0}.occurrence{display:grid;gap:5px;padding:12px;border:1px solid var(--border);border-radius:13px;background:var(--surface)}.occurrence small{color:var(--muted)}.occurrence pre{max-height:240px;margin:0;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.75rem}.delivery-list{display:flex;flex-wrap:wrap;gap:8px}.delivery-list span{padding:7px 10px;border-radius:999px;background:var(--surface);font-size:.78rem}.detail-loading{max-width:760px;margin:0 auto!important;padding:16px;border:1px solid var(--border);border-radius:14px;background:var(--surface);color:var(--muted)}.channel-switches{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.channel-switches label{display:flex;align-items:center;gap:10px;min-height:44px;padding:8px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);color:var(--text);font-size:.82rem;cursor:pointer}.channel-switches input[type="checkbox"]{appearance:none;-webkit-appearance:none;display:grid;place-items:center;inline-size:20px;block-size:20px;min-inline-size:20px;min-block-size:20px;margin:0;padding:0;border:1.5px solid color-mix(in srgb,var(--muted) 70%,var(--border));border-radius:6px;background:var(--surface);box-shadow:none}.channel-switches input[type="checkbox"]::after{content:"";inline-size:5px;block-size:9px;border:solid var(--accent-text);border-width:0 2px 2px 0;opacity:0;transform:rotate(45deg) translate(-1px,-1px)}.channel-switches input[type="checkbox"]:checked{border-color:var(--accent);background:var(--accent)}.channel-switches input[type="checkbox"]:checked::after{opacity:1}.channel-switches input[type="checkbox"]:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.tracker-empty,.tracker-note{padding:11px;border-radius:12px;background:var(--surface-2);color:var(--muted)}@media(max-width:680px){.tracker-head{display:grid}.tracker-actions{display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1.3fr);justify-content:stretch}.tracker-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.tracker-filters{grid-template-columns:1fr}.incident{align-items:flex-start}.incident-impact small{max-width:130px}}@media(max-width:380px){.incident{display:grid}.incident-impact{text-align:left}.tracker-actions{grid-template-columns:1fr}.tracker-head button{width:100%}.channel-switches,.detail-metrics{grid-template-columns:1fr}.detail-actions{grid-template-columns:1fr}}
.detail-actions button.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 18%,var(--surface-2));color:var(--accent)}.detail-actions button:disabled{opacity:.62}
@media(max-width:480px) and (min-width:381px){.detail-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-actions button:nth-child(3):last-child{grid-column:1/-1}}
</style>
