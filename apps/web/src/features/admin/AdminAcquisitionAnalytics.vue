<script setup lang="ts">
import type { AcquisitionDestination, AdminAcquisitionDashboard, AdminAcquisitionLink, LearningCategory } from "@club/shared";
import { BarChart3, Check, ChevronRight, Copy, Link2, MousePointerClick, Plus, RefreshCw, UsersRound, WalletCards } from "lucide-vue-next";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { createAdminAcquisitionLink, getAdminAcquisitionDashboard, getAdminAcquisitionLinks, updateAdminAcquisitionLinkStatus } from "@/api/client";
import TaskScreen from "@/features/app/TaskScreen.vue";

const props = defineProps<{ from?: string | undefined; to?: string | undefined; learningCategories?: LearningCategory[] | undefined }>();
const dashboard = ref<AdminAcquisitionDashboard | null>(null);
const firstTouchDashboard = ref<AdminAcquisitionDashboard | null>(null);
const lastTouchDashboard = ref<AdminAcquisitionDashboard | null>(null);
const links = ref<AdminAcquisitionLink[]>([]);
const loading = ref(false);
const linkScreenOpen = ref(false);
const saving = ref(false);
const copiedId = ref<string | null>(null);
const error = ref<string | null>(null);
const form = reactive({ name: "", source: "", medium: "", campaign: "", content: "", destinationKind: "home" as "home" | "billing" | "module", moduleId: "" });

const dateOptions = computed(() => ({
  ...(props.from ? { from: new Date(`${props.from}T00:00:00`).toISOString() } : {}),
  ...(props.to ? { to: new Date(`${props.to}T23:59:59.999`).toISOString() } : {})
}));
const maxTimeline = computed(() => Math.max(1, ...(dashboard.value?.timeline.map((item) => Math.max(item.visits, item.registrations, item.paidUsers)) ?? [1])));
const funnel = computed(() => {
  const summary = dashboard.value?.summary;
  return [
    { label: "Визиты", value: summary?.uniqueVisitors ?? 0, tone: "visit" },
    { label: "Регистрации", value: summary?.registrations ?? 0, tone: "registration" },
    { label: "Оплатили", value: summary?.paidUsers ?? 0, tone: "paid" }
  ];
});
const sourceComparison = computed(() => {
  const firstByKey = new Map((firstTouchDashboard.value?.sources ?? []).map((source) => [source.key, source]));
  const lastByKey = new Map((lastTouchDashboard.value?.sources ?? []).map((source) => [source.key, source]));
  const keys = new Set([...firstByKey.keys(), ...lastByKey.keys()]);
  return [...keys]
    .map((key) => {
      const first = firstByKey.get(key);
      const last = lastByKey.get(key);
      return { key, label: first?.label ?? last?.label ?? key, visits: first?.visits ?? last?.visits ?? 0, overlap: first?.overlapRegistrations ?? last?.overlapRegistrations ?? 0, first, last };
    })
    .sort((left, right) => Math.max(right.first?.revenueRub ?? 0, right.last?.revenueRub ?? 0) - Math.max(left.first?.revenueRub ?? 0, left.last?.revenueRub ?? 0));
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [firstDashboard, lastDashboard, nextLinks] = await Promise.all([
      getAdminAcquisitionDashboard({ ...dateOptions.value, attribution: "first" }),
      getAdminAcquisitionDashboard({ ...dateOptions.value, attribution: "last" }),
      getAdminAcquisitionLinks()
    ]);
    firstTouchDashboard.value = firstDashboard;
    lastTouchDashboard.value = lastDashboard;
    dashboard.value = lastDashboard;
    links.value = nextLinks.links;
  } catch {
    error.value = "Не удалось загрузить аналитику источников.";
  } finally {
    loading.value = false;
  }
}

