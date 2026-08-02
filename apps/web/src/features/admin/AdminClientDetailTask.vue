<script setup lang="ts">
import type { AdminLoginIp, AdminStatsUser, AdminUserDetailResponse, PaymentOrderLog } from "@club/shared";
import { Copy } from "lucide-vue-next";
import { computed } from "vue";
import TaskScreen from "@/features/app/TaskScreen.vue";
import { formatMembershipStatus } from "@/features/app/i18n";
import { formatAdminPaymentMoney } from "./adminPaymentMoney";
import { getAdminSubscriptionActorLabel, getAdminSubscriptionSourceLabel, getAdminSubscriptionTitle } from "./adminClientCard";
import type { AdminClientDetailSection } from "./adminClientDetailSection";
import AdminClientAcquisition from "./AdminClientAcquisition.vue";

type Section = Exclude<AdminClientDetailSection, "learning">;
type ClientDevice = AdminUserDetailResponse["devices"][number];
const props = defineProps<{
  section: Section; clientName: string; user: AdminStatsUser; detail: AdminUserDetailResponse | null;
  paymentOrders: readonly PaymentOrderLog[]; lastPayment: PaymentOrderLog | null; devices: readonly ClientDevice[]; deviceText: string;
  loginIps: readonly AdminLoginIp[]; loginIpsLoading: boolean; loginIpsError: boolean; canManage: boolean; saving: boolean;
  paymentOrderDate: (order: PaymentOrderLog) => string; paymentOrderStatusLabel: (status: PaymentOrderLog["status"]) => string;
  formatDate: (value: string) => string; formatCompactDate: (value: string) => string;
  referralUserTitle: (user: { telegramId: string; firstName: string | null; username: string | null }) => string;
  referralRewardStatusLabel: (status: "none" | "available" | "activated") => string;
  getDeviceTitle: (device: ClientDevice["diagnostics"]) => string; getDeviceScreen: (device: ClientDevice["diagnostics"]) => string;
  isNewLoginIp: (entry: AdminLoginIp) => boolean;
}>();
const emit = defineEmits<{ back: []; "revoke-mute": [id: string]; "copy-device-info": [text: string] }>();
const titles: Record<Section, string> = { acquisition: "Источник клиента", activity: "Активность", subscriptions: "Подписки", payments: "Оплаты клиента", referrals: "Рефералы", moderation: "Ограничения и удаления", devices: "Устройства", "login-ips": "IP входов" };
const title = computed(() => titles[props.section]);
</script>

