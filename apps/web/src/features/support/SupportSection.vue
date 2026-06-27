<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Image, Paperclip, Send, Video } from "lucide-vue-next";
import type { SupportTicket } from "@club/shared";
import { createSupportTicket, getAdminSupportTickets, getSupportHome, replyAdminSupportTicket } from "@/api/client";
import { useSessionStore } from "@/stores/session";

const emit = defineEmits<{
  "unread-change": [count: number];
}>();

const session = useSessionStore();
const loading = ref(true);
const sending = ref(false);
const error = ref<string | null>(null);
const success = ref<string | null>(null);
const topics = ref<Array<{ id: string; title: string; description: string }>>([]);
const tickets = ref<SupportTicket[]>([]);
const selectedTicketId = ref<string | null>(null);
const topic = ref("payment");
const customTopic = ref("");
const message = ref("");
const attachments = ref<File[]>([]);
const replyMessage = ref("");
const replyAttachments = ref<File[]>([]);
const defaultTopics = [
  { id: "payment", title: "Оплата", description: "Платежи и подписки." },
  { id: "access", title: "Доступ", description: "Проблемы с доступом." },
  { id: "other", title: "Другая причина", description: "Если подходящей причины нет." }
];

const isAdmin = computed(() => session.user?.realRole === "admin" || session.user?.realRole === "owner");
const visibleTopics = computed(() => (topics.value.length ? topics.value : defaultTopics));
const selectedTicket = computed(() => tickets.value.find((ticket) => ticket.id === selectedTicketId.value) ?? tickets.value[0] ?? null);
const openTickets = computed(() => tickets.value.filter((ticket) => ticket.status === "open"));
const answeredTickets = computed(() => tickets.value.filter((ticket) => ticket.status === "answered"));

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

function updateFiles(event: Event, target: "ticket" | "reply") {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []).slice(0, 4);
  if (target === "ticket") {
    attachments.value = files;
    return;
  }

  replyAttachments.value = files;
}

function resetCustomerForm() {
  topic.value = "payment";
  customTopic.value = "";
  message.value = "";
  attachments.value = [];
}

async function loadSupport() {
  loading.value = true;
  error.value = null;
  try {
    if (isAdmin.value) {
      const response = await getAdminSupportTickets();
      tickets.value = response.tickets;
      selectedTicketId.value = tickets.value[0]?.id ?? null;
      emit("unread-change", response.unreadCount);
      return;
    }

    const response = await getSupportHome();
    topics.value = response.topics;
    tickets.value = response.tickets;
    emit("unread-change", response.unreadCount);
  } catch {
    error.value = "Не удалось загрузить поддержку.";
  } finally {
    loading.value = false;
  }
}