async function createLink() {
  const destination: AcquisitionDestination = form.destinationKind === "module" ? { kind: "module", moduleId: form.moduleId } : { kind: form.destinationKind };
  saving.value = true;
  error.value = null;
  try {
    const created = await createAdminAcquisitionLink({ name: form.name, source: form.source, medium: form.medium, campaign: form.campaign, content: form.content || null, destination });
    links.value = [created, ...links.value.filter((item) => item.id !== created.id)];
    Object.assign(form, { name: "", source: "", medium: "", campaign: "", content: "", destinationKind: "home", moduleId: "" });
    await copyLink(created);
    await load();
  } catch {
    error.value = "Не удалось создать ссылку. Проверьте обязательные поля.";
  } finally {
    saving.value = false;
  }
}

async function copyLink(link: AdminAcquisitionLink) {
  await navigator.clipboard.writeText(link.url);
  copiedId.value = link.id;
  window.setTimeout(() => { if (copiedId.value === link.id) copiedId.value = null; }, 1800);
}

async function toggleLink(link: AdminAcquisitionLink) {
  const updated = await updateAdminAcquisitionLinkStatus(link.id, !link.isActive);
  links.value = links.value.map((item) => item.id === updated.id ? updated : item);
  await load();
}

function money(value: number) { return `${value.toLocaleString("ru-RU")} ₽`; }
function clients(value: number) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? "клиентов" : mod10 === 1 ? "клиент" : mod10 >= 2 && mod10 <= 4 ? "клиента" : "клиентов";
  return `${value} ${word}`;
}
function shortDate(value: string) { return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }); }

watch([() => props.from, () => props.to], load);
onMounted(load);
</script>

