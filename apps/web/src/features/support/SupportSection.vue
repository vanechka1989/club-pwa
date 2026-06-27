<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { CheckCircle2, CircleDot, Image, Paperclip, Send, Video, X } from "lucide-vue-next";
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
import { useSessionStore } from "@/stores/session";

const emit = defineEmits<{
  "unread-change": [count: number];
  "open-client": [telegramId: string, ticketId: string];
  "return-ticket-consumed": [];
}>();

const props = defineProps<{
  openTicketId?: string | null;
}>();

const session = useSessionStore();
const loading = ref(true);
const error = ref<string | null>(null);
const success = ref<string | null>(null);
const topics = ref<Array<{ id: string; title: string; description: string }>>([]);
const tickets = ref<SupportTicket[]>([]);
const selectedTicketId = ref<string | null>(null);
const createTicketOpen = ref(false);
const openedAttachment = ref<SupportAttachment | null>(null);
const threadRef = ref<HTMLElement | null>(null);
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

const defaultTopics = [
  { id: "payment", title: "Оплата", description: "Платежи и подписки." },
  { id: "access", title: "Доступ", description: "Проблемы с доступом." },
  { id: "media", title: "Обучение", description: "Уроки, модули и воспроизведение." },
  { id: "other", title: "Другая причина", description: "Если подходящей причины нет." }
];

const isAdmin = computed(() => session.user?.realRole === "admin" || session.user?.realRole === "owner");
const visibleTopics = computed(() => (topics.value.length ? topics.value : defaultTopics));
const selectedTicket = computed(() => tickets.value.find((ticket) => ticket.id === selectedTicketId.value) ?? null);
const openTickets = computed(() => tickets.value.filter((ticket) => ticket.status === "open"));
const answeredTickets = computed(() => tickets.value.filter((ticket) => ticket.status === "answered"));
const closedTickets = computed(() => tickets.value.filter((ticket) => ticket.status === "closed"));
const adminUnreadTickets = computed(() => tickets.value.filter((ticket) => ticket.unread));

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function waitingTime(value: string | null) {
  if (!value) {
    return "Ответ отправлен";
  }

  const minutes = Math.max(1, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 60) {
    return `${minutes} мин.`;
  }

  return `${Math.floor(minutes / 60)} ч. ${minutes % 60} мин.`;
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
  tickets.value = [ticket, ...tickets.value.filter((item) => item.id !== ticket.id)].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );
}

function resetCustomerForm() {
  topic.value = "payment";
  customTopic.value = "";
  message.value = "";
  attachments.value = [];
}

function openCreateTicket() {
  error.value = null;
  success.value = null;
  createTicketOpen.value = true;
}

function closeCreateTicket() {
  createTicketOpen.value = false;
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
  loading.value = true;
  error.value = null;
  try {
    if (isAdmin.value) {
      const response = await getAdminSupportTickets();
      tickets.value = response.tickets;
      emit("unread-change", response.unreadCount);
    } else {
      const response = await getSupportHome();
      topics.value = response.topics;
      tickets.value = response.tickets;
      emit("unread-change", response.unreadCount);
    }
  } catch {
    error.value = "Не удалось загрузить поддержку.";
  } finally {
    loading.value = false;
  }

  if (props.openTicketId) {
    await openTicket(props.openTicketId);
    emit("return-ticket-consumed");
  }
}

async function openTicket(ticketId: string) {
  selectedTicketId.value = ticketId;
  error.value = null;
  success.value = null;
  replyMessage.value = "";
  replyAttachments.value = [];
  followUpMessage.value = "";
  followUpAttachments.value = [];

  try {
    const response = await markSupportTicketRead(ticketId);
    tickets.value = tickets.value.map((ticket) => (ticket.id === response.ticket.id ? response.ticket : ticket));
    emit("unread-change", response.unreadCount);
  } catch {
    // Если отметка прочтения не прошла, само обращение всё равно можно посмотреть.
  }
  await scrollThreadToLatest();
}

function closeModal() {
  selectedTicketId.value = null;
  openedAttachment.value = null;
  replyMessage.value = "";
  replyAttachments.value = [];
  followUpMessage.value = "";
  followUpAttachments.value = [];
}

