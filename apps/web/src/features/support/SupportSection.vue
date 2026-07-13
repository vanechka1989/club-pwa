<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CheckCircle2, CircleDot, Image, Maximize2, Minimize2, Paperclip, Send, Video, X } from "lucide-vue-next";
import type { SupportAttachment, SupportTicket } from "@club/shared";
import {
  closeSupportTicket,
  createSupportTicket,
  createSupportTicketMessage,
  getAdminSupportTickets,
  getSupportHome,
  markSupportTicketRead,
  replyAdminSupportTicket
} from "@/api/client";
import { useI18n } from "@/features/app/i18n";
import ConfirmDialog from "@/features/app/ConfirmDialog.vue";
import TaskScreen from "@/features/app/TaskScreen.vue";
import { useOperationIndicator } from "@/features/app/useOperationIndicator";
import { sortSupportTickets } from "@/features/support/supportTickets";
import { useNotificationsStore } from "@/stores/notifications";
import { useSessionStore } from "@/stores/session";
import { hasAdminCapability } from "@/features/admin/adminCapabilities";

const emit = defineEmits<{
  "unread-change": [count: number];
  "open-client": [telegramId: string, ticketId: string];
  "return-ticket-consumed": [];
}>();

const props = defineProps<{
  openTicketId?: string | null;
}>();

const session = useSessionStore();
const route = useRoute();
const router = useRouter();
const notifications = useNotificationsStore();
const { currentLocale, t } = useI18n();
const loading = ref(true);
const error = ref<string | null>(null);
const success = ref<string | null>(null);
const topics = ref<Array<{ id: string; title: string; description: string }>>([]);
const tickets = ref<SupportTicket[]>([]);
const selectedTicketId = ref<string | null>(null);
const createTicketOpen = computed(() => route.path === "/support/new");
const closeConfirmOpen = ref(false);
const openedAttachment = ref<SupportAttachment | null>(null);
const threadRef = ref<HTMLElement | null>(null);
const attachmentPanelRef = ref<HTMLElement | null>(null);
const attachmentInlineFullscreen = ref(false);
const topic = ref("payment");
const customTopic = ref("");
const message = ref("");
const attachments = ref<File[]>([]);
const replyMessage = ref("");
const replyAttachments = ref<File[]>([]);
const followUpMessage = ref("");
const followUpAttachments = ref<File[]>([]);
const sendingTicket = ref(false);
const sendingReply = ref(false);
const sendingFollowUp = ref(false);
const closingTicket = ref(false);
const refreshingSupport = ref(false);
const supportRefreshIntervalMs = 10_000;
let supportRefreshTimer: ReturnType<typeof setInterval> | null = null;
let supportModeVersion = 0;

const isAdmin = computed(() =>
  hasAdminCapability(session.user?.role, session.user?.adminPermissions, "support")
);
const defaultTopics = computed(() => [
  { id: "payment", title: t("supportPaymentTopic"), description: t("supportPaymentTopicDescription") },
  { id: "access", title: t("supportAccessTopic"), description: t("supportAccessTopicDescription") },
  { id: "media", title: t("supportMediaTopic"), description: t("supportMediaTopicDescription") },
  { id: "other", title: t("supportOtherTopic"), description: t("supportOtherTopicDescription") }
]);
const visibleTopics = computed(() => (topics.value.length ? topics.value : defaultTopics.value).map(localizeTopic));
const routeTicketId = computed(() => (typeof route.params.ticketId === "string" ? route.params.ticketId : null));
const selectedTicket = computed(() => tickets.value.find((ticket) => ticket.id === selectedTicketId.value) ?? null);
const openTickets = computed(() => tickets.value.filter((ticket) => ticket.status === "open"));
const answeredTickets = computed(() => tickets.value.filter((ticket) => ticket.status === "answered"));
const closedTickets = computed(() => tickets.value.filter((ticket) => ticket.status === "closed"));
const adminUnreadTickets = computed(() => tickets.value.filter((ticket) => ticket.unread));
const supportBusy = computed(() => sendingTicket.value || sendingReply.value || sendingFollowUp.value || closingTicket.value);
const isVideoAttachment = computed(() => openedAttachment.value?.kind === "video");
const averageResponseTimeLabel = computed(() => {
  const averageMinutes = calculateAverageResponseMinutes(tickets.value);
  return averageMinutes === null ? t("supportNoAnswers") : formatDurationMinutes(averageMinutes);
});
const supportOperation = computed(() => {
  if (sendingTicket.value) {
    return {
      title: "Отправляем обращение...",
      detail: attachments.value.length ? "Загрузка файлов и создание обращения" : "Создаём обращение в поддержку"
    };
  }

  if (sendingReply.value) {
    return {
      title: "Отправляем ответ...",
      detail: replyAttachments.value.length ? "Загрузка файлов и отправка ответа" : "Отправляем сообщение клиенту"
    };
  }

  if (sendingFollowUp.value) {
    return {
      title: "Отправляем сообщение...",
      detail: followUpAttachments.value.length ? "Загрузка файлов и отправка сообщения" : "Отправляем сообщение в обращение"
    };
  }

  if (closingTicket.value) {
    return {
      title: "Закрываем обращение...",
      detail: "Обновляем статус обращения"
    };
  }

  return null;
});

