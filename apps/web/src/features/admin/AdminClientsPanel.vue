<script setup lang="ts">
import type { AdminLoginIp, AdminStatsUser, AdminUserDetailResponse, PaymentOrderLog } from "@club/shared";
import { Activity, BookOpen, ChevronRight, CircleDollarSign, CreditCard, Lock, LockOpen, MessageCircle, MessageCircleOff, Network, Paperclip, Route, ShieldAlert, SlidersHorizontal, Smartphone, Trash2, UserRoundPlus, X } from "lucide-vue-next";
import { ref } from "vue";
import TaskScreen from "@/features/app/TaskScreen.vue";
import { formatMembershipStatus } from "@/features/app/i18n";
import { getAdminClientAccessState, getAdminRecurrentPaymentBadge, getAdminTariffLabel } from "./adminClientCard";
import { allClientSourcesFilter, allPaymentProductsFilter, allPaymentProvidersFilter, untaggedClientSourceFilter, type AdminClientUtmField } from "./adminClientAcquisitionFilters";
import { formatAdminClientLastLogin, getAdminClientContact } from "./adminClientList";
import AdminIndividualOfferCard from "./AdminIndividualOfferCard.vue";
import type { AdminClientDetailSection } from "./adminClientDetailSection";

function getAdminTariffBadge(user: AdminStatsUser) {
  return getAdminRecurrentPaymentBadge(user) ?? { label: getAdminTariffLabel(user.tariff), tone: "default" as const };
}

function formatLearningEventCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const label = mod10 === 1 && mod100 !== 11
    ? "событие"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "события"
      : "событий";
  return `${count} ${label}`;
}

type ClientFilters = {
  query: string;
  subscription: "all" | "active" | "closed";
  tariff: string;
  paymentProvider: string;
  paymentProductId: string;
  restrictions: "all" | "restricted";
  source: string;
  utmField: AdminClientUtmField;
  utmValue: string;
};

type ClientSummary = {
  total: number;
  active: number;
  restricted: number;
};

type ClientMessageDraft = {
  open: boolean;
  text: string;
  files: readonly File[];
  sending: boolean;
};

type ClientAccessAction = "open" | "close" | "extend7" | "extend30" | "manual";
type ClientDevice = AdminUserDetailResponse["devices"][number];
const props = defineProps<{
  summary: ClientSummary;
  filters: Readonly<ClientFilters>;
  filtersActive: boolean;
  tariffOptions: ReadonlyArray<{ value: string; label: string }>;
  paymentProviderOptions: ReadonlyArray<{ value: string; label: string }>;
  paymentProductOptions: ReadonlyArray<{ value: string; label: string }>;
  clientSourceOptions: ReadonlyArray<{ value: string; label: string }>;
  filteredUsers: readonly AdminStatsUser[];
  selectedUser: Readonly<AdminStatsUser> | null;
  selectedUserDetail: Readonly<AdminUserDetailResponse> | null;
  selectedUserPaymentOrders: readonly PaymentOrderLog[];
  selectedUserLastPayment: Readonly<PaymentOrderLog> | null;
  selectedUserPaidTotal: number;
  selectedUserDevices: readonly ClientDevice[];
  selectedUserDeviceText: string;
  selectedUserLoginIps: readonly AdminLoginIp[];
  selectedUserLoginIpsLoading: boolean;
  selectedUserLoginIpsError: boolean;
  accessExpiresAt: string;
  pendingClientAccessAction: ClientAccessAction | null;
  accessSaveSucceeded: boolean;
  accessSaveButtonText: string;
  clientAccessBusy: boolean;
  canGrantClientAccess: boolean;
  canManageSelectedUser: boolean;
  canDeleteSelectedUser: boolean;
  deletingClient: boolean;
  canManageClientLearning: boolean;
  canManageSelectedUserAccess: boolean;
  canViewLoginIps: boolean;
  saving: boolean;
  clientMessage: Readonly<ClientMessageDraft>;
  userTitle: (user: AdminStatsUser) => string;
  userInitial: (user: AdminStatsUser) => string;
  selectedUserMeta: (user: AdminStatsUser) => string;
  getAccessActionSummary: (user: AdminStatsUser) => string;
  paymentOrderDate: (order: PaymentOrderLog) => string;
  paymentOrderStatusLabel: (status: PaymentOrderLog["status"]) => string;
  formatAdminDateTime: (value: string) => string;
  formatAdminShortDate: (value: string) => string;
  formatAdminCompactDateTime: (value: string) => string;
  formatLearningEngagementDuration: (seconds: number) => string;
  referralUserTitle: (user: { telegramId: string; firstName: string | null; username: string | null }) => string;
  referralRewardStatusLabel: (status: "none" | "available" | "activated") => string;
  getClientDeviceTitle: (device: ClientDevice["diagnostics"]) => string;
  getClientDeviceScreen: (device: ClientDevice["diagnostics"]) => string;
  isNewLoginIp: (entry: AdminLoginIp) => boolean;
}>();

