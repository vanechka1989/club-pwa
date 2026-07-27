<script setup lang="ts">
import type { AdminErrorGroup, AdminErrorTrackerDetailResponse, AdminErrorTrackerSettings, AdminErrorTrackerSummary, ErrorTrackerSeverity, ErrorTrackerSource, ErrorTrackerStatus } from "@club/shared";
import { onMounted, ref } from "vue";
import { getAdminErrorGroup, getAdminErrorGroups, getAdminErrorTrackerSettings, getAdminErrorTrackerSummary, updateAdminErrorGroupStatus, updateAdminErrorTrackerSettings } from "@/api/client";

const summary = ref<AdminErrorTrackerSummary | null>(null);
const groups = ref<AdminErrorGroup[]>([]);
const selected = ref<AdminErrorTrackerDetailResponse | null>(null);
const settings = ref<AdminErrorTrackerSettings>({ email: null, emailEnabled: true, pushEnabled: true });
const statusFilter = ref<ErrorTrackerStatus | "">("");
const severityFilter = ref<ErrorTrackerSeverity | "">("");
const sourceFilter = ref<ErrorTrackerSource | "">("");
const loading = ref(false);
const message = ref("");

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
    const linkedErrorId = new URLSearchParams(window.location.search).get("error");
    if (linkedErrorId && selected.value?.group.id !== linkedErrorId) selected.value = await getAdminErrorGroup(linkedErrorId);
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : "Не удалось загрузить центр ошибок.";
  } finally { loading.value = false; }
}

async function openGroup(group: AdminErrorGroup) {
  try { selected.value = await getAdminErrorGroup(group.id); }
  catch (cause) { message.value = cause instanceof Error ? cause.message : "Не удалось открыть ошибку."; }
}

async function setStatus(status: ErrorTrackerStatus) {
  if (!selected.value) return;
  const result = await updateAdminErrorGroupStatus(selected.value.group.id, status);
  selected.value.group = result.group;
  const index = groups.value.findIndex((entry) => entry.id === result.group.id);
  if (index >= 0) groups.value[index] = result.group;
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

onMounted(load);
</script>

<template>
  <section class="tracker">
    <header class="tracker-head"><div><h4>Центр ошибок</h4><p>Сбои у клиентов, API и платёжных обработчиков без повторного спама.</p></div><button type="button" :disabled="loading" @click="load">{{ loading ? "Загрузка…" : "Обновить" }}</button></header>
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

    <section v-if="selected" class="tracker-detail">
      <header><div><span>{{ statusLabels[selected.group.status] }}</span><h5>{{ selected.group.title }}</h5><p>{{ selected.group.route || "Раздел не определён" }} · {{ selected.group.totalCount }} событий</p></div><button type="button" aria-label="Закрыть карточку ошибки" @click="selected = null">×</button></header>
      <div class="detail-actions"><button type="button" @click="setStatus('acknowledged')">В работу</button><button type="button" @click="setStatus('resolved')">Решено</button><button type="button" @click="setStatus('ignored')">Игнорировать</button><button v-if="selected.group.status === 'ignored' || selected.group.status === 'resolved'" type="button" @click="setStatus('new')">Вернуть</button></div>
      <article v-for="item in selected.occurrences" :key="item.id" class="occurrence"><strong>{{ item.message }}</strong><small>{{ formatDate(item.occurredAt) }} · {{ item.platform || "платформа неизвестна" }} · {{ item.release || "версия неизвестна" }}</small><pre v-if="item.stack">{{ item.stack }}</pre></article>
      <div class="delivery-list"><span v-for="delivery in selected.deliveries" :key="delivery.id">{{ delivery.channel === 'push' ? 'PWA push' : 'Email' }}: {{ delivery.status }}</span></div>
    </section>

    <section class="tracker-settings">
      <div><h5>Уведомления разработчику</h5><p>Push и email отправляются независимо. Повторы объединяются.</p></div>
      <label class="email-field"><span>Почта для ошибок</span><input v-model="settings.email" aria-label="Почта для ошибок" type="email" placeholder="developer@example.com"></label>
      <div class="channel-switches"><label><input v-model="settings.pushEnabled" aria-label="PWA push" type="checkbox"> PWA push</label><label><input v-model="settings.emailEnabled" aria-label="Email" type="checkbox"> Email</label></div>
      <button type="button" :disabled="loading" @click="saveSettings">Сохранить уведомления</button>
    </section>
    <p v-if="message" class="tracker-note">{{ message }}</p>
  </section>
</template>

<style scoped>
.tracker{display:grid;gap:12px}.tracker-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.tracker h4,.tracker h5,.tracker p{margin:0}.tracker-head p,.tracker-settings p{margin-top:4px;color:var(--muted)}button,select,input{font:inherit}.tracker-head button,.tracker-settings>button,.detail-actions button{min-height:42px;padding:0 14px;border:1px solid var(--border);border-radius:13px;background:var(--surface-2);color:var(--text);font-weight:750}.tracker-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.tracker-summary article{display:grid;gap:4px;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--surface-2)}.tracker-summary span{color:var(--muted);font-size:.78rem}.tracker-summary strong{font-size:1.3rem}.tracker-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.tracker-filters label,.email-field{display:grid;gap:5px;color:var(--muted);font-size:.78rem}.tracker-filters select,.email-field input{width:100%;min-height:42px;padding:0 11px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);color:var(--text)}.tracker-list{display:grid;gap:8px}.incident{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;text-align:left;border:1px solid var(--border);border-left:4px solid #e1b747;border-radius:14px;background:var(--surface-2);color:var(--text)}.severity-critical{border-left-color:#ff7777}.severity-error{border-left-color:#ffab70}.incident-main,.incident-impact{display:grid;gap:4px;min-width:0}.incident-main small,.incident-impact small{color:var(--muted)}.incident-main strong{overflow-wrap:anywhere}.incident-impact{text-align:right;flex:none}.incident-impact em{font-size:.7rem;font-style:normal;color:var(--accent)}.tracker-detail,.tracker-settings{display:grid;gap:12px;padding:14px;border:1px solid var(--border);border-radius:16px;background:var(--surface)}.tracker-detail>header{display:flex;justify-content:space-between;gap:12px}.tracker-detail>header button{width:40px;height:40px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);color:var(--text);font-size:1.4rem}.detail-actions{display:flex;flex-wrap:wrap;gap:7px}.occurrence{display:grid;gap:5px;padding:11px;border-radius:13px;background:var(--surface-2)}.occurrence small{color:var(--muted)}.occurrence pre{max-height:150px;margin:0;overflow:auto;white-space:pre-wrap;font-size:.75rem}.delivery-list,.channel-switches{display:flex;flex-wrap:wrap;gap:8px}.delivery-list span,.channel-switches label{padding:7px 10px;border-radius:999px;background:var(--surface-2);font-size:.78rem}.tracker-empty,.tracker-note{padding:11px;border-radius:12px;background:var(--surface-2);color:var(--muted)}@media(max-width:680px){.tracker-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.tracker-filters{grid-template-columns:1fr}.incident{align-items:flex-start}.incident-impact small{max-width:130px}}@media(max-width:380px){.incident{display:grid}.incident-impact{text-align:left}.tracker-head{display:grid}.tracker-head button{width:100%}}
</style>