useOperationIndicator(supportOperation);

function formatDate(value: string) {
  return new Intl.DateTimeFormat(currentLocale.value === "en" ? "en-US" : "ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function waitingTime(value: string | null) {
  if (!value) {
    return t("supportAnswerSent");
  }

  const minutes = Math.max(1, Math.floor((Date.now() - Date.parse(value)) / 60000));
  return formatDurationMinutes(minutes);
}

function formatDurationMinutes(minutes: number) {
  if (minutes < 60) {
    return `${minutes} ${t("supportMinutesShort")}`;
  }

  return `${Math.floor(minutes / 60)} ${t("supportHoursShort")} ${minutes % 60} ${t("supportMinutesShort")}`;
}

function calculateAverageResponseMinutes(items: SupportTicket[]) {
  const responseMinutes: number[] = [];

  items.forEach((ticket) => {
    ticket.messages.forEach((message, index) => {
      if (message.authorRole !== "customer") {
        return;
      }

      const response = ticket.messages.slice(index + 1).find((item) => item.authorRole === "admin");
      if (!response) {
        return;
      }

      responseMinutes.push(Math.max(1, Math.round((Date.parse(response.createdAt) - Date.parse(message.createdAt)) / 60000)));
    });
  });

  if (!responseMinutes.length) {
    return null;
  }

  return Math.round(responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length);
}

function userName(user: SupportTicket["customer"]) {
  return user.firstName || user.username || `ID ${user.telegramId}`;
}

function attachmentIcon(kind: string) {
  return kind === "video" ? Video : Image;
}

function statusTone(ticket: SupportTicket) {
  if (ticket.status === "closed") {
    return "support-status-closed";
  }
  if (ticket.unread) {
    return "support-status-hot";
  }
  if (ticket.status === "answered") {
    return "support-status-answered";
  }
  return "support-status-open";
}

function localizeTopic(item: { id: string; title: string; description: string }) {
  if (item.id === "payment") {
    return { ...item, title: t("supportPaymentTopic"), description: t("supportPaymentTopicDescription") };
  }
  if (item.id === "access") {
    return { ...item, title: t("supportAccessTopic"), description: t("supportAccessTopicDescription") };
  }
  if (item.id === "media") {
    return { ...item, title: t("supportMediaTopic"), description: t("supportMediaTopicDescription") };
  }
  if (item.id === "other") {
    return { ...item, title: t("supportOtherTopic"), description: t("supportOtherTopicDescription") };
  }

  return item;
}

function ticketTopicTitle(ticket: SupportTicket) {
  if (ticket.topic === "other" && ticket.customTopic) {
    return ticket.customTopic;
  }

  return localizeTopic({ id: ticket.topic, title: ticket.topicTitle, description: "" }).title;
}

function ticketStatusLabel(ticket: SupportTicket) {
  if (ticket.unread) {
    return isAdmin.value ? t("supportUnreadAdmin") : t("supportNewAnswer");
  }

  if (ticket.status === "closed") {
    return t("supportStatusClosed");
  }

  if (ticket.status === "answered") {
    return t("supportStatusAnswered");
  }

  return t("supportStatusOpen");
}

function updateFiles(event: Event, target: "ticket" | "reply" | "followUp") {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []).slice(0, 4);
  if (target === "ticket") {
    attachments.value = files;
    return;
  }
  if (target === "reply") {
    replyAttachments.value = files;
    return;
  }
  followUpAttachments.value = files;
}