const emit = defineEmits<{
  "update:filters": [filters: ClientFilters];
  "reset-filters": [];
  "select-user": [user: AdminStatsUser];
  "client-card-close": [];
  "request-client-delete": [user: AdminStatsUser];
  "update:access-expires-at": [value: string];
  "open-access": [];
  "close-access": [];
  "extend-access": [days: 7 | 30];
  "manual-access": [];
  "quick-mute": [user: AdminStatsUser];
  "open-message": [];
  "close-message": [];
  "update:client-message-text": [value: string];
  "update:client-message-files": [files: File[]];
  "submit-message": [];
  "revoke-mute": [id: string];
  "reset-homework": [id: string];
  "open-client-section": [section: AdminClientDetailSection];
  "open-learning-result": [value: { mode: "quiz" | "homework"; recordId: string }];
  "copy-device-info": [text: string];
}>();

const clientMessageInput = ref<HTMLTextAreaElement | null>(null);

defineExpose({
  getClientMessageInput: () => clientMessageInput.value
});

function updateFilters(patch: Partial<ClientFilters>) {
  emit("update:filters", { ...props.filters, ...patch });
}

function updateClientMessageFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  emit("update:client-message-files", Array.from(input.files ?? []).slice(0, 4));
  input.value = "";
}
</script>

