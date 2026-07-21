<script setup lang="ts">
import type { AcquisitionAttribution, AcquisitionDestination, AdminAcquisitionDashboard, AdminAcquisitionLink, LearningCategory } from "@club/shared";
import { BarChart3, Check, ChevronRight, Copy, Link2, MousePointerClick, Plus, RefreshCw, UsersRound, WalletCards } from "lucide-vue-next";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { createAdminAcquisitionLink, getAdminAcquisitionDashboard, getAdminAcquisitionLinks, updateAdminAcquisitionLinkStatus } from "@/api/client";
import TaskScreen from "@/features/app/TaskScreen.vue";

const props = defineProps<{ from?: string | undefined; to?: string | undefined; learningCategories?: LearningCategory[] | undefined }>();
const dashboard = ref<AdminAcquisitionDashboard | null>(null);
const links = ref<AdminAcquisitionLink[]>([]);
const attribution = ref<AcquisitionAttribution>("last");
const loading = ref(false);
const linkScreenOpen = ref(false);
const saving = ref(false);
const copiedId = ref<string | null>(null);
const error = ref<string | null>(null);
const form = reactive({ name: "", source: "", medium: "", campaign: "", content: "", destinationKind: "home" as "home" | "billing" | "module", moduleId: "" });

const dateOptions = computed(() => ({
  attribution: attribution.value,
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

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [nextDashboard, nextLinks] = await Promise.all([getAdminAcquisitionDashboard(dateOptions.value), getAdminAcquisitionLinks()]);
    dashboard.value = nextDashboard;
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
function shortDate(value: string) { return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }); }

watch([attribution, () => props.from, () => props.to], load);
onMounted(load);
</script>

<template>
  <section class="acquisition" aria-label="Аналитика привлечения">
    <header class="acquisition-head">
      <div><span>Привлечение</span><strong>От клика до оплаты</strong></div>
      <button class="acquisition-refresh ui-button" type="button" :disabled="loading" aria-label="Обновить" @click="load"><RefreshCw aria-hidden="true" /></button>
    </header>

    <div class="acquisition-model" aria-label="Модель атрибуции">
      <button type="button" :class="{ active: attribution === 'first' }" @click="attribution = 'first'">Первый источник</button>
      <button type="button" :class="{ active: attribution === 'last' }" @click="attribution = 'last'">Последний источник</button>
    </div>
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
          <span :class="`tone-${item.tone}`" :style="{ width: `${Math.max(18, (item.value / Math.max(1, funnel[0]?.value ?? 1)) * 100)}%` }"><b>{{ item.value }}</b> {{ item.label }}</span>
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
      <div class="acquisition-card-title"><div><strong>Источники</strong><small>По выбранной модели атрибуции</small></div></div>
      <div v-if="dashboard?.sources.length" class="acquisition-source-list">
        <article v-for="source in dashboard.sources.slice(0, 8)" :key="source.key">
          <div><strong>{{ source.label }}</strong><small>{{ source.visits }} визитов · {{ source.registrations }} регистраций</small></div>
          <span><b>{{ money(source.revenueRub) }}</b><small>{{ source.paidUsers }} оплатили</small></span>
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
.acquisition{display:grid;gap:14px}.acquisition-head{display:flex;align-items:center;justify-content:space-between}.acquisition-head div{display:grid;gap:2px}.acquisition-head span,.acquisition-card-title small{color:var(--muted);font-size:12px}.acquisition-head strong{font-size:20px}.acquisition-refresh{width:42px;height:42px;border:1px solid var(--border);border-radius:14px;background:var(--surface-soft);color:var(--accent);display:grid;place-items:center}.acquisition-refresh svg{width:18px}.acquisition-model{display:grid;grid-template-columns:1fr 1fr;padding:4px;border-radius:14px;background:var(--surface-soft);border:1px solid var(--border)}.acquisition-model button{min-height:40px;border:0;border-radius:11px;background:transparent;color:var(--muted);font-weight:800}.acquisition-model button.active{background:color-mix(in srgb,var(--accent) 18%,var(--surface));color:var(--text);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 70%,transparent)}.acquisition-error{margin:0;color:#ff8a8a}.acquisition-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.acquisition-kpis article{min-width:0;padding:14px;border:1px solid var(--border);border-radius:18px;background:linear-gradient(145deg,color-mix(in srgb,var(--surface) 95%,var(--accent) 5%),var(--surface));display:grid;grid-template-columns:auto 1fr;gap:3px 8px}.acquisition-kpis svg{grid-row:1/3;width:20px;color:var(--accent)}.acquisition-kpis span,.acquisition-kpis small{color:var(--muted);font-size:11px}.acquisition-kpis strong{font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.acquisition-kpis small{grid-column:1/-1;margin-top:4px}.acquisition-card{padding:16px;border:1px solid var(--border);border-radius:20px;background:var(--surface)}.acquisition-card-title>div{display:grid;gap:2px}.acquisition-funnel-bars{display:grid;gap:9px;margin-top:14px}.acquisition-funnel-step{display:flex;align-items:center;gap:8px}.acquisition-funnel-step>span{min-width:0;height:34px;border-radius:10px;padding:0 10px;display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:12px;background:color-mix(in srgb,var(--accent) 16%,var(--surface-soft))}.acquisition-funnel-step>span.tone-registration{background:color-mix(in srgb,#5ea1ff 20%,var(--surface-soft))}.acquisition-funnel-step>span.tone-paid{background:color-mix(in srgb,#b77cff 20%,var(--surface-soft))}.acquisition-funnel-step>small{color:var(--muted);font-size:11px}.acquisition-chart-scroll{display:flex;align-items:flex-end;gap:12px;overflow-x:auto;min-height:115px;margin-top:12px;padding:4px 2px}.acquisition-chart-day{min-width:35px;display:grid;gap:5px;text-align:center}.acquisition-chart-bars{height:80px;display:flex;gap:2px;align-items:flex-end;justify-content:center}.acquisition-chart-bars i{width:8px;border-radius:4px 4px 2px 2px}.bar-visits{background:var(--accent)}.bar-regs{background:#5ea1ff}.bar-paid{background:#b77cff}.acquisition-chart-day small{color:var(--muted);font-size:9px}.acquisition-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;color:var(--muted);font-size:10px}.acquisition-legend span{display:flex;align-items:center;gap:4px}.acquisition-legend i{width:7px;height:7px;border-radius:50%}.acquisition-source-list{display:grid;margin-top:10px}.acquisition-source-list article{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--border)}.acquisition-source-list article>div,.acquisition-source-list article>span{display:grid;gap:3px}.acquisition-source-list article>span{text-align:right}.acquisition-source-list small{color:var(--muted);font-size:10px}.acquisition-links-entry{width:100%;display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:10px;text-align:left;padding:14px;border:1px solid var(--border);border-radius:18px;background:var(--surface);color:var(--text)}.acquisition-links-entry>span:nth-child(2){display:grid;gap:3px}.acquisition-links-entry small{color:var(--muted)}.acquisition-links-entry>em{font-style:normal;color:var(--accent);font-weight:900}.acquisition-links-entry>svg{width:18px;color:var(--muted)}.acquisition-links-icon{width:42px;height:42px;border-radius:13px;background:color-mix(in srgb,var(--accent) 16%,transparent);display:grid;place-items:center;color:var(--accent)}.acquisition-links-icon svg{width:20px}.acquisition-link-screen{display:grid;gap:14px;padding:0 var(--page-pad,16px) 24px}.acquisition-link-form,.acquisition-link-list article{padding:16px;border:1px solid var(--border);border-radius:20px;background:var(--surface);display:grid;gap:13px}.acquisition-form-head{display:flex;gap:10px;align-items:center}.acquisition-form-head>span{width:40px;height:40px;border-radius:12px;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);display:grid;place-items:center}.acquisition-form-head>span svg{width:19px}.acquisition-form-head>div{display:grid;gap:2px}.acquisition-form-head small,.acquisition-link-title small{color:var(--muted)}.acquisition-link-form label{display:grid;gap:6px}.acquisition-link-form label>span{font-size:12px;font-weight:800}.acquisition-link-form input,.acquisition-link-form select{width:100%;min-height:46px;border:1px solid var(--border);border-radius:13px;background:var(--surface-soft);color:var(--text);padding:0 12px;font:inherit}.acquisition-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.acquisition-link-list{display:grid;gap:10px}.acquisition-link-list article.inactive{opacity:.58}.acquisition-link-title{display:flex;justify-content:space-between;gap:10px}.acquisition-link-title>div{display:grid;gap:2px;min-width:0}.acquisition-link-title>button{width:42px;height:25px;border:0;border-radius:20px;background:var(--surface-soft);padding:3px}.acquisition-link-title>button span{display:block;width:19px;height:19px;border-radius:50%;background:var(--muted);transition:.2s}.acquisition-link-title>button span.on{transform:translateX(17px);background:var(--accent)}.acquisition-link-url{display:flex;align-items:center;gap:8px;width:100%;border:1px solid var(--border);border-radius:12px;background:var(--surface-soft);color:var(--text);padding:9px;text-align:left}.acquisition-link-url span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:11px}.acquisition-link-url svg{width:17px;color:var(--accent)}.acquisition-link-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.acquisition-link-stats span{padding:8px;border-radius:10px;background:var(--surface-soft);display:grid;color:var(--muted);font-size:10px}.acquisition-link-stats b{color:var(--text);font-size:13px}.acquisition-empty{margin:12px 0 0;color:var(--muted);font-size:12px}.acquisition-error{font-size:12px}
@media(min-width:720px){.acquisition-kpis{grid-template-columns:repeat(4,1fr)}.acquisition-link-screen{max-width:760px;margin:auto}.acquisition-link-stats{grid-template-columns:repeat(4,1fr)}}
</style>