function replaceTicket(ticket: SupportTicket) {
  tickets.value = sortSupportTickets([ticket, ...tickets.value.filter((item) => item.id !== ticket.id)]);
}

function replaceTickets(nextTickets: SupportTicket[]) {
  tickets.value = sortSupportTickets(nextTickets);
}

function resetCustomerForm() {
  topic.value = "payment";
  customTopic.value = "";
  message.value = "";
  attachments.value = [];
}

function clearSupportNotice() {
  error.value = null;
  success.value = null;
}

function showSupportError(text: string) {
  error.value = text;
  success.value = null;
  notifications.showError(text);
}

function showSupportSuccess(text: string) {
  success.value = text;
  error.value = null;
  notifications.showSuccess(text);
}

function openCreateTicket() {
  clearSupportNotice();
  void router.push("/support/new");
}

function closeCreateTicket() {
  void router.push("/support");
}

async function scrollThreadToLatest() {
  await nextTick();
  const element = threadRef.value;
  if (!element) {
    return;
  }
  element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
}

async function loadSupport() {
  await refreshSupport({ silent: false, consumeOpenTicket: true });
}

async function refreshSelectedTicketRead(ticket = selectedTicket.value) {
  if (!ticket?.unread) {
    return;
  }

  try {
    const response = await markSupportTicketRead(ticket.id);
    replaceTicket(response.ticket);
    emit("unread-change", response.unreadCount);
  } catch {
    // Следующая проверка повторит отметку прочтения.
  }
}

async function refreshSupport(options: { silent?: boolean; consumeOpenTicket?: boolean } = {}) {
  if (refreshingSupport.value) {
    return;
  }

  const { silent = false, consumeOpenTicket = false } = options;
  const modeVersion = supportModeVersion;
  const adminMode = isAdmin.value;
  let modeChanged = false;
  refreshingSupport.value = true;
  if (!silent) {
    loading.value = true;
    error.value = null;
  }

  const selectedId = selectedTicketId.value;
  try {
    if (adminMode) {
      const response = await getAdminSupportTickets();
      modeChanged = modeVersion !== supportModeVersion || adminMode !== isAdmin.value;
      if (!modeChanged) {
        replaceTickets(response.tickets);
        emit("unread-change", response.unreadCount);
      }
    } else {
      const response = await getSupportHome();
      modeChanged = modeVersion !== supportModeVersion || adminMode !== isAdmin.value;
      if (!modeChanged) {
        topics.value = response.topics;
        replaceTickets(response.tickets);
        emit("unread-change", response.unreadCount);
      }
    }

    if (!modeChanged && selectedId) {
      const openedTicket = tickets.value.find((ticket) => ticket.id === selectedId) ?? null;
      await refreshSelectedTicketRead(openedTicket);
    }
  } catch {
    modeChanged = modeVersion !== supportModeVersion || adminMode !== isAdmin.value;
    if (!silent && !modeChanged) {
      showSupportError("Не удалось загрузить поддержку.");
    }
  } finally {
    refreshingSupport.value = false;
    if (!silent) {
      loading.value = false;
    }
  }

  if (modeChanged) {
    void loadSupport();
    return;
  }

  if (consumeOpenTicket && props.openTicketId) {
    await openTicket(props.openTicketId);
    emit("return-ticket-consumed");
  }
}

function startSupportPolling() {
  stopSupportPolling();
  supportRefreshTimer = setInterval(() => {
    if (supportBusy.value) {
      return;
    }
    void refreshSupport({ silent: true });
  }, supportRefreshIntervalMs);
}

function stopSupportPolling() {
  if (!supportRefreshTimer) {
    return;
  }
  clearInterval(supportRefreshTimer);
  supportRefreshTimer = null;
}