function openAttachment(attachment: SupportAttachment) {
  openedAttachment.value = attachment;
}

function closeAttachment() {
  openedAttachment.value = null;
}

async function submitTicket() {
  error.value = null;
  success.value = null;
  const text = message.value.trim();
  if (!text) {
    error.value = "Напишите сообщение для поддержки.";
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
    success.value = "Обращение отправлено. Мы ответим здесь.";
  } catch (requestError: any) {
    error.value = requestError?.data?.error ?? "Не удалось отправить обращение.";
  } finally {
    sendingTicket.value = false;
  }
}

async function submitReply() {
  if (!selectedTicket.value) {
    return;
  }

  error.value = null;
  success.value = null;
  const text = replyMessage.value.trim();
  if (!text && replyAttachments.value.length === 0) {
    error.value = "Напишите ответ или приложите файл.";
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
    success.value = "Ответ отправлен клиенту.";
    emit("unread-change", response.unreadCount);
    await scrollThreadToLatest();
  } catch (requestError: any) {
    error.value = requestError?.data?.error ?? "Не удалось отправить ответ.";
  } finally {
    sendingReply.value = false;
  }
}

async function submitFollowUp() {
  if (!selectedTicket.value) {
    return;
  }

  error.value = null;
  success.value = null;
  const text = followUpMessage.value.trim();
  if (!text && followUpAttachments.value.length === 0) {
    error.value = "Напишите дополнение или приложите файл.";
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
    success.value = "Дополнение отправлено.";
    emit("unread-change", response.unreadCount);
    await scrollThreadToLatest();
  } catch (requestError: any) {
    error.value = requestError?.data?.error ?? "Не удалось отправить дополнение.";
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
  if (!window.confirm("Закрыть обращение? Если вопрос снова появится, можно создать новое.")) {
    return;
  }

  error.value = null;
  success.value = null;
  closingTicket.value = true;
  try {
    const response = await closeSupportTicket(selectedTicket.value.id);
    replaceTicket(response.ticket);
    selectedTicketId.value = response.ticket.id;
    success.value = "Обращение закрыто.";
    emit("unread-change", response.unreadCount);
  } catch (requestError: any) {
    error.value = requestError?.data?.error ?? "Не удалось закрыть обращение.";
  } finally {
    closingTicket.value = false;
  }
}

onMounted(() => {
  void loadSupport();
});

watch(
  () => props.openTicketId,
  (ticketId) => {
    if (ticketId && tickets.value.some((ticket) => ticket.id === ticketId)) {
      void openTicket(ticketId).then(() => emit("return-ticket-consumed"));
    }
  }
);
</script>

<template>
  <section class="support-section space-y-4">
    <div class="section-head">
      <div>
        <h2 class="section-title">Поддержка</h2>
        <p class="section-subtitle">
          {{ isAdmin ? "Обращения клиентов и ответы поддержки." : "Опишите проблему, и мы ответим в приложении." }}
        </p>
      </div>
    </div>

    <p v-if="error" class="support-alert support-alert-error">{{ error }}</p>
    <p v-if="success" class="support-alert support-alert-success">{{ success }}</p>

    <div v-if="loading" class="surface-card text-sm text-[var(--muted)]">Загрузка поддержки...</div>

    <template v-else-if="!isAdmin">
      <div class="surface-card support-create-entry">
        <div>
          <h3>Нужна помощь?</h3>
          <p class="support-muted">Создайте обращение, и ответ появится здесь же.</p>
        </div>
        <button class="support-compact-button support-primary-button" type="button" @click="openCreateTicket">
          Обратиться в поддержку
        </button>
      </div>

      <div class="support-list surface-card">
        <h3>Мои обращения</h3>
        <p v-if="!tickets.length" class="support-muted">Обращений пока нет.</p>
        <button v-for="ticket in tickets" :key="ticket.id" class="support-ticket-card" type="button" @click="openTicket(ticket.id)">
          <div>
            <p class="support-ticket-title">{{ ticket.topicTitle }}</p>
            <p class="support-muted">{{ formatDate(ticket.createdAt) }} · {{ ticket.messages.length }} сообщ.</p>
          </div>
          <span class="support-status" :class="statusTone(ticket)">
            {{ ticket.unread ? "Новый ответ" : ticket.statusLabel }}
          </span>
        </button>
      </div>
    </template>

    <template v-else>
      <div class="support-admin-board">
        <div class="support-admin-stats">
          <article class="surface-card">
            <span>Новые</span>
            <strong>{{ adminUnreadTickets.length }}</strong>
          </article>
          <article class="surface-card">
            <span>Открытые</span>
            <strong>{{ openTickets.length }}</strong>
          </article>
          <article class="surface-card">
            <span>Закрытые</span>
            <strong>{{ closedTickets.length }}</strong>
          </article>
        </div>

        <div class="surface-card support-ticket-list">
          <h3>Запросы клиентов</h3>
          <button v-for="ticket in tickets" :key="ticket.id" class="support-admin-ticket" type="button" @click="openTicket(ticket.id)">
            <div class="support-admin-ticket-main">
              <span>{{ userName(ticket.customer) }}</span>
              <small>ID {{ ticket.customer.telegramId }} · {{ ticket.topicTitle }}</small>
              <em>Время ожидания: {{ waitingTime(ticket.waitingSince) }}</em>
            </div>
            <span class="support-status" :class="statusTone(ticket)">
              {{ ticket.unread ? "Новое" : ticket.statusLabel }}
            </span>
          </button>
          <p v-if="!tickets.length" class="support-muted">Новых обращений пока нет.</p>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="createTicketOpen" class="support-modal-backdrop" @click.self="closeCreateTicket">
        <article class="support-ticket-modal support-ticket-modal-compact">
          <header class="support-modal-head">
            <div>
              <p class="support-kicker">Новое обращение</p>
              <h3>Обратиться в поддержку</h3>
              <p class="support-muted">Опишите проблему и приложите фото или видео, если нужно.</p>
            </div>
            <button class="support-modal-close" type="button" aria-label="Закрыть" @click="closeCreateTicket">
              <X class="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <form class="support-modal-body support-customer-form" @submit.prevent="submitTicket">
            <div class="support-form-grid">
              <div class="support-field support-field-wide">
                <span>Причина обращения</span>
                <div class="support-topic-options" role="radiogroup" aria-label="Причина обращения">
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
                <span>Своя причина</span>
                <input v-model="customTopic" type="text" placeholder="Например: вопрос по уроку" />
              </label>

              <label class="support-field support-field-wide">
                <span>Сообщение</span>
                <textarea v-model="message" rows="4" placeholder="Напишите, что случилось и где именно." />
              </label>

              <label class="support-upload support-field-wide">
                <Paperclip class="h-5 w-5" aria-hidden="true" />
                <span>{{ attachments.length ? `${attachments.length} файл(а)` : "Добавить фото или видео" }}</span>
                <input type="file" accept="image/*,video/*" multiple @change="updateFiles($event, 'ticket')" />
              </label>
            </div>

            <div v-if="attachments.length" class="support-file-list">
              <span v-for="file in attachments" :key="file.name">{{ file.name }}</span>
            </div>

            <button class="support-compact-button support-primary-button" type="submit" :disabled="sendingTicket">
              <Send class="h-4 w-4" aria-hidden="true" />
              {{ sendingTicket ? "Отправляем..." : "Отправить обращение" }}
            </button>
          </form>
        </article>
      </div>

      <div v-if="selectedTicket" class="support-modal-backdrop" @click.self="closeModal">
        <article class="support-ticket-modal">
          <header class="support-modal-head">
            <div>
              <p class="support-kicker">{{ isAdmin ? "Карточка обращения" : "Ваше обращение" }}</p>
              <h3>{{ selectedTicket.topicTitle }}</h3>
              <p class="support-muted">{{ formatDate(selectedTicket.createdAt) }} · {{ selectedTicket.statusLabel }}</p>
              <button
                v-if="isAdmin"
                class="support-ticket-summary"
                type="button"
                title="Открыть карточку клиента"
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
                <span class="support-status" :class="statusTone(selectedTicket)">{{ selectedTicket.statusLabel }}</span>
              </button>
            </div>
            <button class="support-modal-close" type="button" aria-label="Закрыть" @click="closeModal">
              <X class="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div class="support-modal-body support-ticket-modal-body">
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
                  <strong>{{ item.authorRole === "admin" ? "Поддержка" : userName(item.author) }}</strong>
                </div>
                <p>{{ item.body }}</p>
                <div v-if="item.attachments.length" class="support-attachments">
                  <div v-for="attachment in item.attachments" :key="attachment.id" class="support-attachment-preview">
                    <button class="support-attachment-open" type="button" @click="openAttachment(attachment)">
                      <component :is="attachmentIcon(attachment.kind)" class="h-4 w-4" aria-hidden="true" />
                      <span>Открыть вложение</span>
                      <small>{{ attachment.fileName }}</small>
                    </button>
                  </div>
                </div>
                <small>{{ formatDate(item.createdAt) }}</small>
              </article>
            </div>

            <form v-if="isAdmin && selectedTicket.status !== 'closed'" class="support-reply-form" @submit.prevent="submitReply">
              <div class="support-reply-input-row">
                <label class="support-file-icon-button" title="Добавить файл" aria-label="Добавить файл">
                  <Paperclip class="h-4 w-4" aria-hidden="true" />
                  <span v-if="replyAttachments.length" class="support-file-count">{{ replyAttachments.length }}</span>
                  <input type="file" accept="image/*,video/*" multiple @change="updateFiles($event, 'reply')" />
                </label>
                <textarea v-model="replyMessage" rows="2" placeholder="Ответ клиенту" />
              </div>
              <div class="support-reply-actions">
                <button
                  class="support-compact-button support-danger-button"
                  type="button"
                  :disabled="closingTicket"
                  @click="closeTicket"
                >
                  <CheckCircle2 class="h-4 w-4" aria-hidden="true" />
                  {{ closingTicket ? "Закрываем..." : "Закрыть обращение" }}
                </button>
                <button class="support-compact-button support-primary-button" type="submit" :disabled="sendingReply">
                  {{ sendingReply ? "Отправляем..." : "Отправить ответ" }}
                </button>
              </div>
            </form>

            <form v-else-if="!isAdmin && selectedTicket.status !== 'closed'" class="support-reply-form" @submit.prevent="submitFollowUp">
              <div class="support-reply-input-row">
                <label class="support-file-icon-button" title="Добавить файл" aria-label="Добавить файл">
                  <Paperclip class="h-4 w-4" aria-hidden="true" />
                  <span v-if="followUpAttachments.length" class="support-file-count">{{ followUpAttachments.length }}</span>
                  <input type="file" accept="image/*,video/*" multiple @change="updateFiles($event, 'followUp')" />
                </label>
                <textarea v-model="followUpMessage" rows="2" placeholder="Дополнить обращение" />
              </div>
              <div class="support-reply-actions">
                <button
                  class="support-compact-button support-danger-button"
                  type="button"
                  :disabled="closingTicket"
                  @click="closeTicket"
                >
                  <CheckCircle2 class="h-4 w-4" aria-hidden="true" />
                  {{ closingTicket ? "Закрываем..." : "Закрыть обращение" }}
                </button>
                <button class="support-compact-button support-primary-button" type="submit" :disabled="sendingFollowUp">
                  {{ sendingFollowUp ? "Отправляем..." : "Дополнить" }}
                </button>
              </div>
            </form>

            <div v-else class="support-modal-actions">
              <span class="support-closed-note">
                <CircleDot class="h-4 w-4" aria-hidden="true" />
                Обращение закрыто
              </span>
            </div>
          </div>
        </article>
      </div>

      <div v-if="openedAttachment" class="support-attachment-viewer" @click.self="closeAttachment">
        <article class="support-attachment-viewer-panel">
          <header>
            <strong>{{ openedAttachment.fileName }}</strong>
            <button class="support-modal-close" type="button" aria-label="Закрыть вложение" @click="closeAttachment">
              <X class="h-5 w-5" aria-hidden="true" />
            </button>
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
            Закрыть вложение
          </button>
        </article>
      </div>
    </Teleport>
  </section>
</template>