<template>
  <section class="admin-panel ui-page-section">
    <div class="admin-panel-head ui-page-header">
      <div><h3>Клиенты и доступ</h3><p>Поиск, продление доступа, быстрый мут и просмотр статистики.</p></div>
    </div>

    <section class="admin-client-overview" aria-label="Сводка по клиентам">
      <article><span>Всего</span><strong>{{ summary.total }}</strong></article>
      <article><span>С доступом</span><strong>{{ summary.active }}</strong></article>
      <article><span>Ограничены</span><strong>{{ summary.restricted }}</strong></article>
    </section>

    <div class="admin-client-searchbar">
      <input :value="filters.query" class="text-input" placeholder="Поиск по ID, имени или username" @input="updateFilters({ query: ($event.target as HTMLInputElement).value.trim() })" />
      <span>Найдено: {{ filteredUsers.length }}</span>
    </div>
    <div class="admin-client-filter-chips" aria-label="Быстрые фильтры клиентов">
      <button type="button" :class="{ active: filters.subscription === 'all' && filters.restrictions === 'all' }" @click="updateFilters({ subscription: 'all', restrictions: 'all' })">Все</button>
      <button type="button" :class="{ active: filters.subscription === 'active' }" @click="updateFilters({ subscription: 'active', restrictions: 'all' })">Активные</button>
      <button type="button" :class="{ active: filters.subscription === 'closed' }" @click="updateFilters({ subscription: 'closed', restrictions: 'all' })">Закрыты</button>
      <button type="button" :class="{ active: filters.restrictions === 'restricted' }" @click="updateFilters({ restrictions: 'restricted', subscription: 'all' })">Ограничены</button>
    </div>
    <details class="admin-client-more-filters">
      <summary><SlidersHorizontal class="h-4 w-4" /> Дополнительные фильтры</summary>
      <div class="admin-filter-grid ui-responsive-grid">
        <select :value="filters.subscription" class="text-input" @change="updateFilters({ subscription: ($event.target as HTMLSelectElement).value as ClientFilters['subscription'] })">
          <option value="all">Любой доступ</option><option value="active">Доступ открыт</option><option value="closed">Доступ закрыт</option>
        </select>
        <select :value="filters.tariff" class="text-input" @change="updateFilters({ tariff: ($event.target as HTMLSelectElement).value })">
          <option v-for="tariff in tariffOptions" :key="tariff.value" :value="tariff.value">{{ tariff.label }}</option>
        </select>
        <select :value="filters.paymentProvider" class="text-input" aria-label="Платёжная система" @change="updateFilters({ paymentProvider: ($event.target as HTMLSelectElement).value })">
          <option :value="allPaymentProvidersFilter">Любая платёжная система</option>
          <option v-for="provider in paymentProviderOptions" :key="provider.value" :value="provider.value">{{ provider.label }}</option>
        </select>
        <select :value="filters.paymentProductId" class="text-input" aria-label="Продукт" @change="updateFilters({ paymentProductId: ($event.target as HTMLSelectElement).value })">
          <option :value="allPaymentProductsFilter">Любой продукт</option>
          <option v-for="product in paymentProductOptions" :key="product.value" :value="product.value">{{ product.label }}</option>
        </select>
        <select :value="filters.restrictions" class="text-input" @change="updateFilters({ restrictions: ($event.target as HTMLSelectElement).value as ClientFilters['restrictions'] })">
          <option value="all">Все клиенты</option><option value="restricted">С ограничениями</option>
        </select>
        <div class="admin-client-acquisition-filters">
          <select :value="filters.source" class="text-input" aria-label="Источник клиента" @change="updateFilters({ source: ($event.target as HTMLSelectElement).value })">
            <option :value="allClientSourcesFilter">Любой источник</option><option :value="untaggedClientSourceFilter">Без метки</option>
            <option v-for="source in clientSourceOptions" :key="source.value" :value="source.value">{{ source.label }}</option>
          </select>
          <select :value="filters.utmField" class="text-input" aria-label="Поле UTM" @change="updateFilters({ utmField: ($event.target as HTMLSelectElement).value as AdminClientUtmField })">
            <option value="all">Любая UTM-метка</option><option value="source">utm_source</option><option value="medium">utm_medium</option><option value="campaign">utm_campaign</option><option value="content">utm_content</option>
          </select>
          <input :value="filters.utmValue" class="text-input" aria-label="Значение UTM" placeholder="Значение UTM" @input="updateFilters({ utmValue: ($event.target as HTMLInputElement).value.trim() })" />
        </div>
        <button class="secondary-button ui-button admin-filter-reset" type="button" :disabled="!filtersActive" @click="emit('reset-filters')">Сбросить</button>
      </div>
    </details>

    <div class="admin-user-layout"><div class="admin-list">
      <p class="admin-client-sort-note">Последний вход ↓</p>
      <button
        v-for="user in filteredUsers"
        :key="user.id"
        class="admin-list-item ui-card admin-client-list-row"
        :class="[
          `admin-client-list-row-${getAdminClientAccessState(user).tone}`,
          { 'admin-list-item-active': selectedUser?.id === user.id }
        ]"
        type="button"
        @click="emit('select-user', user)"
      >
        <span class="admin-client-status-rail" aria-hidden="true"></span>
        <span class="admin-client-list-avatar"><img v-if="user.photoUrl" :src="user.photoUrl" :alt="userTitle(user)" loading="lazy" decoding="async" /><span v-else>{{ userInitial(user) }}</span></span>
        <span class="admin-list-item-main">
          <span class="admin-client-list-name-line"><strong>{{ userTitle(user) }}</strong></span>
          <small v-if="getAdminClientContact(user)" class="admin-client-list-contact">{{ getAdminClientContact(user) }}</small>
          <span class="admin-client-list-metrics">
            <span>{{ getAdminTariffBadge(user).label }}</span>
            <span class="admin-list-item-progress">Уроки {{ user.completedItems }}/{{ user.totalItems }}</span>
          </span>
        </span>
        <span class="admin-client-last-visit">
          <small>Последний вход</small>
          <strong>{{ formatAdminClientLastLogin(user.lastLoginAt, formatAdminCompactDateTime) }}</strong>
          <em v-if="user.marketingEmailOptOutAt" class="admin-email-opt-out-badge">Email отключён</em>
          <em class="admin-access-badge" :class="`admin-access-badge-${getAdminClientAccessState(user).tone}`">{{ getAdminClientAccessState(user).label }}</em>
        </span>
        <span class="admin-client-list-chevron"><ChevronRight aria-hidden="true" /></span>
      </button>
    </div></div>

    <TaskScreen v-if="selectedUser" class="admin-task-screen admin-client-task-screen" :title="userTitle(selectedUser)" :subtitle="selectedUserMeta(selectedUser)" portal @back="emit('client-card-close')">
      <template v-if="canDeleteSelectedUser" #actions>
        <button
          class="admin-client-delete-button"
          type="button"
          aria-label="Удалить клиента"
          title="Удалить клиента"
          :disabled="deletingClient"
          @click="emit('request-client-delete', selectedUser)"
        >
          <Trash2 aria-hidden="true" />
        </button>
      </template>
      <div class="admin-client-workspace">
        <header class="admin-client-identity admin-detail ui-card"><div class="admin-client-card-head"><span class="admin-client-avatar"><img v-if="selectedUser.photoUrl" :src="selectedUser.photoUrl" :alt="userTitle(selectedUser)" /><span v-else>{{ userInitial(selectedUser) }}</span></span><div class="admin-client-card-title"><div class="admin-client-title-row"><h3 id="admin-client-modal-title">{{ userTitle(selectedUser) }}</h3></div><p>{{ selectedUserMeta(selectedUser) }}</p><span class="admin-client-last-login">Последний вход: {{ formatAdminClientLastLogin(selectedUser.lastLoginAt, formatAdminCompactDateTime) }}</span></div></div><div class="admin-client-status-row"><span v-if="selectedUser.marketingEmailOptOutAt" class="admin-email-opt-out-badge">Email отключён</span><span class="admin-status-pill" :class="`admin-access-badge-${getAdminClientAccessState(selectedUser).tone}`">{{ getAdminClientAccessState(selectedUser).label }}</span><span v-if="selectedUser.membershipExpiresAt" class="admin-status-pill admin-status-pill-yellow">до {{ formatAdminShortDate(selectedUser.membershipExpiresAt) }}</span><span class="admin-status-pill" :class="`admin-status-pill-${getAdminTariffBadge(selectedUser).tone}`">{{ getAdminTariffBadge(selectedUser).label }}</span></div></header>

        <section class="admin-client-kpi-grid" aria-label="Краткая сводка клиента"><article class="admin-client-kpi"><span>Доступ</span><strong>{{ selectedUser.membershipExpiresAt ? `до ${formatAdminShortDate(selectedUser.membershipExpiresAt)}` : formatMembershipStatus(selectedUser.membershipStatus) }}</strong></article><article class="admin-client-kpi"><span>Обучение</span><strong>{{ selectedUser.completedItems }} / {{ selectedUser.totalItems }}</strong></article><article class="admin-client-kpi"><span>Оплаты</span><strong>{{ selectedUserPaidTotal.toLocaleString('ru-RU') }} ₽</strong></article><article class="admin-client-kpi"><span>Последнее действие</span><strong>{{ selectedUser.lastOpenedItemTitle ?? 'Нет активности' }}</strong></article></section>

        <section class="admin-client-action-panel admin-detail ui-card" aria-label="Действия с клиентом"><div class="admin-client-action-head"><strong>Действие</strong><small>{{ getAccessActionSummary(selectedUser) }}</small></div><div class="admin-access-toggle"><button class="admin-access-open" :class="{ 'admin-access-button-pending': pendingClientAccessAction === 'open' }" type="button" :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess" @click="emit('open-access')"><LockOpen aria-hidden="true" />{{ pendingClientAccessAction === 'open' ? 'Открываю...' : 'Открыть доступ' }}</button><button class="admin-access-close" :class="{ 'admin-access-button-pending': pendingClientAccessAction === 'close' }" type="button" :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess" @click="emit('close-access')"><Lock aria-hidden="true" />{{ pendingClientAccessAction === 'close' ? 'Закрываю...' : 'Закрыть доступ' }}</button><button class="admin-access-add" :class="{ 'admin-access-button-pending': pendingClientAccessAction === 'extend7' }" type="button" :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess" @click="emit('extend-access', 7)">{{ pendingClientAccessAction === 'extend7' ? 'Продлеваю...' : '+7 дней' }}</button><button class="admin-access-add" :class="{ 'admin-access-button-pending': pendingClientAccessAction === 'extend30' }" type="button" :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess" @click="emit('extend-access', 30)">{{ pendingClientAccessAction === 'extend30' ? 'Продлеваю...' : '+30 дней' }}</button></div><form class="admin-compact-date-row" @submit.prevent="emit('manual-access')"><label class="admin-date-action"><span>Ручной доступ</span><input :value="accessExpiresAt" type="date" aria-label="Дата окончания доступа" :disabled="!canManageSelectedUserAccess" @input="emit('update:access-expires-at', ($event.target as HTMLInputElement).value)" /></label><button class="admin-client-mute-action" type="button" :disabled="saving || !canManageSelectedUser" @click="emit('quick-mute', selectedUser)"><MessageCircleOff aria-hidden="true" />Запретить общение в чате</button><button class="admin-date-save" :class="{ 'admin-save-success': accessSaveSucceeded, 'admin-access-button-pending': pendingClientAccessAction === 'manual' }" type="submit" :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess">{{ pendingClientAccessAction === 'manual' ? 'Сохраняю...' : accessSaveButtonText }}</button></form></section>

        <div class="admin-client-primary-actions"><button class="primary-button ui-button admin-message-client-button" type="button" :disabled="saving" @click="emit('open-message')"><MessageCircle aria-hidden="true" />Написать</button><AdminIndividualOfferCard :telegram-id="selectedUser.telegramId" :client-name="userTitle(selectedUser)" :disabled="saving || !canManageSelectedUserAccess" /></div>
        <p v-if="!canGrantClientAccess" class="admin-warning-line">Для выдачи доступа нужно право Доступы.</p><p v-else-if="!canManageSelectedUser" class="admin-warning-line">Менять доступ и ограничения администраторов может только главный админ.</p>
        <button class="admin-client-section admin-client-compact-link admin-detail ui-card" type="button" aria-label="Открыть раздел Источник клиента" @click="emit('open-client-section', 'acquisition')"><span class="admin-client-section-icon"><Route aria-hidden="true" /></span><strong>Источник клиента</strong><span>{{ selectedUser.acquisition?.source || selectedUser.acquisition?.medium || selectedUser.acquisition?.campaign || selectedUser.acquisition?.content || 'Без метки' }}</span><ChevronRight class="admin-client-section-chevron" aria-hidden="true" /></button>
        <button class="admin-client-section admin-client-compact-link admin-detail ui-card" type="button" aria-label="Открыть раздел Активность" @click="emit('open-client-section', 'activity')"><span class="admin-client-section-icon"><Activity aria-hidden="true" /></span><strong>Активность</strong><span>последние события</span><ChevronRight class="admin-client-section-chevron" aria-hidden="true" /></button>
        <button class="admin-client-section admin-client-compact-link admin-detail ui-card" type="button" aria-label="Открыть раздел Обучение" @click="emit('open-client-section', 'learning')"><span class="admin-client-section-icon"><BookOpen aria-hidden="true" /></span><strong>Обучение</strong><span>{{ formatLearningEventCount((selectedUserDetail?.learningEngagement.length ?? 0) + (selectedUserDetail?.learningAssessments.length ?? 0)) }}</span><ChevronRight class="admin-client-section-chevron" aria-hidden="true" /></button>
        <button class="admin-client-section admin-client-compact-link admin-detail ui-card" type="button" aria-label="Открыть раздел Подписки" @click="emit('open-client-section', 'subscriptions')"><span class="admin-client-section-icon"><CircleDollarSign aria-hidden="true" /></span><strong>Подписки</strong><span>{{ selectedUserDetail?.subscriptions.length ?? 0 }} записей</span><ChevronRight class="admin-client-section-chevron" aria-hidden="true" /></button>
        <button class="admin-client-section admin-client-compact-link admin-detail ui-card" type="button" aria-label="Открыть раздел Оплаты клиента" @click="emit('open-client-section', 'payments')"><span class="admin-client-section-icon"><CreditCard aria-hidden="true" /></span><strong>Оплаты клиента</strong><span>{{ selectedUserPaymentOrders.length }} записей</span><ChevronRight class="admin-client-section-chevron" aria-hidden="true" /></button>
        <button class="admin-client-section admin-client-compact-link admin-detail ui-card" type="button" aria-label="Открыть раздел Рефералы" @click="emit('open-client-section', 'referrals')"><span class="admin-client-section-icon"><UserRoundPlus aria-hidden="true" /></span><strong>Рефералы</strong><span>{{ selectedUserDetail?.referrals.invited.length ?? 0 }} приглашённых</span><ChevronRight class="admin-client-section-chevron" aria-hidden="true" /></button>
        <button class="admin-client-section admin-client-compact-link admin-detail ui-card" type="button" aria-label="Открыть раздел Ограничения и удаления" @click="emit('open-client-section', 'moderation')"><span class="admin-client-section-icon"><ShieldAlert aria-hidden="true" /></span><strong>Ограничения и удаления</strong><span>{{ selectedUserDetail?.moderationEvents.length ?? 0 }} записей</span><ChevronRight class="admin-client-section-chevron" aria-hidden="true" /></button>
        <button class="admin-client-section admin-client-compact-link admin-detail ui-card" type="button" aria-label="Открыть раздел Устройства" @click="emit('open-client-section', 'devices')"><span class="admin-client-section-icon"><Smartphone aria-hidden="true" /></span><strong>Устройства</strong><span>{{ selectedUserDevices.length }} сохранено</span><ChevronRight class="admin-client-section-chevron" aria-hidden="true" /></button>
        <button v-if="canViewLoginIps" class="admin-client-section admin-client-compact-link admin-detail ui-card" type="button" aria-label="Открыть раздел IP входов" @click="emit('open-client-section', 'login-ips')"><span class="admin-client-section-icon"><Network aria-hidden="true" /></span><strong>IP входов</strong><span>{{ selectedUserLoginIps.length }} адресов</span><ChevronRight class="admin-client-section-chevron" aria-hidden="true" /></button>
      </div>
    </TaskScreen>

    <Teleport to="body"><div v-if="clientMessage.open && selectedUser" class="admin-client-message-layer" @click.self="emit('close-message')"><form class="admin-client-message-modal" role="dialog" aria-modal="true" aria-labelledby="admin-client-message-title" @submit.prevent="emit('submit-message')"><header class="admin-client-message-head"><div><h3 id="admin-client-message-title">Сообщение клиенту</h3><p>{{ userTitle(selectedUser) }} · ID {{ selectedUser.telegramId }}</p></div><button class="icon-button ui-icon-button" type="button" aria-label="Закрыть сообщение клиенту" @click="emit('close-message')"><X class="h-4 w-4" aria-hidden="true" /></button></header><div class="admin-client-message-body"><div class="admin-client-message-row"><label class="support-file-icon-button ui-icon-button admin-client-file-button" title="Добавить файл" aria-label="Добавить файл"><Paperclip class="h-4 w-4" aria-hidden="true" /><input type="file" accept="image/*,video/*" multiple @change="updateClientMessageFiles" /></label><textarea ref="clientMessageInput" :value="clientMessage.text" rows="3" placeholder="Напишите сообщение клиенту" @input="emit('update:client-message-text', ($event.target as HTMLTextAreaElement).value)" /></div><div v-if="clientMessage.files.length" class="admin-client-file-list"><span v-for="file in clientMessage.files" :key="file.name">{{ file.name }}</span></div></div><button class="primary-button ui-button" type="submit" :disabled="clientMessage.sending">{{ clientMessage.sending ? 'Отправляем...' : 'Отправить' }}</button></form></div></Teleport>
  </section>