async function openTicket(ticketId: string) {
  selectedTicketId.value = ticketId;
  if (route.path !== `/support/tickets/${ticketId}`) {
    await router.push(`/support/tickets/${ticketId}`);
  }
  clearSupportNotice();
  replyMessage.value = "";
  replyAttachments.value = [];
  followUpMessage.value = "";
  followUpAttachments.value = [];

  try {
    const response = await markSupportTicketRead(ticketId);
    replaceTicket(response.ticket);
    emit("unread-change", response.unreadCount);
  } catch {
    // Если отметка прочтения не прошла, само обращение всё равно можно посмотреть.
  }
  await scrollThreadToLatest();
}

function closeModal() {
  selectedTicketId.value = null;
  closeConfirmOpen.value = false;
  openedAttachment.value = null;
  replyMessage.value = "";
  replyAttachments.value = [];
  followUpMessage.value = "";
  followUpAttachments.value = [];
  if (route.path !== "/support") {
    void router.push("/support");
  }
}

function openAttachment(attachment: SupportAttachment) {
  openedAttachment.value = attachment;
  attachmentInlineFullscreen.value = false;
}

function closeAttachment() {
  openedAttachment.value = null;
  attachmentInlineFullscreen.value = false;
}

function toggleAttachmentFullscreen() {
  attachmentInlineFullscreen.value = !attachmentInlineFullscreen.value;
}

async function submitTicket() {
  clearSupportNotice();
  const text = message.value.trim();
  if (!text) {
    showSupportError("Напишите сообщение для поддержки.");
    return;
  }

  sendingTicket.value = true;
  const form = new FormData();
  form.set("topic", topic.value);
  form.set("customTopic", customTopic.value);
  form.set("message", text);
  attachments.value.forEach((file) => form.append("attachments", file));

  try {
    const response = await createSupportTicket(form);
    replaceTicket(response.ticket);
    emit("unread-change", response.unreadCount);
    resetCustomerForm();
    closeCreateTicket();
    showSupportSuccess("Обращение отправлено. Мы ответим здесь.");
  } catch (requestError: any) {
    showSupportError(requestError?.data?.error ?? "Не удалось отправить обращение.");
  } finally {
    sendingTicket.value = false;
  }
}

async function submitReply() {
  if (!selectedTicket.value) {
    return;
  }

  clearSupportNotice();
  const text = replyMessage.value.trim();
  if (!text && replyAttachments.value.length === 0) {
    showSupportError("Напишите ответ или приложите файл.");
    return;
  }

  sendingReply.value = true;
  const form = new FormData();
  form.set("message", text);
  replyAttachments.value.forEach((file) => form.append("attachments", file));

  try {
    const response = await replyAdminSupportTicket(selectedTicket.value.id, form);
    replaceTicket(response.ticket);
    selectedTicketId.value = response.ticket.id;
    replyMessage.value = "";
    replyAttachments.value = [];
    showSupportSuccess("Ответ отправлен клиенту.");
    emit("unread-change", response.unreadCount);
    await scrollThreadToLatest();
  } catch (requestError: any) {
    showSupportError(requestError?.data?.error ?? "Не удалось отправить ответ.");
  } finally {
    sendingReply.value = false;
  }
}

async function submitFollowUp() {
  if (!selectedTicket.value) {
    return;
  }

  clearSupportNotice();
  const text = followUpMessage.value.trim();
  if (!text && followUpAttachments.value.length === 0) {
    showSupportError("Напишите сообщение или приложите файл.");
    return;
  }

  sendingFollowUp.value = true;
  const form = new FormData();
  form.set("message", text);
  followUpAttachments.value.forEach((file) => form.append("attachments", file));

  try {
    const response = await createSupportTicketMessage(selectedTicket.value.id, form);
    replaceTicket(response.ticket);
    selectedTicketId.value = response.ticket.id;
    followUpMessage.value = "";
    followUpAttachments.value = [];
    showSupportSuccess("Сообщение отправлено.");
    emit("unread-change", response.unreadCount);
    await scrollThreadToLatest();
  } catch (requestError: any) {
    showSupportError(requestError?.data?.error ?? "Не удалось отправить сообщение.");
  } finally {
    sendingFollowUp.value = false;
  }
}

async function openClientCard() {
  if (!selectedTicket.value) {
    return;
  }
  emit("open-client", selectedTicket.value.customer.telegramId, selectedTicket.value.id);
}

async function closeTicket() {
  if (!selectedTicket.value) {
    return;
  }
  closeConfirmOpen.value = true;
}