<template>
  <TaskScreen class="admin-task-screen admin-client-detail-task" :title="title" :subtitle="clientName" portal @back="emit('back')">
    <section class="admin-client-detail-page admin-client-detail-surface">
      <AdminClientAcquisition v-if="section === 'acquisition'" :telegram-id="user.telegramId" />

      <div v-else-if="section === 'activity'" class="admin-client-timeline">
        <article v-if="user.lastOpenedItemTitle"><span class="admin-client-dot admin-client-dot-green" /><strong>Открыл урок &quot;{{ user.lastOpenedItemTitle }}&quot;</strong><time>{{ user.lastOpenedAt ? formatCompactDate(user.lastOpenedAt) : 'время не сохранено' }}</time></article>
        <article v-if="lastPayment"><span class="admin-client-dot admin-client-dot-blue" /><strong>Оплата: {{ formatAdminPaymentMoney(lastPayment) }}</strong><time>{{ paymentOrderDate(lastPayment) }}</time></article>
        <p v-if="!user.lastOpenedItemTitle && !lastPayment" class="admin-empty">Последних событий пока нет.</p>
      </div>

      <div v-else-if="section === 'subscriptions'" class="admin-accordion-body">
        <p v-if="!detail?.subscriptions.length" class="admin-empty">Истории подписок пока нет.</p>
        <article v-for="subscription in detail?.subscriptions ?? []" :key="subscription.id" class="admin-payment-card admin-payment-card-compact"><div class="admin-payment-main"><div><strong>{{ getAdminSubscriptionTitle(subscription) }}</strong><small>{{ getAdminSubscriptionSourceLabel(subscription) }}</small></div><em :class="`membership-history-status-${subscription.status}`">{{ formatMembershipStatus(subscription.status) }}</em></div><div class="admin-payment-meta"><span>{{ new Date(subscription.createdAt).toLocaleDateString('ru-RU') }}</span><span v-if="subscription.expiresAt">до {{ new Date(subscription.expiresAt).toLocaleDateString('ru-RU') }}</span><span v-if="getAdminSubscriptionActorLabel(subscription)">{{ getAdminSubscriptionActorLabel(subscription) }}</span></div></article>
      </div>

      <div v-else-if="section === 'payments'" class="admin-accordion-body">
        <p v-if="!paymentOrders.length" class="admin-empty">Оплат пока нет.</p>
        <article v-for="order in paymentOrders" :key="order.id" class="admin-payment-card admin-payment-card-compact"><div class="admin-payment-main"><div><strong>{{ order.productTitle }}</strong><small>{{ paymentOrderDate(order) }} · {{ formatAdminPaymentMoney(order) }}</small></div><em :class="`payment-status-${order.status}`">{{ paymentOrderStatusLabel(order.status) }}</em></div><div class="admin-payment-ids"><span>order: {{ order.providerOrderId }}</span><span>Webhook: {{ order.webhook ? (order.webhook.isValid ? 'валидный' : 'ошибка подписи') : 'не пришёл' }}</span></div></article>
      </div>

      <div v-else-if="section === 'referrals'" class="admin-accordion-body">
        <article v-if="detail?.referrals.invitedBy" class="admin-payment-card admin-payment-card-compact"><div class="admin-payment-main"><div><strong>Пришёл по ссылке</strong><small>{{ referralUserTitle(detail.referrals.invitedBy.inviterUser) }}</small></div><em>{{ formatDate(detail.referrals.invitedBy.invitedAt) }}</em></div><div class="admin-payment-meta"><span>ID {{ detail.referrals.invitedBy.inviterUser.telegramId }}</span><span v-if="detail.referrals.invitedBy.firstPaidAt">первая оплата {{ formatDate(detail.referrals.invitedBy.firstPaidAt) }}</span><span v-else>первой оплаты ещё нет</span></div></article>
        <p v-if="!detail?.referrals.invitedBy && !detail?.referrals.invited.length" class="admin-empty">Реферальных связей пока нет.</p>
        <article v-for="referral in detail?.referrals.invited ?? []" :key="referral.id" class="admin-payment-card admin-payment-card-compact"><div class="admin-payment-main"><div><strong>{{ referralUserTitle(referral.invitedUser) }}</strong><small>приглашён {{ formatDate(referral.invitedAt) }}</small></div><em>{{ referralRewardStatusLabel(referral.rewardStatus) }}</em></div><div class="admin-payment-meta"><span>ID {{ referral.invitedUser.telegramId }}</span><span>{{ referral.rewardDays }} дн. вознаграждения</span><span v-if="referral.firstPaidAt">первая оплата {{ formatDate(referral.firstPaidAt) }}</span><span v-else>оплаты ещё нет</span></div></article>
      </div>

      <div v-else-if="section === 'moderation'" class="admin-accordion-body">
        <p v-if="!detail?.moderationEvents.length" class="admin-empty">Ограничений и удалений пока нет.</p>
        <article v-for="event in detail?.moderationEvents ?? []" :key="`${event.kind}-${event.id}`" class="admin-log-item"><time>{{ new Date(event.createdAt).toLocaleString('ru-RU') }}</time><div><strong>{{ event.kind === 'mute' ? 'Мут' : event.kind === 'chat_message' ? 'Сообщение' : 'Комментарий' }} · {{ event.status }}</strong><span v-if="event.sourceTitle">{{ event.sourceTitle }}</span><p v-if="event.body">{{ event.body }}</p><small v-if="event.resolvedAt">обработано {{ new Date(event.resolvedAt).toLocaleString('ru-RU') }}</small><button v-if="event.kind === 'mute' && !event.resolvedAt && canManage" class="secondary-button ui-button mt-2" type="button" :disabled="saving" @click="emit('revoke-mute', event.id)">Снять мут</button></div></article>
      </div>

      <div v-else-if="section === 'devices'">
        <div class="admin-client-section-head"><span>{{ devices.length }} сохранено</span><button class="admin-client-copy-button" type="button" :disabled="!deviceText" @click="emit('copy-device-info', deviceText)"><Copy aria-hidden="true" />Скопировать</button></div>
        <p v-if="!devices.length" class="admin-empty">История появится после следующего входа клиента.</p>
        <div v-else class="admin-client-device-list"><article v-for="entry in devices" :key="entry.id" class="admin-client-device-card"><div class="admin-client-device-title"><strong>{{ getDeviceTitle(entry.diagnostics) }}</strong><span>{{ getDeviceScreen(entry.diagnostics) }}</span></div><div class="admin-client-device-dates"><span>Впервые: {{ formatCompactDate(entry.firstSeenAt) }}</span><span>Последний вход: {{ formatCompactDate(entry.lastSeenAt) }}</span></div><small>{{ entry.diagnostics.userAgent }}</small></article></div>
      </div>

      <div v-else>
        <p v-if="loginIpsLoading" class="admin-empty">Загружаю историю IP…</p><p v-else-if="loginIpsError" class="admin-warning-line">Не удалось загрузить историю IP.</p><p v-else-if="!loginIps.length" class="admin-empty">История IP появится после следующего входа клиента.</p>
        <div v-else class="admin-login-ip-list"><article v-for="entry in loginIps" :key="entry.id" class="admin-login-ip-row"><div class="admin-login-ip-main"><strong class="admin-login-ip-address">{{ entry.ipAddress }}</strong><span v-if="isNewLoginIp(entry)" class="admin-login-ip-new">Новый IP</span></div><div class="admin-login-ip-meta"><span>Впервые: {{ formatCompactDate(entry.firstSeenAt) }}</span><span>Последний вход: {{ formatCompactDate(entry.lastSeenAt) }}</span><span>Входов: {{ entry.loginCount }}</span></div></article></div>
      </div>
    </section>
  </TaskScreen>
</template>

<style scoped>
.admin-client-detail-task :deep(.task-screen-body) { padding-bottom: 24px; }
.admin-client-detail-page { display: grid; min-width: 0; padding: 0; }
.admin-client-detail-page :is(.admin-accordion-body, .admin-client-device-list, .admin-login-ip-list) { gap: 8px; }
.admin-client-detail-page :is(.admin-payment-card-compact, .admin-client-device-card, .admin-login-ip-row, .admin-log-item, .admin-client-timeline article) { border-radius: 12px; }
.admin-client-detail-page :is(.admin-payment-card-compact, .admin-client-device-card, .admin-login-ip-row) { padding: 10px 12px; }
.admin-client-section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; color: var(--text-muted); font-size: 12px; }
.admin-client-copy-button { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; padding: 0 12px; border: 1px solid var(--border); border-radius: 10px; color: var(--accent); background: var(--panel-soft); }
.admin-client-copy-button svg { width: 16px; }
</style>