async function submitTicket() {
  error.value = null;
  success.value = null;
  const text = message.value.trim();
  if (!text) {
    error.value = "Напишите сообщение для поддержки.";
    return;
  }

  sending.value = true;
  const form = new FormData();
  form.set("topic", topic.value);
  form.set("customTopic", customTopic.value);
  form.set("message", text);
  attachments.value.forEach((file) => form.append("attachments", file));

  try {
    const response = await createSupportTicket(form);
    tickets.value = [response.ticket, ...tickets.value.filter((ticket) => ticket.id !== response.ticket.id)];
    emit("unread-change", response.unreadCount);
    resetCustomerForm();
    success.value = "Обращение отправлено. Мы ответим здесь.";
  } catch (requestError: any) {
    error.value = requestError?.data?.error ?? "Не удалось отправить обращение.";
  } finally {
    sending.value = false;
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

  sending.value = true;
  const form = new FormData();
  form.set("message", text);
  replyAttachments.value.forEach((file) => form.append("attachments", file));

  try {
    const response = await replyAdminSupportTicket(selectedTicket.value.id, form);
    tickets.value = tickets.value.map((ticket) => (ticket.id === response.ticket.id ? response.ticket : ticket));
    selectedTicketId.value = response.ticket.id;
    replyMessage.value = "";
    replyAttachments.value = [];
    success.value = "Ответ отправлен клиенту.";
    emit("unread-change", response.unreadCount);
  } catch (requestError: any) {
    error.value = requestError?.data?.error ?? "Не удалось отправить ответ.";
  } finally {
    sending.value = false;
  }
}

onMounted(() => {
  void loadSupport();
});
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
      <form class="support-customer-form surface-card" @submit.prevent="submitTicket">
        <div class="support-form-grid">
          <label class="support-field">
            <span>Причина обращения</span>
            <select v-model="topic">
              <option v-for="item in visibleTopics" :key="item.id" :value="item.id">{{ item.title }}</option>
            </select>
          </label>

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

        <button class="support-compact-button support-primary-button" type="submit" :disabled="sending">
          <Send class="h-4 w-4" aria-hidden="true" />
          {{ sending ? "Отправляем..." : "Отправить" }}
        </button>
      </form>

      <div class="support-list surface-card">
        <h3>Мои обращения</h3>
        <p v-if="!tickets.length" class="support-muted">Обращений пока нет.</p>
        <article v-for="ticket in tickets" :key="ticket.id" class="support-ticket-card">
          <div>
            <p class="support-ticket-title">{{ ticket.topicTitle }}</p>
            <p class="support-muted">{{ ticket.statusLabel }} · {{ formatDate(ticket.createdAt) }}</p>
          </div>
          <span class="support-status" :class="{ 'support-status-hot': ticket.unread }">
            {{ ticket.unread ? "Ответ" : ticket.statusLabel }}
          </span>
        </article>
      </div>
    </template>

    <template v-else>
      <div class="support-admin-board">
        <div class="support-admin-stats">
          <article class="surface-card">
            <span>Открытые</span>
            <strong>{{ openTickets.length }}</strong>
          </article>
          <article class="surface-card">
            <span>С ответом</span>
            <strong>{{ answeredTickets.length }}</strong>
          </article>
          <article class="surface-card">
            <span>Всего</span>
            <strong>{{ tickets.length }}</strong>
          </article>
        </div>

        <div class="support-admin-layout">
          <aside class="surface-card support-ticket-list">
            <h3>Запросы клиентов</h3>
            <button
              v-for="ticket in tickets"
              :key="ticket.id"
              class="support-admin-ticket"
              :class="{ 'support-admin-ticket-active': selectedTicket?.id === ticket.id }"
              type="button"
              @click="selectedTicketId = ticket.id"
            >
              <span>{{ userName(ticket.customer) }}</span>
              <small>{{ ticket.topicTitle }}</small>
              <em>Время ожидания: {{ waitingTime(ticket.waitingSince) }}</em>
            </button>
            <p v-if="!tickets.length" class="support-muted">Новых обращений пока нет.</p>
          </aside>

          <article v-if="selectedTicket" class="surface-card support-ticket-detail">
            <header>
              <div>
                <p class="support-muted">Обращение</p>
                <h3>{{ selectedTicket.topicTitle }}</h3>
                <p class="support-muted">
                  {{ userName(selectedTicket.customer) }} · {{ formatDate(selectedTicket.createdAt) }}
                </p>
              </div>
              <span class="support-status">{{ waitingTime(selectedTicket.waitingSince) }}</span>
            </header>

            <div class="support-thread">
              <article
                v-for="item in selectedTicket.messages"
                :key="item.id"
                class="support-message"
                :class="{ 'support-message-admin': item.authorRole === 'admin' }"
              >
                <strong>{{ item.authorRole === "admin" ? "Поддержка" : userName(item.author) }}</strong>
                <p>{{ item.body }}</p>
                <div v-if="item.attachments.length" class="support-attachments">
                  <a v-for="attachment in item.attachments" :key="attachment.id" :href="attachment.url" target="_blank" rel="noreferrer">
                    <component :is="attachmentIcon(attachment.kind)" class="h-4 w-4" aria-hidden="true" />
                    {{ attachment.kind === "video" ? "Видео" : "Фото" }}
                  </a>
                </div>
                <small>{{ formatDate(item.createdAt) }}</small>
              </article>
            </div>

            <form class="support-reply-form" @submit.prevent="submitReply">
              <textarea v-model="replyMessage" rows="3" placeholder="Ответ клиенту" />
              <div class="support-reply-actions">
                <label class="support-upload support-upload-compact">
                  <Paperclip class="h-4 w-4" aria-hidden="true" />
                  <span>{{ replyAttachments.length ? `${replyAttachments.length} файл(а)` : "Файл" }}</span>
                  <input type="file" accept="image/*,video/*" multiple @change="updateFiles($event, 'reply')" />
                </label>
                <button class="support-compact-button support-primary-button" type="submit" :disabled="sending">
                  Отправить ответ
                </button>
              </div>
            </form>
          </article>
        </div>
      </div>
    </template>
  </section>
</template>