function cancelCloseTicket() {
  closeConfirmOpen.value = false;
}

async function confirmCloseTicket() {
  if (!selectedTicket.value) {
    return;
  }

  clearSupportNotice();
  closeConfirmOpen.value = false;
  closingTicket.value = true;
  try {
    const response = await closeSupportTicket(selectedTicket.value.id);
    replaceTicket(response.ticket);
    selectedTicketId.value = response.ticket.id;
    showSupportSuccess("Обращение закрыто.");
    emit("unread-change", response.unreadCount);
  } catch (requestError: any) {
    showSupportError(requestError?.data?.error ?? "Не удалось закрыть обращение.");
  } finally {
    closingTicket.value = false;
  }
}

onMounted(() => {
  void loadSupport().then(() => {
    if (routeTicketId.value && tickets.value.some((ticket) => ticket.id === routeTicketId.value)) {
      void openTicket(routeTicketId.value);
    }
  });
  startSupportPolling();
});

onUnmounted(() => {
  stopSupportPolling();
});

watch(
  routeTicketId,
  async (ticketId) => {
    if (!ticketId) {
      selectedTicketId.value = null;
      return;
    }
    if (!tickets.value.some((ticket) => ticket.id === ticketId)) {
      await refreshSupport({ silent: true });
    }
    if (tickets.value.some((ticket) => ticket.id === ticketId) && selectedTicketId.value !== ticketId) {
      await openTicket(ticketId);
    }
  }
);

watch(isAdmin, async () => {
  supportModeVersion += 1;
  tickets.value = [];
  selectedTicketId.value = null;
  closeConfirmOpen.value = false;
  openedAttachment.value = null;
  clearSupportNotice();
  emit("unread-change", 0);

  if (route.path !== "/support") {
    await router.replace("/support");
  }

  if (!refreshingSupport.value) {
    void loadSupport();
  }
});

watch(
  () => props.openTicketId,
  async (ticketId) => {
    if (!ticketId) {
      return;
    }

    if (!tickets.value.some((ticket) => ticket.id === ticketId)) {
      await refreshSupport({ silent: true });
    }

    if (tickets.value.some((ticket) => ticket.id === ticketId)) {
      void openTicket(ticketId).then(() => emit("return-ticket-consumed"));
    }
  }
);

watch(
  () => selectedTicket.value?.messages.length,
  (count, previousCount) => {
    if (!count || !previousCount || count <= previousCount) {
      return;
    }
    void scrollThreadToLatest();
  }
);
</script>