</template>

<style scoped>
.admin-client-delete-button {
  display: grid;
  flex: 0 0 44px;
  width: 44px !important;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  place-items: center;
  border: 1px solid #ff6b82;
  border-radius: 13px;
  background: #ff2d55;
  color: #fff;
  box-shadow: 0 8px 20px rgb(255 45 85 / 30%);
  cursor: pointer;
  transition: transform 160ms ease, filter 160ms ease, box-shadow 160ms ease;
}

.admin-client-delete-button:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: 0 10px 24px rgb(255 45 85 / 40%);
}

.admin-client-delete-button:active:not(:disabled) {
  transform: scale(0.95);
}

.admin-client-delete-button:focus-visible {
  outline: 3px solid rgb(255 45 85 / 34%);
  outline-offset: 3px;
}

.admin-client-delete-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.admin-client-delete-button svg {
  width: 21px;
  height: 21px;
  stroke-width: 2.25;
}

.admin-client-task-screen :deep(.task-screen-actions),
.admin-client-task-screen :deep(.ui-page-header__actions) {
  width: auto;
  min-width: 44px;
}

@media (max-width: 480px) {
  .admin-client-task-screen :deep(.task-screen-actions > *),
  .admin-client-task-screen :deep(.ui-page-header__actions > *) {
    width: 44px !important;
  }
}
</style>
