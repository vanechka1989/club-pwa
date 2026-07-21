<script setup lang="ts">
import type { AcquisitionTouch, AdminUserAcquisition } from "@club/shared";
import { BarChart3, ChevronDown, Flag, MousePointerClick, Route, WalletCards } from "lucide-vue-next";
import { onMounted, ref, watch } from "vue";
import { getAdminUserAcquisition } from "@/api/client";

const props = defineProps<{ telegramId: string }>();
const emit = defineEmits<{ analytics: [campaign: string | null] }>();
const data = ref<AdminUserAcquisition | null>(null);
const loading = ref(false);

async function load() {
  loading.value = true;
  try { data.value = await getAdminUserAcquisition(props.telegramId); }
  catch { data.value = null; }
  finally { loading.value = false; }
}
function touchTitle(touch: AcquisitionTouch | null) { return touch ? `${touch.source} · ${touch.campaign}` : "Без метки"; }
function touchMeta(touch: AcquisitionTouch | null) { return touch ? `${touch.medium}${touch.content ? ` · ${touch.content}` : ""}` : "Источник не был зафиксирован"; }
function date(value: string | null) { return value ? new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; }
function duration(seconds: number | null) {
  if (seconds === null) return "—";
  const days = Math.floor(seconds / 86400); const hours = Math.floor((seconds % 86400) / 3600); const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days} д. ${hours} ч.` : hours ? `${hours} ч. ${minutes} мин.` : `${minutes} мин.`;
}
watch(() => props.telegramId, load);
onMounted(load);
</script>

<template>
  <details class="client-acquisition admin-detail ui-card" open>
    <summary><span><Route aria-hidden="true" /><b>Источник клиента</b></span><span>{{ touchTitle(data?.lastTouch ?? null) }}<ChevronDown aria-hidden="true" /></span></summary>
    <div v-if="loading" class="client-acquisition-empty">Загружаю путь клиента…</div>
    <div v-else class="client-acquisition-body">
      <div class="client-acquisition-touches">
        <article><span><Flag aria-hidden="true" /></span><div><small>Первое касание</small><strong>{{ touchTitle(data?.firstTouch ?? null) }}</strong><em>{{ touchMeta(data?.firstTouch ?? null) }}</em><time>{{ date(data?.firstTouch?.visitedAt ?? null) }}</time></div></article>
        <article><span><MousePointerClick aria-hidden="true" /></span><div><small>Последнее касание</small><strong>{{ touchTitle(data?.lastTouch ?? null) }}</strong><em>{{ touchMeta(data?.lastTouch ?? null) }}</em><time>{{ date(data?.lastTouch?.visitedAt ?? null) }}</time></div></article>
      </div>
      <div class="client-acquisition-milestones">
        <article><small>До регистрации</small><strong>{{ duration(data?.registrationDelaySeconds ?? null) }}</strong><time>{{ date(data?.registeredAt ?? null) }}</time></article>
        <article><small>До первой оплаты</small><strong>{{ duration(data?.firstPaymentDelaySeconds ?? null) }}</strong><time>{{ date(data?.firstPaidAt ?? null) }}</time></article>
        <article><small>Выручка</small><strong>{{ (data?.revenueRub ?? 0).toLocaleString('ru-RU') }} ₽</strong><time>{{ data?.paidOrders ?? 0 }} оплат</time></article>
      </div>
      <button v-if="data?.lastTouch" class="client-acquisition-open ui-button" type="button" @click="emit('analytics', data.lastTouch?.campaign ?? null)"><BarChart3 aria-hidden="true" />Открыть аналитику кампании</button>
      <details v-if="data?.visits.length" class="client-acquisition-history">
        <summary>История переходов <span>{{ data.visits.length }}<ChevronDown aria-hidden="true" /></span></summary>
        <div><article v-for="(visit, index) in data.visits" :key="`${visit.visitedAt}-${index}`"><span></span><div><strong>{{ touchTitle(visit) }}</strong><small>{{ touchMeta(visit) }}</small></div><time>{{ date(visit.visitedAt) }}</time></article></div>
      </details>
      <p v-else class="client-acquisition-empty">У клиента пока нет переходов по отслеживаемым ссылкам.</p>
    </div>
  </details>
</template>

<style scoped>
.client-acquisition{padding:0;overflow:hidden}.client-acquisition>summary{list-style:none;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:15px;cursor:pointer}.client-acquisition>summary::-webkit-details-marker{display:none}.client-acquisition>summary>span{display:flex;align-items:center;gap:8px;min-width:0}.client-acquisition>summary>span:first-child svg{width:19px;color:var(--accent)}.client-acquisition>summary>span:last-child{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.client-acquisition>summary>span:last-child svg{width:16px;transition:.2s}.client-acquisition[open]>summary>span:last-child svg{transform:rotate(180deg)}.client-acquisition-body{display:grid;gap:12px;padding:0 14px 14px;border-top:1px solid var(--border)}.client-acquisition-touches{display:grid;gap:8px;margin-top:12px}.client-acquisition-touches article{display:flex;gap:10px;padding:12px;border-radius:14px;background:var(--surface-soft)}.client-acquisition-touches article>span{width:34px;height:34px;flex:0 0 auto;border-radius:11px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}.client-acquisition-touches svg{width:17px}.client-acquisition-touches div{min-width:0;display:grid;gap:2px}.client-acquisition-touches small,.client-acquisition-touches em,.client-acquisition-touches time{font-size:10px;color:var(--muted);font-style:normal}.client-acquisition-touches strong{font-size:13px}.client-acquisition-milestones{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.client-acquisition-milestones article{min-width:0;padding:9px;border:1px solid var(--border);border-radius:12px;display:grid;gap:3px}.client-acquisition-milestones small,.client-acquisition-milestones time{font-size:9px;color:var(--muted)}.client-acquisition-milestones strong{font-size:12px;overflow:hidden;text-overflow:ellipsis}.client-acquisition-open{min-height:42px;border:1px solid color-mix(in srgb,var(--accent) 55%,var(--border));border-radius:13px;background:color-mix(in srgb,var(--accent) 12%,var(--surface));color:var(--text);font-weight:800;display:flex;align-items:center;justify-content:center;gap:7px}.client-acquisition-open svg{width:17px;color:var(--accent)}.client-acquisition-history{border-top:1px solid var(--border);padding-top:10px}.client-acquisition-history>summary{list-style:none;display:flex;justify-content:space-between;font-size:12px;font-weight:800}.client-acquisition-history>summary span{display:flex;align-items:center;gap:5px;color:var(--muted)}.client-acquisition-history>summary svg{width:14px}.client-acquisition-history>div{display:grid;margin-top:9px}.client-acquisition-history article{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--border)}.client-acquisition-history article>span{width:7px;height:7px;border-radius:50%;background:var(--accent)}.client-acquisition-history article>div{display:grid}.client-acquisition-history strong{font-size:11px}.client-acquisition-history small,.client-acquisition-history time{font-size:9px;color:var(--muted)}.client-acquisition-empty{padding:14px;color:var(--muted);font-size:11px}
</style>