<template>
  <section class="support-section ui-page-section space-y-4">
    <template v-if="!createTicketOpen && !selectedTicket">
    <div class="section-head ui-page-header">
      <div>
        <h2 class="section-title">{{ t("support") }}</h2>
        <p class="section-subtitle">
          {{ isAdmin ? t("supportSectionSubtitleAdmin") : t("supportSectionSubtitleUser") }}
        </p>
      </div>
    </div>

    <p v-if="error" class="support-alert support-alert-error">{{ error }}</p>
    <p v-if="success" class="support-alert support-alert-success">{{ success }}</p>

    <div v-if="loading" class="surface-card ui-card text-sm text-[var(--muted)]">{{ t("supportLoading") }}</div>

    <template v-else-if="!isAdmin">
      <div class="surface-card ui-card support-create-entry">
        <div>
          <h3>{{ t("supportNeedHelpTitle") }}</h3>
          <p class="support-muted">{{ t("supportNeedHelpText") }}</p>
        </div>
        <button class="support-compact-button support-primary-button ui-button" type="button" @click="openCreateTicket">
          {{ t("supportCreateTicket") }}
        </button>
      </div>

      <div class="support-list surface-card ui-card">
        <h3>{{ t("supportMyTickets") }}</h3>
        <p v-if="!tickets.length" class="support-muted">{{ t("supportNoTickets") }}</p>
        <button v-for="ticket in tickets" :key="ticket.id" class="support-ticket-card" type="button" @click="openTicket(ticket.id)">
          <div>
            <p class="support-ticket-title">{{ ticketTopicTitle(ticket) }}</p>
            <p class="support-muted">{{ formatDate(ticket.createdAt) }} · {{ ticket.messages.length }} {{ t("supportMessagesShort") }}</p>
          </div>
          <span class="support-status" :class="statusTone(ticket)">
            {{ ticketStatusLabel(ticket) }}
          </span>
        </button>
      </div>
    </template>

    <template v-else>
      <div class="support-admin-board">
        <div class="support-admin-stats">
          <article class="surface-card ui-card">
            <span>{{ t("supportStatsNew") }}</span>
            <strong>{{ adminUnreadTickets.length }}</strong>
          </article>
          <article class="surface-card ui-card">
            <span>{{ t("supportStatsOpen") }}</span>
            <strong>{{ openTickets.length }}</strong>
          </article>
          <article class="surface-card ui-card">
            <span>{{ t("supportStatsClosed") }}</span>
            <strong>{{ closedTickets.length }}</strong>
          </article>
          <article class="surface-card ui-card">
            <span>{{ t("supportStatsAverage") }}</span>
            <strong>{{ averageResponseTimeLabel }}</strong>
          </article>
        </div>

        <div class="surface-card ui-card support-ticket-list">
          <h3>{{ t("supportRequests") }}</h3>
          <button v-for="ticket in tickets" :key="ticket.id" class="support-admin-ticket" type="button" @click="openTicket(ticket.id)">
            <div class="support-admin-ticket-main">
              <span>{{ userName(ticket.customer) }}</span>
              <small>ID {{ ticket.customer.telegramId }} · {{ ticketTopicTitle(ticket) }}</small>
              <em>{{ t("supportWaitingTime") }}: {{ waitingTime(ticket.waitingSince) }}</em>
            </div>
            <span class="support-status" :class="statusTone(ticket)">
              {{ ticketStatusLabel(ticket) }}
            </span>
          </button>
          <p v-if="!tickets.length" class="support-muted">{{ t("supportNoNewTickets") }}</p>
        </div>
      </div>
    </template>
    </template>

      <TaskScreen
        v-if="createTicketOpen"
        class="support-task-screen support-create-task-screen"
        :title="t('supportCreateTicket')"
        :subtitle="t('supportCreateHint')"
        portal
        @back="closeCreateTicket"
      >
          <form class="support-modal-body support-customer-form ui-card" @submit.prevent="submitTicket">
            <div class="support-form-grid">
              <div class="support-field support-field-wide">
                <span>{{ t("supportReason") }}</span>
                <div class="support-topic-options" role="radiogroup" :aria-label="t('supportReason')">
                  <button
                    v-for="item in visibleTopics"
                    :key="item.id"
                    class="support-topic-option"
                    :class="{ 'support-topic-option-active': topic === item.id }"
                    type="button"
                    role="radio"
                    :aria-checked="topic === item.id"
                    @click="topic = item.id"
                  >
                    <span>
                      <strong>{{ item.title }}</strong>
                      <small>{{ item.description }}</small>
                    </span>
                    <CheckCircle2 v-if="topic === item.id" class="h-5 w-5" aria-hidden="true" />
                    <CircleDot v-else class="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <label v-if="topic === 'other'" class="support-field">
                <span>{{ t("supportOwnReason") }}</span>
                <input v-model="customTopic" type="text" :placeholder="t('supportOwnReasonPlaceholder')" />
              </label>

              <label class="support-field support-field-wide">
                <span>{{ t("supportMessage") }}</span>
                <textarea v-model="message" rows="4" :placeholder="t('supportMessagePlaceholder')" />
              </label>

              <label class="support-upload support-field-wide">
                <Paperclip class="h-5 w-5" aria-hidden="true" />
                <span>{{ attachments.length ? `${attachments.length} ${t("supportFileCount")}` : t("supportAddPhotoVideo") }}</span>
                <input type="file" accept="image/*,video/*" multiple @change="updateFiles($event, 'ticket')" />
              </label>
            </div>

            <div v-if="attachments.length" class="support-file-list">
              <span v-for="file in attachments" :key="file.name">{{ file.name }}</span>
            </div>

            <button class="support-compact-button support-primary-button ui-button" type="submit" :disabled="sendingTicket">
              <Send class="h-4 w-4" aria-hidden="true" />
              {{ sendingTicket ? t("supportSending") : t("supportSendTicket") }}
            </button>
          </form>
      </TaskScreen>

      <TaskScreen
        v-else-if="selectedTicket"
        class="support-task-screen support-ticket-task-screen"
        :title="ticketTopicTitle(selectedTicket)"
        :subtitle="`${formatDate(selectedTicket.createdAt)} · ${ticketStatusLabel(selectedTicket)}`"
        portal
        @back="closeModal"
      >
        <template v-if="isAdmin" #actions>
          <button class="support-ticket-client-action" type="button" :title="t('supportOpenClientCard')" @click="openClientCard">
            <img v-if="selectedTicket.customer.photoUrl" :src="selectedTicket.customer.photoUrl" :alt="userName(selectedTicket.customer)" />
            <span v-else class="support-customer-avatar support-customer-avatar-small">{{ userName(selectedTicket.customer).slice(0, 1) }}</span>
          </button>
        </template>
          <header v-if="isAdmin" class="support-modal-head support-task-customer-head ui-card">
            <div>
              <p class="support-kicker">{{ isAdmin ? t("supportTicketCardAdmin") : t("supportTicketCardUser") }}</p>
              <button
                class="support-ticket-summary"
                type="button"
                :title="t('supportOpenClientCard')"
                @click="openClientCard"
              >
                <img
                  v-if="selectedTicket.customer.photoUrl"
                  :src="selectedTicket.customer.photoUrl"
                  :alt="userName(selectedTicket.customer)"
                />
                <span v-else class="support-customer-avatar support-customer-avatar-small">
                  {{ userName(selectedTicket.customer).slice(0, 1) }}
                </span>
                <span class="support-customer-strip-info">
                  <strong>{{ userName(selectedTicket.customer) }}</strong>
                  <small>
                    {{ selectedTicket.customer.username ? `@${selectedTicket.customer.username}` : `ID ${selectedTicket.customer.telegramId}` }}
                  </small>
                </span>
                <span class="support-status" :class="statusTone(selectedTicket)">{{ ticketStatusLabel(selectedTicket) }}</span>
              </button>
            </div>
          </header>

          <div class="support-modal-body support-ticket-modal-body ui-card">
            <div ref="threadRef" class="support-thread">
              <article
                v-for="item in selectedTicket.messages"
                :key="item.id"
                class="support-message"
                :class="{ 'support-message-admin': item.authorRole === 'admin' }"
              >
                <div class="support-message-head">
                  <img v-if="item.author.photoUrl" :src="item.author.photoUrl" :alt="userName(item.author)" />
                  <span v-else class="support-message-avatar">{{ userName(item.author).slice(0, 1) }}</span>
                  <strong>{{ item.authorRole === "admin" ? t("supportAdminAuthor") : userName(item.author) }}</strong>
                </div>
                <p>{{ item.body }}</p>
                <div v-if="item.attachments.length" class="support-attachments">
                  <div v-for="attachment in item.attachments" :key="attachment.id" class="support-attachment-preview">
                    <button class="support-attachment-open" type="button" @click="openAttachment(attachment)">
                      <component :is="attachmentIcon(attachment.kind)" class="h-4 w-4" aria-hidden="true" />
                      <span>{{ t("supportOpenAttachment") }}</span>
                      <small>{{ attachment.fileName }}</small>
                    </button>
                  </div>
                </div>
                <small>{{ formatDate(item.createdAt) }}</small>
              </article>
            </div>

            <div v-if="selectedTicket.status === 'closed'" class="support-modal-actions">
              <span class="support-closed-note">
                <CircleDot class="h-4 w-4" aria-hidden="true" />
                {{ t("supportClosedNote") }}
              </span>
            </div>
            </div>
        <template #footer v-if="selectedTicket.status !== 'closed'">
          <form v-if="isAdmin" class="support-reply-form" @submit.prevent="submitReply">
            <div class="support-reply-input-row">
              <label class="support-file-icon-button ui-icon-button" :title="t('supportAddFile')" :aria-label="t('supportAddFile')">
                <Paperclip class="h-4 w-4" aria-hidden="true" />
                <span v-if="replyAttachments.length" class="support-file-count">{{ replyAttachments.length }}</span>
                <input type="file" accept="image/*,video/*" multiple @change="updateFiles($event, 'reply')" />
              </label>
              <textarea v-model="replyMessage" rows="2" :placeholder="t('supportReplyPlaceholder')" />
            </div>
            <div class="support-reply-actions ui-button-group">
              <button
                class="support-compact-button support-danger-button ui-button"
                type="button"
                :disabled="closingTicket"
                @click="closeTicket"
              >
                <CheckCircle2 class="h-4 w-4" aria-hidden="true" />
                {{ closingTicket ? t("supportClosing") : t("supportCloseTicket") }}
              </button>
              <button class="support-compact-button support-primary-button ui-button" type="submit" :disabled="sendingReply">
                {{ sendingReply ? t("supportSending") : t("supportSendReply") }}
              </button>
            </div>
          </form>

          <form v-else class="support-reply-form" @submit.prevent="submitFollowUp">
            <div class="support-reply-input-row">
              <label class="support-file-icon-button ui-icon-button" :title="t('supportAddFile')" :aria-label="t('supportAddFile')">
                <Paperclip class="h-4 w-4" aria-hidden="true" />
                <span v-if="followUpAttachments.length" class="support-file-count">{{ followUpAttachments.length }}</span>
                <input type="file" accept="image/*,video/*" multiple @change="updateFiles($event, 'followUp')" />
              </label>
              <textarea v-model="followUpMessage" rows="2" :placeholder="t('supportFollowupPlaceholder')" />
            </div>
            <div class="support-reply-actions ui-button-group">
              <button
                class="support-compact-button support-danger-button ui-button"
                type="button"
                :disabled="closingTicket"
                @click="closeTicket"
              >
                <CheckCircle2 class="h-4 w-4" aria-hidden="true" />
                {{ closingTicket ? t("supportClosing") : t("supportCloseTicket") }}
              </button>
              <button class="support-compact-button support-primary-button ui-button" type="submit" :disabled="sendingFollowUp">
                {{ sendingFollowUp ? t("supportSending") : t("supportSend") }}
              </button>
            </div>
          </form>
        </template>
      </TaskScreen>

      <ConfirmDialog
        :open="closeConfirmOpen && Boolean(selectedTicket)"
        :title="t('supportCloseConfirmTitle')"
        :description="t('supportCloseConfirmText')"
        :confirm-label="closingTicket ? t('supportClosing') : t('supportClose')"
        :cancel-label="t('supportCancel')"
        :busy="closingTicket"
        danger
        @cancel="cancelCloseTicket"
        @confirm="confirmCloseTicket"
      />

    <Teleport to="body">
      <div
        v-if="openedAttachment"
        class="support-attachment-viewer"
        :class="{ 'support-attachment-viewer-fullscreen': attachmentInlineFullscreen }"
        @click.self="closeAttachment"
      >
        <article ref="attachmentPanelRef" class="support-attachment-viewer-panel">
          <header>
            <strong>{{ openedAttachment.fileName }}</strong>
            <div class="support-attachment-viewer-head-actions">
              <button
                v-if="isVideoAttachment"
                class="support-modal-close"
                type="button"
                :aria-label="attachmentInlineFullscreen ? 'Свернуть видео' : 'Открыть видео во весь экран'"
                :title="attachmentInlineFullscreen ? 'Свернуть' : 'Во весь экран'"
                @click="toggleAttachmentFullscreen"
              >
                <Minimize2 v-if="attachmentInlineFullscreen" class="h-5 w-5" aria-hidden="true" />
                <Maximize2 v-else class="h-5 w-5" aria-hidden="true" />
              </button>
              <button class="support-modal-close" type="button" :aria-label="t('supportCloseAttachment')" @click="closeAttachment">
                <X class="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </header>
          <img
            v-if="openedAttachment.kind === 'photo'"
            class="support-attachment-viewer-media"
            :src="openedAttachment.url"
            :alt="openedAttachment.fileName"
          />
          <video
            v-else
            class="support-attachment-viewer-media"
            :src="openedAttachment.url"
            controls
            autoplay
            playsinline
          />
          <button class="support-attachment-viewer-close" type="button" @click="closeAttachment">
            {{ t("supportCloseAttachment") }}
          </button>
        </article>
      </div>
    </Teleport>
  </section>
</template>