<template>
  <section class="acquisition" aria-label="Аналитика привлечения">
    <header class="acquisition-head">
      <div><span>Привлечение</span><strong>От клика до оплаты</strong></div>
      <button class="acquisition-refresh ui-button" type="button" :disabled="loading" aria-label="Обновить" @click="load"><RefreshCw aria-hidden="true" /></button>
    </header>

    <p v-if="error" class="acquisition-error">{{ error }}</p>

    <div class="acquisition-kpis">
      <article><MousePointerClick aria-hidden="true" /><span>Визиты</span><strong>{{ dashboard?.summary.uniqueVisitors ?? '—' }}</strong><small>{{ dashboard?.summary.visits ?? 0 }} переходов</small></article>
      <article><UsersRound aria-hidden="true" /><span>Регистрации</span><strong>{{ dashboard?.summary.registrations ?? '—' }}</strong><small>{{ dashboard?.summary.visitToRegistrationRate ?? 0 }}% из визита</small></article>
      <article><WalletCards aria-hidden="true" /><span>Оплатили</span><strong>{{ dashboard?.summary.paidUsers ?? '—' }}</strong><small>{{ dashboard?.summary.registrationToPaidRate ?? 0 }}% из регистрации</small></article>
      <article><BarChart3 aria-hidden="true" /><span>Выручка</span><strong>{{ money(dashboard?.summary.revenueRub ?? 0) }}</strong><small>{{ dashboard?.summary.visitToPaidRate ?? 0 }}% визит → оплата</small></article>
    </div>

    <section class="acquisition-card acquisition-funnel">
      <div class="acquisition-card-title"><div><strong>Воронка</strong><small>Уникальные пользователи</small></div></div>
      <div class="acquisition-funnel-bars">
        <div v-for="(item, index) in funnel" :key="item.label" class="acquisition-funnel-step">
          <div class="acquisition-funnel-track">
            <span class="acquisition-funnel-fill" :class="`tone-${item.tone}`" :style="{ width: `${(item.value / Math.max(1, funnel[0]?.value ?? 1)) * 100}%` }"></span>
            <span class="acquisition-funnel-label"><b>{{ item.value }}</b> {{ item.label }}</span>
          </div>
          <small v-if="index < funnel.length - 1">{{ index === 0 ? dashboard?.summary.visitToRegistrationRate : dashboard?.summary.registrationToPaidRate }}%</small>
        </div>
      </div>
    </section>

    <section class="acquisition-card acquisition-chart">
      <div class="acquisition-card-title"><div><strong>Динамика</strong><small>Визиты, регистрации и первые оплаты</small></div></div>
      <div v-if="dashboard?.timeline.length" class="acquisition-chart-scroll">
        <div v-for="point in dashboard.timeline" :key="point.date" class="acquisition-chart-day">
          <div class="acquisition-chart-bars">
            <i class="bar-visits" :style="{ height: `${Math.max(3, point.visits / maxTimeline * 78)}px` }" :title="`Визиты: ${point.visits}`"></i>
            <i class="bar-regs" :style="{ height: `${Math.max(3, point.registrations / maxTimeline * 78)}px` }" :title="`Регистрации: ${point.registrations}`"></i>
            <i class="bar-paid" :style="{ height: `${Math.max(3, point.paidUsers / maxTimeline * 78)}px` }" :title="`Оплаты: ${point.paidUsers}`"></i>
          </div>
          <small>{{ shortDate(point.date) }}</small>
        </div>
      </div>
      <p v-else class="acquisition-empty">Данные появятся после первых переходов по меткам.</p>
      <div class="acquisition-legend"><span><i class="bar-visits"></i>Визиты</span><span><i class="bar-regs"></i>Регистрации</span><span><i class="bar-paid"></i>Оплаты</span></div>
    </section>

    <section class="acquisition-card">
      <div class="acquisition-card-title"><div><strong>Источники</strong><small>Как источник участвовал в регистрации</small></div></div>
      <p class="acquisition-source-hint">Значения пересекаются — складывать их не нужно.</p>
      <div v-if="sourceComparison.length" class="acquisition-source-list">
        <article v-for="source in sourceComparison.slice(0, 8)" :key="source.key">
          <header><strong>{{ source.label }}</strong><small>{{ source.visits }} переходов</small></header>
          <div class="acquisition-source-comparison">
            <span><small>Начали с источника</small><b>{{ clients(source.first?.registrations ?? 0) }}</b><em>{{ source.first?.paidUsers ?? 0 }} оплат · {{ money(source.first?.revenueRub ?? 0) }}</em></span>
            <span><small>Перед регистрацией</small><b>{{ clients(source.last?.registrations ?? 0) }}</b><em>{{ source.last?.paidUsers ?? 0 }} оплат · {{ money(source.last?.revenueRub ?? 0) }}</em></span>
          </div>
          <div class="acquisition-source-overlap"><small>Те же клиенты в обеих цифрах</small><b>{{ clients(source.overlap) }}</b></div>
        </article>
      </div>
      <p v-else class="acquisition-empty">Источников пока нет.</p>
    </section>

    <button class="acquisition-links-entry ui-button" type="button" @click="linkScreenOpen = true">
      <span class="acquisition-links-icon"><Link2 aria-hidden="true" /></span>
      <span><strong>Метки и ссылки</strong><small>Создать ссылку и посмотреть результаты</small></span>
      <em>{{ links.length }}</em><ChevronRight aria-hidden="true" />
    </button>

    <TaskScreen v-if="linkScreenOpen" title="Метки и ссылки" subtitle="Источники, кампании и переход после регистрации." portal @back="linkScreenOpen = false">
      <div class="acquisition-link-screen">
        <form class="acquisition-link-form" @submit.prevent="createLink">
          <div class="acquisition-form-head"><span><Plus aria-hidden="true" /></span><div><strong>Новая ссылка</strong><small>UTM-параметры добавятся автоматически</small></div></div>
          <label><span>Название</span><input v-model.trim="form.name" required maxlength="120" placeholder="Например, Пост в Telegram" /></label>
          <div class="acquisition-form-grid"><label><span>Источник</span><input v-model.trim="form.source" required placeholder="telegram" /></label><label><span>Канал</span><input v-model.trim="form.medium" required placeholder="post" /></label></div>
          <div class="acquisition-form-grid"><label><span>Кампания</span><input v-model.trim="form.campaign" required placeholder="july_launch" /></label><label><span>Вариант</span><input v-model.trim="form.content" placeholder="button_a" /></label></div>
          <label><span>После регистрации</span><select v-model="form.destinationKind"><option value="home">Главная</option><option value="billing">Оплата</option><option value="module">Модуль</option></select></label>
          <label v-if="form.destinationKind === 'module'"><span>Модуль</span><select v-if="learningCategories?.length" v-model="form.moduleId" required><option disabled value="">Выберите модуль</option><option v-for="category in learningCategories" :key="category.id" :value="category.id">{{ category.title }}</option></select><input v-else v-model.trim="form.moduleId" required placeholder="ID модуля" /></label>
          <button class="primary-button ui-button" type="submit" :disabled="saving">{{ saving ? 'Создаю…' : 'Создать и скопировать' }}</button>
        </form>

        <div class="acquisition-link-list">
          <article v-for="link in links" :key="link.id" :class="{ inactive: !link.isActive }">
            <div class="acquisition-link-title"><div><strong>{{ link.name }}</strong><small>{{ link.source }} / {{ link.medium }} / {{ link.campaign }}</small></div><button type="button" :aria-label="link.isActive ? 'Отключить' : 'Включить'" @click="toggleLink(link)"><span :class="{ on: link.isActive }"></span></button></div>
            <button class="acquisition-link-url" type="button" @click="copyLink(link)"><span>{{ link.url }}</span><Check v-if="copiedId === link.id" aria-hidden="true" /><Copy v-else aria-hidden="true" /></button>
            <div class="acquisition-link-stats"><span><b>{{ link.uniqueVisitors }}</b>визитов</span><span><b>{{ link.registrations }}</b>регистраций</span><span><b>{{ link.paidUsers }}</b>оплатили</span><span><b>{{ money(link.revenueRub) }}</b>выручка</span></div>
          </article>
          <p v-if="!links.length" class="acquisition-empty">Создайте первую ссылку для отслеживания.</p>
        </div>
      </div>
    </TaskScreen>
  </section>
