<script setup lang="ts">
import type {
  AdminMailing,
  AdminMailingAnalytics,
  AdminMailingAnalyticsRecipient,
  AdminMailingPreviewResponse,
  EmailDeliveryQuota,
  MailingChannel,
  MailingFilters
} from "@club/shared";
import { ChevronRight, Paperclip, RotateCcw, X } from "lucide-vue-next";
import { nextTick, onMounted, ref, watch } from "vue";
import TaskScreen from "@/features/app/TaskScreen.vue";
import type { MailingEditorMode } from "./mailingEditorMode";

type MailingRecipientStatus = "all" | "delivered" | "opened" | "clicked" | "failed" | "skipped" | "pending";
type MailingRecipientChannel = "all" | "push" | "email";

const props = defineProps<{
  mailingEmailQuota: Readonly<EmailDeliveryQuota>;
  mailings: readonly AdminMailing[];
  showMailingHistory: boolean;
  showMailingComposer: boolean;
  selectedMailing: Readonly<AdminMailing> | null;
  mailingTitle: string;
  mailingBodyHtml: string;
  mailingEditorMode: MailingEditorMode;
  mailingChannel: MailingChannel;
  mailingFilters: Readonly<MailingFilters>;
  mailingScheduledAt: string;
  mailingAttachmentLabel: string;
  mailingPreview: Readonly<AdminMailingPreviewResponse> | null;
  mailingPreviewLoading: boolean;
  mailingPreparedMessage: Readonly<{ safeHtml: string; plainText: string }>;
  mailingCanSubmit: boolean;
  saving: boolean;
  mailingAnalytics: Readonly<AdminMailingAnalytics> | null;
  mailingAnalyticsLoading: boolean;
  mailingAnalyticsError: boolean;
  mailingAnalyticsRecipients: readonly AdminMailingAnalyticsRecipient[];
  mailingAnalyticsRecipientsLoading: boolean;
  mailingAnalyticsRecipientStatus: MailingRecipientStatus;
  mailingAnalyticsRecipientChannel: MailingRecipientChannel;
  mailingAnalyticsNextCursor: string | null;
  selectedMailingBodyHtml: string;
  mailingChannelOptions: readonly { value: MailingChannel; label: string; hint: string }[];
  mailingAccessStatusOptions: readonly { value: MailingFilters["accessStatus"]; label: string }[];
  mailingAccessTypeOptions: readonly { value: MailingFilters["accessType"]; label: string }[];
  formatDateTime: (value: string | null) => string;
  mailingAuthorLabel: (mailing: AdminMailing) => string;
  mailingAttachmentText: (mailing: AdminMailing) => string;
  mailingFilterSummary: (mailing: AdminMailing) => string;
  getMailingChannelLabel: (channel: MailingChannel) => string;
  getMailingStatusLabel: (status: AdminMailing["status"]) => string;
  canRetryFailedMailing: (mailing: AdminMailing) => boolean;
  formatMailingAnalyticsRate: (value: number) => string;
  formatMailingAnalyticsBucket: (value: string) => string;
  mailingAnalyticsBarWidth: (value: number) => string;
  mailingAnalyticsStatusLabel: (status: AdminMailingAnalyticsRecipient["analyticsStatus"]) => string;
}>();

const emit = defineEmits<{
  "open-composer": [];
  "open-history": [];
  "open-detail": [mailing: AdminMailing];
  back: [task: "history" | "composer" | "detail"];
  "update:mailing-title": [value: string];
  "update:mailing-body-html": [value: string];
  "update:mailing-editor-mode": [value: MailingEditorMode];
  "update:mailing-channel": [value: MailingChannel];
  "update:mailing-filters": [value: MailingFilters];
  "update:mailing-scheduled-at": [value: string];
  "update:mailing-attachment": [value: File | null];
  "editor-paste": [event: ClipboardEvent];
  "editor-command": [command: string];
  "editor-link": [];
  reset: [];
  "refresh-preview": [];
  submit: [];
  "test-draft": [];
  reuse: [mailing: AdminMailing];
  retry: [mailing: AdminMailing];
  test: [mailing: AdminMailing];
  pause: [mailing: AdminMailing];
  resume: [mailing: AdminMailing];
  stop: [mailing: AdminMailing];
  "refresh-analytics": [];
  "update:mailing-analytics-recipient-status": [value: MailingRecipientStatus];
  "update:mailing-analytics-recipient-channel": [value: MailingRecipientChannel];
  "refresh-analytics-recipients": [];
  "load-more-analytics-recipients": [];
}>();