</template>

<style scoped>
.acquisition{display:grid;gap:14px}.acquisition-head{display:flex;align-items:center;justify-content:space-between}.acquisition-head div{display:grid;gap:2px}.acquisition-head span,.acquisition-card-title small{color:var(--muted);font-size:12px}.acquisition-head strong{font-size:20px}.acquisition-refresh{width:42px;height:42px;border:1px solid var(--border);border-radius:14px;background:var(--surface-soft);color:var(--accent);display:grid;place-items:center}.acquisition-refresh svg{width:18px}.acquisition-model{display:grid;grid-template-columns:1fr 1fr;padding:4px;border-radius:14px;background:var(--surface-soft);border:1px solid var(--border)}.acquisition-model button{min-height:40px;border:0;border-radius:11px;background:transparent;color:var(--muted);font-weight:800}.acquisition-model button.active{background:color-mix(in srgb,var(--accent) 18%,var(--surface));color:var(--text);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 70%,transparent)}.acquisition-model-hint{margin:-6px 4px 0;color:var(--muted);font-size:11px;line-height:1.4}.acquisition-error{margin:0;color:#ff8a8a}.acquisition-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.acquisition-kpis article{min-width:0;padding:14px;border:1px solid var(--border);border-radius:18px;background:linear-gradient(145deg,color-mix(in srgb,var(--surface) 95%,var(--accent) 5%),var(--surface));display:grid;grid-template-columns:auto 1fr;gap:3px 8px}.acquisition-kpis svg{grid-row:1/3;width:20px;color:var(--accent)}.acquisition-kpis span,.acquisition-kpis small{color:var(--muted);font-size:11px}.acquisition-kpis strong{font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.acquisition-kpis small{grid-column:1/-1;margin-top:4px}.acquisition-card{padding:16px;border:1px solid var(--border);border-radius:20px;background:var(--surface)}.acquisition-card-title>div{display:grid;gap:2px}.acquisition-funnel-bars{display:grid;gap:9px;margin-top:14px}.acquisition-funnel-step{display:grid;grid-template-columns:minmax(0,1fr) 38px;align-items:center;gap:8px}.acquisition-funnel-track{position:relative;display:flex;min-width:0;height:36px;align-items:center;overflow:hidden;border-radius:10px;background:var(--surface-soft);padding:0 10px}.acquisition-funnel-fill{position:absolute;inset:0 auto 0 0;border-radius:inherit;background:color-mix(in srgb,var(--accent) 16%,var(--surface-soft))}.acquisition-funnel-fill.tone-registration{background:color-mix(in srgb,#5ea1ff 20%,var(--surface-soft))}.acquisition-funnel-fill.tone-paid{background:color-mix(in srgb,#b77cff 20%,var(--surface-soft))}.acquisition-funnel-label{position:relative;z-index:1;display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:12px}.acquisition-funnel-step>small{justify-self:end;color:var(--muted);font-size:11px;white-space:nowrap}.acquisition-chart-scroll{display:flex;align-items:flex-end;gap:12px;overflow-x:auto;min-height:115px;margin-top:12px;padding:4px 2px}.acquisition-chart-day{min-width:35px;display:grid;gap:5px;text-align:center}.acquisition-chart-bars{height:80px;display:flex;gap:2px;align-items:flex-end;justify-content:center}.acquisition-chart-bars i{width:8px;border-radius:4px 4px 2px 2px}.bar-visits{background:var(--accent)}.bar-regs{background:#5ea1ff}.bar-paid{background:#b77cff}.acquisition-chart-day small{color:var(--muted);font-size:9px}.acquisition-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;color:var(--muted);font-size:10px}.acquisition-legend span{display:flex;align-items:center;gap:4px}.acquisition-legend i{width:7px;height:7px;border-radius:50%}.acquisition-source-list{display:grid;margin-top:10px}.acquisition-source-list article{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--border)}.acquisition-source-list article>div,.acquisition-source-list article>span{display:grid;gap:3px}.acquisition-source-list article>span{text-align:right}.acquisition-source-list small{color:var(--muted);font-size:10px}.acquisition-links-entry{width:100%;display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:10px;text-align:left;padding:14px;border:1px solid var(--border);border-radius:18px;background:var(--surface);color:var(--text)}.acquisition-links-entry>span:nth-child(2){display:grid;gap:3px}.acquisition-links-entry small{color:var(--muted)}.acquisition-links-entry>em{font-style:normal;color:var(--accent);font-weight:900}.acquisition-links-entry>svg{width:18px;color:var(--muted)}.acquisition-links-icon{width:42px;height:42px;border-radius:13px;background:color-mix(in srgb,var(--accent) 16%,transparent);display:grid;place-items:center;color:var(--accent)}.acquisition-links-icon svg{width:20px}.acquisition-link-screen{display:grid;gap:14px;padding:0 var(--page-pad,16px) 24px}.acquisition-link-form,.acquisition-link-list article{padding:16px;border:1px solid var(--border);border-radius:20px;background:var(--surface);display:grid;gap:13px}.acquisition-form-head{display:flex;gap:10px;align-items:center}.acquisition-form-head>span{width:40px;height:40px;border-radius:12px;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);display:grid;place-items:center}.acquisition-form-head>span svg{width:19px}.acquisition-form-head>div{display:grid;gap:2px}.acquisition-form-head small,.acquisition-link-title small{color:var(--muted)}.acquisition-link-form label{display:grid;gap:6px}.acquisition-link-form label>span{font-size:12px;font-weight:800}.acquisition-link-form input,.acquisition-link-form select{width:100%;min-height:46px;border:1px solid var(--border);border-radius:13px;background:var(--surface-soft);color:var(--text);padding:0 12px;font:inherit}.acquisition-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.acquisition-link-list{display:grid;gap:10px}.acquisition-link-list article.inactive{opacity:.58}.acquisition-link-title{display:flex;justify-content:space-between;gap:10px}.acquisition-link-title>div{display:grid;gap:2px;min-width:0}.acquisition-link-title>button{width:42px;height:25px;border:0;border-radius:20px;background:var(--surface-soft);padding:3px}.acquisition-link-title>button span{display:block;width:19px;height:19px;border-radius:50%;background:var(--muted);transition:.2s}.acquisition-link-title>button span.on{transform:translateX(17px);background:var(--accent)}.acquisition-link-url{display:flex;align-items:center;gap:8px;width:100%;border:1px solid var(--border);border-radius:12px;background:var(--surface-soft);color:var(--text);padding:9px;text-align:left}.acquisition-link-url span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:11px}.acquisition-link-url svg{width:17px;color:var(--accent)}.acquisition-link-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.acquisition-link-stats span{padding:8px;border-radius:10px;background:var(--surface-soft);display:grid;color:var(--muted);font-size:10px}.acquisition-link-stats b{color:var(--text);font-size:13px}.acquisition-empty{margin:12px 0 0;color:var(--muted);font-size:12px}.acquisition-error{font-size:12px}
.acquisition>*{min-width:0;max-width:100%}.acquisition-head,.acquisition-model,.acquisition-kpis,.acquisition-card,.acquisition-links-entry{width:100%;min-width:0}.acquisition-model button,.acquisition-kpis article,.acquisition-source-list article,.acquisition-source-list article>div,.acquisition-source-list article>span,.acquisition-links-entry>span{min-width:0}.acquisition-chart-scroll{width:100%;min-width:0;max-width:100%}.acquisition-source-list strong{overflow-wrap:anywhere}.acquisition-source-list article>div{overflow:hidden}.acquisition-links-entry small{overflow-wrap:anywhere}
.acquisition-source-list{display:grid;gap:10px;margin-top:12px}.acquisition-source-list article{display:grid;gap:10px;padding:12px 0;border-top:1px solid var(--border)}.acquisition-source-list article>header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.acquisition-source-list article>header strong{min-width:0}.acquisition-source-list article>header small{flex:0 0 auto;color:var(--muted);font-size:10px}.acquisition-source-comparison{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px!important;overflow:visible!important}.acquisition-source-comparison>span{display:grid;min-width:0;gap:3px;padding:10px;border-radius:12px;background:var(--surface-soft);text-align:left!important}.acquisition-source-comparison small,.acquisition-source-comparison em{color:var(--muted);font-size:9px;font-style:normal;line-height:1.25}.acquisition-source-comparison b{font-size:12px;line-height:1.2}
.acquisition-source-hint{margin:8px 0 0;padding:9px 10px;border-radius:10px;background:color-mix(in srgb,var(--accent) 9%,var(--surface-soft));color:var(--muted);font-size:10px;line-height:1.4}.acquisition-source-overlap{display:flex!important;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border:1px dashed color-mix(in srgb,var(--accent) 35%,var(--border));border-radius:10px;background:color-mix(in srgb,var(--accent) 5%,transparent);overflow:visible!important}.acquisition-source-overlap small{color:var(--muted);font-size:9px}.acquisition-source-overlap b{flex:0 0 auto;font-size:11px}
@media(max-width:359px){.acquisition-kpis{grid-template-columns:1fr}.acquisition-form-grid{grid-template-columns:1fr}.acquisition-model button{font-size:11px}.acquisition-links-entry{grid-template-columns:auto 1fr auto}.acquisition-links-entry>svg{display:none}.acquisition-source-list article{align-items:flex-start}.acquisition-source-list article>span{flex:0 0 88px}.acquisition-link-stats{grid-template-columns:1fr 1fr}}
@media(min-width:720px){.acquisition-kpis{grid-template-columns:repeat(4,1fr)}.acquisition-link-screen{max-width:760px;margin:auto}.acquisition-link-stats{grid-template-columns:repeat(4,1fr)}}
</style>