const mailingEditorRef = ref<HTMLElement | null>(null);

function updateMailingFilters(patch: Partial<MailingFilters>) {
  emit("update:mailing-filters", { ...props.mailingFilters, ...patch });
}

function updateMailingAttachment(event: Event) {
  emit("update:mailing-attachment", (event.target as HTMLInputElement).files?.[0] ?? null);
}

function updateMailingEditor() {
  emit("update:mailing-body-html", mailingEditorRef.value?.innerHTML ?? "");
}

function syncMailingEditorFromProps() {
  if (mailingEditorRef.value && mailingEditorRef.value.innerHTML !== props.mailingBodyHtml) {
    mailingEditorRef.value.innerHTML = props.mailingBodyHtml;
  }
}

onMounted(syncMailingEditorFromProps);
watch(
  () => [props.showMailingComposer, props.mailingEditorMode, props.mailingBodyHtml],
  () => void nextTick(syncMailingEditorFromProps),
  { flush: "post" }
);

defineExpose({
  getMailingEditor: () => mailingEditorRef.value
});
</script>

<template>
  <section class="admin-panel ui-page-section admin-mailings-panel">
    <div class="admin-panel-head ui-page-header"><div><h3>Рассылки</h3><p>Push и email для выбранной аудитории.</p></div><button class="primary-button ui-button admin-add-button" type="button" @click="emit('open-composer')">Новая рассылка</button></div>

    <section class="admin-crm-block ui-card admin-email-quota" aria-label="Суточный лимит email">
      <div class="admin-email-quota-head"><div><span>Email за 24 часа</span><strong>{{ mailingEmailQuota.used }} / {{ mailingEmailQuota.limit }}</strong></div><span>{{ mailingEmailQuota.remaining }} доступно</span></div>
      <div class="admin-email-quota-track" aria-hidden="true"><span :style="{ width: `${Math.min(100, (mailingEmailQuota.used / mailingEmailQuota.limit) * 100)}%` }"></span></div>
      <p>Коды авторизации, тестовые письма и рассылки учитываются вместе. Скорость — до {{ mailingEmailQuota.messagesPerSecond }} писем/с.</p>
      <small v-if="mailingEmailQuota.resetsAt">Ближайшее место освободится {{ formatDateTime(mailingEmailQuota.resetsAt) }}</small>
    </section>

    <button class="admin-mailing-history-entry ui-button" type="button" @click="emit('open-history')"><span><strong>История рассылок</strong><small>{{ mailings.length ? `${mailings.length} рассылок` : "Рассылок пока нет" }}</small></span><ChevronRight class="h-5 w-5" aria-hidden="true" /></button>

    <TaskScreen v-if="showMailingHistory" class="admin-task-screen admin-mailing-history-task-screen" title="История рассылок" :subtitle="mailings.length ? `${mailings.length} рассылок` : 'Рассылок пока нет'" portal @back="emit('back', 'history')">
      <section class="admin-mailing-list admin-mailing-history-screen">
        <article v-for="mailing in mailings" :key="mailing.id" class="admin-mailing-card" role="button" tabindex="0" @click="emit('open-detail', mailing)" @keydown.enter.prevent="emit('open-detail', mailing)">
          <header><div><strong>{{ mailing.title }}</strong><small>{{ formatDateTime(mailing.createdAt) }} · {{ mailingAuthorLabel(mailing) }}</small><small>{{ getMailingChannelLabel(mailing.channel) }} · {{ getMailingStatusLabel(mailing.status) }}</small></div><span :class="`admin-mailing-status admin-mailing-status-${mailing.status}`">{{ getMailingStatusLabel(mailing.status) }}</span></header>
          <p>{{ mailing.body }}</p>
          <a v-if="mailing.attachment" class="admin-mailing-attachment" :href="mailing.attachment.url ?? '#'" target="_blank" rel="noreferrer" @click.stop><Paperclip class="h-3.5 w-3.5" aria-hidden="true" />{{ mailingAttachmentText(mailing) }}</a>
          <div class="admin-mailing-progress"><span>{{ mailing.sentCount }} / {{ mailing.deliveryCount }} доставок</span><span>{{ mailing.estimatedLabel }}</span></div>
          <div class="admin-mailing-delivery-stats" aria-label="Состояние доставки"><span>Доставлено <strong>{{ mailing.sentCount }}</strong></span><span>Ожидает <strong>{{ mailing.pendingCount }}</strong></span><span>В обработке <strong>{{ mailing.processingCount }}</strong></span><span>Пропущено <strong>{{ mailing.skippedCount }}</strong></span><span :class="{ 'admin-mailing-delivery-error': mailing.failedCount > 0 }">Ошибки <strong>{{ mailing.failedCount }}</strong></span></div>
          <div class="admin-mailing-actions">
            <button class="secondary-button ui-button" type="button" :disabled="saving" @click.stop="emit('reuse', mailing)">Использовать снова</button>
            <button v-if="canRetryFailedMailing(mailing)" class="secondary-button ui-button" type="button" :aria-label="`Повторить ошибки: ${mailing.failedCount}`" :disabled="saving" @click.stop="emit('retry', mailing)">Повторить ошибки</button>
            <button class="secondary-button ui-button" type="button" :disabled="saving" @click.stop="emit('test', mailing)">Тест себе</button>
            <button v-if="mailing.status === 'running'" class="secondary-button ui-button" type="button" :disabled="saving" @click.stop="emit('pause', mailing)">Пауза</button>
            <button v-if="mailing.status === 'paused'" class="secondary-button ui-button" type="button" :disabled="saving" @click.stop="emit('resume', mailing)">Продолжить</button>
            <button v-if="mailing.status === 'running' || mailing.status === 'paused' || mailing.status === 'scheduled'" class="secondary-button ui-button admin-mailing-stop" type="button" :disabled="saving" @click.stop="emit('stop', mailing)">Остановить</button>
          </div>
        </article>
        <p v-if="!mailings.length" class="admin-empty">Рассылок пока нет.</p>
      </section>
    </TaskScreen>

    <TaskScreen v-if="showMailingComposer" class="admin-task-screen admin-mailing-task-screen" title="Новая рассылка" subtitle="Текст, вложение, фильтры и планирование." portal @back="emit('back', 'composer')">
      <template #actions><button class="secondary-button ui-icon-button admin-mailing-reset-button" type="button" aria-label="Сбросить форму" title="Сбросить форму" @click="emit('reset')"><RotateCcw class="h-5 w-5" aria-hidden="true" /></button></template>
      <section class="admin-detail ui-card admin-client-modal admin-mailing-composer-modal">
        <form id="admin-mailing-form" class="admin-crm-block ui-card admin-mailing-builder" @submit.prevent="emit('submit')">
          <div class="admin-panel-head ui-page-header admin-mailing-builder-head"><div><p class="admin-overline">Рассылки</p><h4 id="admin-mailing-composer-title">Новая рассылка</h4><p>Текст, HTML-форматирование, вложение, фильтры и планирование.</p></div><div class="admin-mailing-modal-actions"><button class="secondary-button ui-button" type="button" @click="emit('reset')">Сбросить</button><button class="icon-button ui-icon-button" type="button" aria-label="Закрыть рассылку" @click="emit('back', 'composer')"><X class="h-4 w-4" aria-hidden="true" /></button></div></div>
          <div class="admin-mailing-builder-body">
            <label class="admin-field"><span>Заголовок</span><input :value="mailingTitle" class="text-input" placeholder="Например: Новая практика в клубе" @input="emit('update:mailing-title', ($event.target as HTMLInputElement).value.trim())" /></label>
            <div class="admin-editor admin-mailing-editor">
              <div class="admin-mailing-editor-modes" role="group" aria-label="Режим редактора"><button class="secondary-button ui-button admin-mailing-editor-mode" :class="{ 'admin-mailing-editor-mode-active': mailingEditorMode === 'visual' }" type="button" :aria-pressed="mailingEditorMode === 'visual'" @click="emit('update:mailing-editor-mode', 'visual')">Визуально</button><button class="secondary-button ui-button admin-mailing-editor-mode" :class="{ 'admin-mailing-editor-mode-active': mailingEditorMode === 'html' }" type="button" :aria-pressed="mailingEditorMode === 'html'" @click="emit('update:mailing-editor-mode', 'html')">HTML-код</button></div>
              <template v-if="mailingEditorMode === 'visual'"><div class="admin-editor-toolbar"><button class="icon-button ui-icon-button" type="button" @click="emit('editor-command', 'bold')">B</button><button class="icon-button ui-icon-button" type="button" @click="emit('editor-command', 'italic')">I</button><button class="icon-button ui-icon-button" type="button" @click="emit('editor-command', 'underline')">U</button><button class="secondary-button ui-button" type="button" @click="emit('editor-command', 'insertUnorderedList')">Список</button><button class="secondary-button ui-button" type="button" @click="emit('editor-link')">Ссылка</button></div><div ref="mailingEditorRef" class="admin-rich-editor" contenteditable="true" role="textbox" aria-label="Текст рассылки" data-placeholder="Текст рассылки" @input="updateMailingEditor" @paste="emit('editor-paste', $event)"></div></template>
              <textarea v-else :value="mailingBodyHtml" class="text-input admin-mailing-html-source" aria-label="HTML-код рассылки" placeholder="<b>Важный текст</b>" spellcheck="false" @input="emit('update:mailing-body-html', ($event.target as HTMLTextAreaElement).value)"></textarea>
              <section v-if="mailingPreparedMessage.safeHtml" class="admin-mailing-message-preview" aria-label="Предпросмотр сообщения"><span>Предпросмотр сообщения</span><div v-html="mailingPreparedMessage.safeHtml"></div></section>
            </div>
            <div class="admin-mailing-channels" aria-label="Куда отправляем рассылку"><button v-for="channel in mailingChannelOptions" :key="channel.value" class="admin-mailing-channel" :class="{ 'admin-mailing-channel-active': mailingChannel === channel.value }" type="button" @click="emit('update:mailing-channel', channel.value)"><strong>{{ channel.label }}</strong><span>{{ channel.hint }}</span></button></div>
            <div class="admin-mailing-filter-grid"><label class="admin-field"><span>Статус доступа</span><select :value="mailingFilters.accessStatus" class="text-input" @change="updateMailingFilters({ accessStatus: ($event.target as HTMLSelectElement).value as MailingFilters['accessStatus'] })"><option v-for="option in mailingAccessStatusOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><label class="admin-field"><span>Тип доступа</span><select :value="mailingFilters.accessType" class="text-input" @change="updateMailingFilters({ accessType: ($event.target as HTMLSelectElement).value as MailingFilters['accessType'] })"><option v-for="option in mailingAccessTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label></div>
            <div class="admin-mailing-checks"><label class="admin-check-row"><input :checked="mailingFilters.excludeAdmins" type="checkbox" @change="updateMailingFilters({ excludeAdmins: ($event.target as HTMLInputElement).checked })" /><span>Исключить админов</span></label><label class="admin-check-row"><input :checked="mailingFilters.excludeRestricted" type="checkbox" @change="updateMailingFilters({ excludeRestricted: ($event.target as HTMLInputElement).checked })" /><span>Исключить ограничения</span></label></div>
            <div class="admin-mailing-row"><label class="admin-mailing-file"><Paperclip class="h-4 w-4" aria-hidden="true" /><span>{{ mailingAttachmentLabel }}</span><input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" @change="updateMailingAttachment" /></label><label class="admin-field admin-mailing-date"><span>Запланировать</span><input :value="mailingScheduledAt" class="text-input" type="datetime-local" @input="emit('update:mailing-scheduled-at', ($event.target as HTMLInputElement).value)" /></label></div>
            <section class="admin-crm-block ui-card admin-mailing-preview admin-mailing-composer-preview"><div class="admin-panel-head ui-page-header admin-mailing-list-head"><div><h4>Расчёт</h4><p>Сколько получателей попадёт в выбранные каналы.</p></div><button class="secondary-button ui-button" type="button" :disabled="mailingPreviewLoading" @click="emit('refresh-preview')">Пересчитать</button></div><div class="admin-mailing-preview-grid"><article><span>Получателей</span><strong>{{ mailingPreview?.targetCount ?? "—" }}</strong></article><article><span>Всего доставок</span><strong>{{ mailingPreview?.deliveryCount ?? "—" }}</strong></article><article><span>Push</span><strong>{{ mailingPreview?.pushCount ?? "—" }}</strong></article><article><span>PWA-подписок</span><strong>{{ mailingPreview?.pushSubscriptionCount ?? "—" }}</strong></article><article><span>Email</span><strong>{{ mailingPreview?.emailCount ?? "—" }}</strong></article><article><span>Email за 24 часа</span><strong>{{ mailingPreview?.emailQuota.used ?? "—" }} / {{ mailingPreview?.emailQuota.limit ?? "—" }}</strong></article><article><span>Доступно email</span><strong>{{ mailingPreview?.emailQuota.remaining ?? "—" }}</strong></article><article><span>Email без адреса</span><strong>{{ mailingPreview?.excludedMissingEmail ?? "—" }}</strong></article><article><span>Отписались от email</span><strong>{{ mailingPreview?.excludedEmailOptOut ?? "—" }}</strong></article><article><span>Не прошли фильтры</span><strong>{{ mailingPreview?.excludedByFilters ?? "—" }}</strong></article><article class="admin-mailing-preview-time"><span>Примерное время</span><strong>{{ mailingPreviewLoading ? "считаем..." : mailingPreview?.estimatedLabel ?? "—" }}</strong></article></div><p v-if="mailingPreview?.emailDelayedByDailyLimit" class="admin-warning-line">Часть email будет автоматически отправлена после освобождения суточного лимита.</p></section>
          </div>
        </form>
      </section>
      <template #footer><div class="admin-mailing-submit-row admin-mailing-builder-footer"><button class="secondary-button ui-button" type="button" :disabled="saving || !mailingCanSubmit" @click="emit('test-draft')">Тест себе</button><button class="primary-button ui-button" form="admin-mailing-form" type="submit" :disabled="saving || !mailingCanSubmit">{{ mailingScheduledAt ? "Запланировать рассылку" : "Запустить рассылку" }}</button></div></template>
    </TaskScreen>

    <TaskScreen v-if="selectedMailing" class="admin-task-screen" :title="selectedMailing.title" :subtitle="`${formatDateTime(selectedMailing.createdAt)} · ${mailingAuthorLabel(selectedMailing)}`" portal @back="emit('back', 'detail')">
      <section class="admin-detail ui-card admin-client-modal admin-mailing-detail-modal">
        <header class="admin-client-modal-head"><div><p class="admin-overline">Рассылка</p><h3 id="admin-mailing-detail-title">{{ selectedMailing.title }}</h3><p>{{ formatDateTime(selectedMailing.createdAt) }} · {{ mailingAuthorLabel(selectedMailing) }}</p></div><button class="icon-button ui-icon-button" type="button" aria-label="Закрыть рассылку" @click="emit('back', 'detail')"><X class="h-4 w-4" aria-hidden="true" /></button></header>
        <div class="admin-mailing-detail-grid"><article><span>Канал</span><strong>{{ getMailingChannelLabel(selectedMailing.channel) }}</strong></article><article><span>Статус</span><strong>{{ getMailingStatusLabel(selectedMailing.status) }}</strong></article><article><span>Отправлено</span><strong>{{ selectedMailing.sentCount }} / {{ selectedMailing.deliveryCount }}</strong></article><article><span>Примерное время</span><strong>{{ selectedMailing.estimatedLabel }}</strong></article></div>
        <div class="admin-mailing-delivery-stats" aria-label="Состояние доставки"><span>Доставлено <strong>{{ selectedMailing.sentCount }}</strong></span><span>Ожидает <strong>{{ selectedMailing.pendingCount }}</strong></span><span>В обработке <strong>{{ selectedMailing.processingCount }}</strong></span><span>Пропущено <strong>{{ selectedMailing.skippedCount }}</strong></span><span :class="{ 'admin-mailing-delivery-error': selectedMailing.failedCount > 0 }">Ошибки <strong>{{ selectedMailing.failedCount }}</strong></span></div>
        <section class="admin-mailing-analytics" aria-labelledby="admin-mailing-analytics-title">
          <header class="admin-mailing-analytics-head"><div><span class="admin-overline">Аналитика</span><h4 id="admin-mailing-analytics-title">Вовлечённость получателей</h4></div><button class="secondary-button ui-button" type="button" :disabled="mailingAnalyticsLoading" @click="emit('refresh-analytics')">Обновить</button></header>
          <p v-if="mailingAnalyticsLoading" class="admin-empty">Загружаю аналитику…</p><div v-else-if="mailingAnalyticsError" class="admin-mailing-analytics-notice admin-mailing-analytics-notice-error"><p>Не удалось загрузить аналитику.</p><button class="secondary-button ui-button" type="button" @click="emit('refresh-analytics')">Повторить</button></div><p v-else-if="mailingAnalytics && !mailingAnalytics.trackingEnabledAt" class="admin-mailing-analytics-notice">Отслеживание вовлечённости появилось в версии 5.26. Для более ранних рассылок данных нет.</p>
          <template v-else-if="mailingAnalytics">
            <div class="admin-mailing-analytics-kpis"><article><span>Доставлено</span><strong>{{ mailingAnalytics.summary.sent }}</strong></article><article><span>Открыто</span><strong>{{ mailingAnalytics.summary.opened }}</strong></article><article><span>Переходы</span><strong>{{ mailingAnalytics.summary.clicked }}</strong></article><article><span>Open rate</span><strong>{{ formatMailingAnalyticsRate(mailingAnalytics.summary.openRate) }}</strong></article><article><span>CTR</span><strong>{{ formatMailingAnalyticsRate(mailingAnalytics.summary.clickRate) }}</strong></article><article><span>CTOR</span><strong>{{ formatMailingAnalyticsRate(mailingAnalytics.summary.clickToOpenRate) }}</strong></article></div>
            <p v-if="mailingAnalytics.emailOpenEstimate" class="admin-mailing-analytics-estimate">Открытия Email приблизительные: почтовые клиенты могут блокировать или автоматически загружать пиксель.</p>
            <div class="admin-mailing-analytics-channels" aria-label="Аналитика по каналам"><article v-for="channel in mailingAnalytics.channels" :key="channel.channel"><header><strong>{{ channel.channel === "push" ? "Push" : "Email" }}</strong><span>{{ channel.sent }} доставлено</span></header><div><span>Открыто {{ channel.opened }}</span><strong>{{ formatMailingAnalyticsRate(channel.openRate) }}</strong></div><div><span>Переходы {{ channel.clicked }}</span><strong>{{ formatMailingAnalyticsRate(channel.clickRate) }}</strong></div><small v-if="channel.failed || channel.skipped">Ошибки {{ channel.failed }} · пропущено {{ channel.skipped }}</small></article></div>
            <section class="admin-mailing-analytics-block"><h5>Динамика</h5><p v-if="!mailingAnalytics.timeline.length" class="admin-empty">События пока не зафиксированы.</p><div v-else class="admin-mailing-analytics-timeline"><article v-for="item in mailingAnalytics.timeline" :key="item.bucket"><time :datetime="item.bucket">{{ formatMailingAnalyticsBucket(item.bucket) }}</time><div><span>Доставлено {{ item.sent }}</span><i class="is-sent" :style="{ width: mailingAnalyticsBarWidth(item.sent) }"></i></div><div><span>Открыто {{ item.opened }}</span><i class="is-opened" :style="{ width: mailingAnalyticsBarWidth(item.opened) }"></i></div><div><span>Переходы {{ item.clicked }}</span><i class="is-clicked" :style="{ width: mailingAnalyticsBarWidth(item.clicked) }"></i></div></article></div></section>
            <section class="admin-mailing-analytics-block"><h5>Популярные ссылки</h5><p v-if="!mailingAnalytics.links.length" class="admin-empty">Переходов по ссылкам пока нет.</p><ol v-else class="admin-mailing-analytics-links"><li v-for="link in mailingAnalytics.links" :key="link.destination"><a :href="link.destination" target="_blank" rel="noreferrer">{{ link.destination }}</a><strong>{{ link.uniqueClicks }}</strong></li></ol></section>
            <section class="admin-mailing-analytics-block"><div class="admin-mailing-analytics-recipients-head"><h5>Получатели</h5><span>{{ mailingAnalyticsRecipients.length }} показано</span></div><div class="admin-mailing-analytics-filters"><label><span>Статус</span><select :value="mailingAnalyticsRecipientStatus" @change="emit('update:mailing-analytics-recipient-status', ($event.target as HTMLSelectElement).value as MailingRecipientStatus); emit('refresh-analytics-recipients')"><option value="all">Все статусы</option><option value="delivered">Доставлено</option><option value="opened">Открыто</option><option value="clicked">Переход</option><option value="failed">Ошибка</option><option value="skipped">Пропущено</option><option value="pending">Ожидает</option></select></label><label><span>Канал</span><select :value="mailingAnalyticsRecipientChannel" @change="emit('update:mailing-analytics-recipient-channel', ($event.target as HTMLSelectElement).value as MailingRecipientChannel); emit('refresh-analytics-recipients')"><option value="all">Все каналы</option><option value="push">Push</option><option value="email">Email</option></select></label></div><p v-if="mailingAnalyticsRecipientsLoading && !mailingAnalyticsRecipients.length" class="admin-empty">Загружаю получателей…</p><p v-else-if="!mailingAnalyticsRecipients.length" class="admin-empty">По выбранным фильтрам получателей нет.</p><div v-else class="admin-mailing-analytics-recipients"><article v-for="recipient in mailingAnalyticsRecipients" :key="recipient.id"><header><div><strong>{{ recipient.displayName }}</strong><small>ID {{ recipient.telegramId }} · {{ recipient.channel === "push" ? "Push" : "Email" }}</small></div><span :class="`is-${recipient.analyticsStatus}`">{{ mailingAnalyticsStatusLabel(recipient.analyticsStatus) }}</span></header><div class="admin-mailing-analytics-recipient-times"><span>Отправлено: {{ formatDateTime(recipient.sentAt) }}</span><span v-if="recipient.openedAt">Открыто: {{ formatDateTime(recipient.openedAt) }}</span><span v-if="recipient.clickedAt">Переход: {{ formatDateTime(recipient.clickedAt) }}</span></div><small v-if="recipient.error" class="admin-mailing-delivery-error">{{ recipient.error }}</small></article></div><button v-if="mailingAnalyticsNextCursor" class="secondary-button ui-button admin-mailing-analytics-more" type="button" :disabled="mailingAnalyticsRecipientsLoading" @click="emit('load-more-analytics-recipients')">Показать ещё</button></section>
          </template>
        </section>
        <section class="admin-mailing-detail-section"><span>Фильтры</span><p>{{ mailingFilterSummary(selectedMailing) }}</p></section>
        <section class="admin-mailing-detail-section"><span>Сообщение</span><div v-if="selectedMailingBodyHtml" class="admin-mailing-detail-body" v-html="selectedMailingBodyHtml"></div><p v-else>{{ selectedMailing.body }}</p></section>
        <section class="admin-mailing-detail-section"><span>Вложение</span><a v-if="selectedMailing.attachment" class="admin-mailing-attachment" :href="selectedMailing.attachment.url ?? '#'" target="_blank" rel="noreferrer"><Paperclip class="h-3.5 w-3.5" aria-hidden="true" />{{ mailingAttachmentText(selectedMailing) }}</a><p v-else>Без вложения</p></section>
        <div class="admin-mailing-actions"><button class="primary-button ui-button" type="button" :disabled="saving" @click="emit('reuse', selectedMailing)">Использовать снова</button><button v-if="canRetryFailedMailing(selectedMailing)" class="secondary-button ui-button" type="button" :aria-label="`Повторить ошибки: ${selectedMailing.failedCount}`" :disabled="saving" @click="emit('retry', selectedMailing)">Повторить ошибки</button><button class="secondary-button ui-button" type="button" :disabled="saving" @click="emit('test', selectedMailing)">Тест себе</button></div>
      </section>
    </TaskScreen>
  </section>
</template>
