<script setup lang="ts">
import type { AdminMute, AdminStatsUser, AdminUser, AdminUserDetailResponse, ClubTopic } from "@club/shared";
import {
  BarChart3,
  Check,
  CreditCard,
  MessageSquare,
  Plus,
  Search,
  Shield,
  ShieldOff,
  Trash2,
  UsersRound,
  type LucideIcon
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import {
  addAdminUser,
  createCommunityTopic,
  createUserMute,
  getAdminMutes,
  getAdminStats,
  getAdminUsers,
  getAdminUserDetail,
  getAdminUserStats,
  getCommunityTopics,
  removeAdminUser,
  revokeUserMute,
  updateAdminUserAccess,
  updateClubTopicSettings
} from "@/api/client";
import { formatMembershipStatus, useI18n } from "@/features/app/i18n";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type PreviewMembership } from "@/stores/ui";

const { t } = useI18n();
const session = useSessionStore();
const ui = useUiStore();

type AdminPanel = "overview" | "users" | "chats" | "mutes" | "admins";

const panels: Array<{ id: AdminPanel; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Обзор", icon: BarChart3 },
  { id: "users", label: "Клиенты", icon: UsersRound },
  { id: "chats", label: "Чаты", icon: MessageSquare },
  { id: "mutes", label: "Муты", icon: ShieldOff },
  { id: "admins", label: "Админы", icon: Shield }
];

const previewOptions: Array<{ value: PreviewMembership; label: string }> = [
  { value: "real", label: "Как есть" },
  { value: "inactive", label: "Без доступа" },
  { value: "active", label: "С доступом" }
];

const extensionOptions = [
  { days: 7, label: "+7 дней" },
  { days: 30, label: "+30 дней" },
  { days: 90, label: "+90 дней" }
] as const;

const muteQuickOptions = [
  { label: "30 минут", minutes: 30 },
  { label: "1 час", minutes: 60 },
  { label: "6 часов", minutes: 360 },
  { label: "24 часа", minutes: 1440 },
  { label: "Бессрочно", minutes: null }
] as const;

const activePanel = ref<AdminPanel>("overview");
const ownerTelegramId = ref("");
const admins = ref<AdminUser[]>([]);
const users = ref<AdminStatsUser[]>([]);
const selectedUser = ref<AdminStatsUser | null>(null);
const selectedUserDetail = ref<AdminUserDetailResponse | null>(null);
const chats = ref<ClubTopic[]>([]);
const mutes = ref<AdminMute[]>([]);
const search = ref("");
const subscriptionFilter = ref<"all" | "active" | "inactive" | "expired">("all");
const tariffFilter = ref("all");
const findTelegramId = ref("");
const accessStatus = ref<"active" | "inactive" | "expired">("active");
const accessExpiresAt = ref("");
const newChatTitle = ref("");
const newChatDescription = ref("");
const muteTelegramId = ref("");
const muteKind = ref<"temporary" | "permanent">("temporary");
const muteExpiresAt = ref("");
const muteReason = ref("");
const newAdminTelegramId = ref("");
const loading = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);

const isOwner = computed(() => session.user?.role === "owner");
const totalUsers = computed(() => users.value.length);
const activeUsers = computed(() => users.value.filter((user) => user.membershipStatus === "active").length);
const activeMutes = computed(() => mutes.value.filter((mute) => !mute.revokedAt).length);
const visibleChats = computed(() => chats.value.filter((chat) => chat.isPublished));
const archivedChats = computed(() => chats.value.filter((chat) => !chat.isPublished));
const tariffOptions = computed(() => {
  const values = new Set(users.value.map((user) => user.tariff || "future").filter(Boolean));
  return ["all", ...Array.from(values)];
});
const filteredUsers = computed(() => {
  const query = search.value.trim().toLowerCase();
  return users.value.filter((user) => {
    const matchesQuery =
      !query || [user.telegramId, user.firstName ?? "", user.username ?? ""].some((value) => value.toLowerCase().includes(query));
    const matchesSubscription = subscriptionFilter.value === "all" || user.membershipStatus === subscriptionFilter.value;
    const matchesTariff = tariffFilter.value === "all" || (user.tariff || "future") === tariffFilter.value;
    return matchesQuery && matchesSubscription && matchesTariff;
  });
});

function userTitle(user: AdminStatsUser) {
  return user.firstName || user.username || `ID ${user.telegramId}`;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function applySelectedUser(user: AdminStatsUser) {
  selectedUser.value = user;
  findTelegramId.value = user.telegramId;
  accessStatus.value = user.membershipStatus === "expired" ? "active" : user.membershipStatus;
  accessExpiresAt.value = user.membershipExpiresAt?.slice(0, 10) ?? "";
  muteTelegramId.value = user.telegramId;
}

async function selectUser(user: AdminStatsUser) {
  applySelectedUser(user);
  try {
    selectedUserDetail.value = await getAdminUserDetail(user.telegramId);
    applySelectedUser(selectedUserDetail.value.user);
  } catch {
    selectedUserDetail.value = null;
    setError("Не удалось загрузить карточку клиента.");
  }
}

function extendAccess(days: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentExpiry = accessExpiresAt.value ? new Date(`${accessExpiresAt.value}T00:00:00`) : null;
  const baseDate = currentExpiry && currentExpiry > today ? currentExpiry : today;
  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + days);
  accessStatus.value = "active";
  accessExpiresAt.value = formatDateInput(nextDate);
}

function setStatus(text: string) {
  message.value = text;
  error.value = null;
}

function setError(text: string) {
  error.value = text;
  message.value = null;
}

async function loadAll() {
  loading.value = true;
  try {
    const [adminsResponse, statsResponse, chatsResponse, mutesResponse] = await Promise.all([
      getAdminUsers(),
      getAdminStats(),
      getCommunityTopics(),
      getAdminMutes()
    ]);
    ownerTelegramId.value = adminsResponse.ownerTelegramId;
    admins.value = adminsResponse.admins;
    users.value = statsResponse.users;
    chats.value = chatsResponse.topics;
    mutes.value = mutesResponse.mutes;
    if (selectedUser.value) {
      const updated = statsResponse.users.find((user) => user.telegramId === selectedUser.value?.telegramId);
      if (updated) {
        applySelectedUser(updated);
      }
    }
  } catch {
    setError("Не удалось загрузить админку.");
  } finally {
    loading.value = false;
  }
}

async function handleFindUser() {
  if (!findTelegramId.value.trim()) {
    return;
  }

  saving.value = true;
  try {
    const user = await getAdminUserStats(findTelegramId.value);
    applySelectedUser(user);
    selectedUserDetail.value = await getAdminUserDetail(user.telegramId);
    if (!users.value.some((item) => item.telegramId === user.telegramId)) {
      users.value = [user, ...users.value];
    }
    setStatus("Клиент найден.");
  } catch {
    setError("Клиент не найден.");
  } finally {
    saving.value = false;
  }
}

async function handleUpdateAccess() {
  const telegramId = selectedUser.value?.telegramId || findTelegramId.value.trim();
  if (!telegramId) {
    return;
  }

  saving.value = true;
  try {
    const response = await updateAdminUserAccess({
      telegramId,
      status: accessStatus.value,
      expiresAt: accessExpiresAt.value ? new Date(`${accessExpiresAt.value}T23:59:59.000Z`).toISOString() : null
    });
    applySelectedUser(response.user);
    selectedUserDetail.value = await getAdminUserDetail(response.user.telegramId);
    await loadAll();
    setStatus("Доступ сохранён.");
  } catch {
    setError("Не удалось сохранить доступ.");
  } finally {
    saving.value = false;
  }
}

async function handleCreateChat() {
  if (!newChatTitle.value.trim()) {
    return;
  }

  saving.value = true;
  try {
    const response = await createCommunityTopic({
      title: newChatTitle.value,
      description: newChatDescription.value || null
    });
    chats.value = [response.topic, ...chats.value];
    newChatTitle.value = "";
    newChatDescription.value = "";
    setStatus("Чат создан.");
  } catch {
    setError("Не удалось создать чат.");
  } finally {
    saving.value = false;
  }
}

async function handleChatSettings(chat: ClubTopic, patch: Partial<Pick<ClubTopic, "isLocked" | "isPublished">>) {
  saving.value = true;
  try {
    const response = await updateClubTopicSettings(chat.id, patch);
    chats.value = chats.value.map((item) => (item.id === chat.id ? response.topic : item));
    setStatus("Настройки чата сохранены.");
  } catch {
    setError("Не удалось обновить чат.");
  } finally {
    saving.value = false;
  }
}

function prepareMute(user: AdminStatsUser, minutes: number | null = 1440) {
  muteTelegramId.value = user.telegramId;
  muteKind.value = minutes === null ? "permanent" : "temporary";
  if (minutes === null) {
    muteExpiresAt.value = "";
    return;
  }

  const expires = new Date(Date.now() + minutes * 60 * 1000);
  muteExpiresAt.value = formatDateInput(expires);
}

async function handleCreateMute() {
  if (!muteTelegramId.value.trim()) {
    return;
  }

  saving.value = true;
  try {
    await createUserMute({
      telegramId: muteTelegramId.value,
      kind: muteKind.value,
      reason: muteReason.value || null,
      expiresAt:
        muteKind.value === "temporary" && muteExpiresAt.value
          ? new Date(`${muteExpiresAt.value}T23:59:59.000Z`).toISOString()
          : null
    });
    muteReason.value = "";
    const response = await getAdminMutes();
    mutes.value = response.mutes;
    setStatus("Мут выдан.");
  } catch {
    setError("Не удалось выдать мут.");
  } finally {
    saving.value = false;
  }
}

async function handleQuickMute(user: AdminStatsUser, minutes: number | null) {
  prepareMute(user, minutes);
  await handleCreateMute();
}

async function handleRevokeMute(id: string) {
  saving.value = true;
  try {
    await revokeUserMute(id);
    const response = await getAdminMutes();
    mutes.value = response.mutes;
    setStatus("Мут снят.");
  } catch {
    setError("Не удалось снять мут.");
  } finally {
    saving.value = false;
  }
}

async function handleAddAdmin() {
  if (!newAdminTelegramId.value.trim()) {
    return;
  }

  saving.value = true;
  try {
    await addAdminUser(newAdminTelegramId.value);
    newAdminTelegramId.value = "";
    const response = await getAdminUsers();
    admins.value = response.admins;
    ownerTelegramId.value = response.ownerTelegramId;
    setStatus("Админ добавлен.");
  } catch {
    setError("Не удалось добавить админа.");
  } finally {
    saving.value = false;
  }
}

async function handleRemoveAdmin(telegramId: string) {
  saving.value = true;
  try {
    await removeAdminUser(telegramId);
    const response = await getAdminUsers();
    admins.value = response.admins;
    ownerTelegramId.value = response.ownerTelegramId;
    setStatus("Админ удалён.");
  } catch {
    setError("Не удалось удалить админа.");
  } finally {
    saving.value = false;
  }
}

async function handlePreviewChange(previewMembership: PreviewMembership) {
  ui.setPreviewMembership(previewMembership);
  await session.load();
}

onMounted(() => {
  void loadAll();
});
</script>

<template>
  <section class="admin-shell">
    <header class="admin-hero">
      <div>
        <p class="section-eyebrow">Админка</p>
        <h2 class="section-title">Управление клубом</h2>
      </div>
      <button class="secondary-button admin-refresh" type="button" :disabled="loading" @click="loadAll">
        Обновить
      </button>
    </header>

    <div class="admin-tabs">
      <button
        v-for="panel in panels"
        :key="panel.id"
        class="admin-tab"
        :class="{ 'admin-tab-active': activePanel === panel.id }"
        type="button"
        @click="activePanel = panel.id"
      >
        <component :is="panel.icon" class="h-4 w-4" aria-hidden="true" />
        <span>{{ panel.label }}</span>
      </button>
    </div>

    <p v-if="message" class="admin-status admin-status-ok">{{ message }}</p>
    <p v-if="error" class="admin-status admin-status-error">{{ error }}</p>

    <section v-if="activePanel === 'overview'" class="admin-grid">
      <article class="admin-card">
        <span class="admin-card-label">Клиенты</span>
        <strong>{{ totalUsers }}</strong>
        <small>{{ activeUsers }} активных</small>
      </article>
      <article class="admin-card">
        <span class="admin-card-label">Чаты</span>
        <strong>{{ visibleChats.length }}</strong>
        <small>{{ archivedChats.length }} в архиве</small>
      </article>
      <article class="admin-card">
        <span class="admin-card-label">Муты</span>
        <strong>{{ activeMutes }}</strong>
        <small>{{ mutes.length }} всего</small>
      </article>
      <article class="admin-card">
        <span class="admin-card-label">Админы</span>
        <strong>{{ admins.length + 1 }}</strong>
        <small>включая владельца</small>
      </article>

      <article class="admin-panel admin-panel-wide">
        <div class="admin-panel-head">
          <div>
            <h3>Предпросмотр клиента</h3>
            <p>Быстро проверить, как клиент видит клуб при разном статусе доступа.</p>
          </div>
        </div>
        <div class="segmented-control">
          <button
            v-for="option in previewOptions"
            :key="option.value"
            class="segmented-control-item"
            :class="{ 'segmented-control-item-active': ui.previewMembership === option.value }"
            type="button"
            :disabled="!isOwner"
            @click="handlePreviewChange(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </article>
    </section>

    <section v-else-if="activePanel === 'users'" class="admin-panel">
      <div class="admin-panel-head">
        <div>
          <h3>Клиенты и доступ</h3>
          <p>Поиск, продление доступа, быстрый мут и просмотр статистики.</p>
        </div>
      </div>

      <form class="admin-search-row" @submit.prevent="handleFindUser">
        <input v-model.trim="findTelegramId" class="text-input" inputmode="numeric" pattern="[0-9]*" placeholder="Telegram ID клиента" />
        <button class="icon-button" type="submit" :disabled="saving">
          <Search class="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      <div class="admin-filter-grid">
        <input v-model.trim="search" class="text-input" placeholder="Поиск по ID, имени или username" />
        <select v-model="subscriptionFilter" class="text-input">
          <option value="all">Все подписки</option>
          <option value="active">Активные</option>
          <option value="inactive">Неактивные</option>
          <option value="expired">Истекшие</option>
        </select>
        <select v-model="tariffFilter" class="text-input">
          <option v-for="tariff in tariffOptions" :key="tariff" :value="tariff">
            {{ tariff === "all" ? "Все тарифы" : tariff }}
          </option>
        </select>
      </div>

      <div class="admin-user-layout">
        <div class="admin-list">
          <button
            v-for="user in filteredUsers"
            :key="user.id"
            class="admin-list-item"
            :class="{ 'admin-list-item-active': selectedUser?.id === user.id }"
            type="button"
            @click="selectUser(user)"
          >
            <span>
              <strong>{{ userTitle(user) }}</strong>
              <small>ID {{ user.telegramId }} · {{ user.tariff || "future" }} · {{ user.completedItems }}/{{ user.totalItems }}</small>
            </span>
            <em>{{ formatMembershipStatus(user.membershipStatus) }}</em>
          </button>
        </div>

        <aside class="admin-detail">
          <template v-if="selectedUser">
            <div>
              <h3>{{ userTitle(selectedUser) }}</h3>
              <p>ID {{ selectedUser.telegramId }} · тариф {{ selectedUser.tariff || "future" }}</p>
            </div>
            <div class="admin-detail-stats">
              <span>{{ formatMembershipStatus(selectedUser.membershipStatus) }}</span>
              <span>{{ selectedUser.completedItems }}/{{ selectedUser.totalItems }} уроков</span>
              <span v-if="selectedUser.membershipExpiresAt">до {{ new Date(selectedUser.membershipExpiresAt).toLocaleDateString("ru-RU") }}</span>
            </div>
            <p v-if="selectedUser.lastOpenedItemTitle" class="admin-muted-line">
              Последний урок: {{ selectedUser.lastOpenedItemTitle }}
            </p>

            <form class="admin-form" @submit.prevent="handleUpdateAccess">
              <select v-model="accessStatus" class="text-input">
                <option value="active">{{ formatMembershipStatus("active") }}</option>
                <option value="inactive">{{ formatMembershipStatus("inactive") }}</option>
                <option value="expired">{{ formatMembershipStatus("expired") }}</option>
              </select>
              <input v-model="accessExpiresAt" class="text-input" type="date" />
              <div class="admin-inline-actions">
                <button v-for="option in extensionOptions" :key="option.days" class="secondary-button" type="button" @click="extendAccess(option.days)">
                  {{ option.label }}
                </button>
              </div>
              <button class="primary-button" type="submit" :disabled="saving">Сохранить доступ</button>
            </form>

            <div class="admin-inline-actions">
              <button
                v-for="option in muteQuickOptions"
                :key="option.label"
                class="secondary-button"
                type="button"
                :disabled="saving"
                @click="handleQuickMute(selectedUser, option.minutes)"
              >
                Мут {{ option.label }}
              </button>
            </div>

            <section class="admin-crm-block">
              <h4>Подписки</h4>
              <p v-if="!selectedUserDetail?.subscriptions.length" class="admin-empty">Истории подписок пока нет.</p>
              <article v-for="subscription in selectedUserDetail?.subscriptions ?? []" :key="subscription.id" class="admin-history-item">
                <strong>{{ formatMembershipStatus(subscription.status) }}</strong>
                <span>{{ subscription.tariff || "future" }} · {{ subscription.provider }}</span>
                <small>
                  {{ new Date(subscription.createdAt).toLocaleDateString("ru-RU") }}
                  <template v-if="subscription.expiresAt"> · до {{ new Date(subscription.expiresAt).toLocaleDateString("ru-RU") }}</template>
                </small>
              </article>
            </section>

            <section class="admin-crm-block">
              <h4>Ограничения и удалённые сообщения</h4>
              <p v-if="!selectedUserDetail?.moderationEvents.length" class="admin-empty">Ограничений и удалений пока нет.</p>
              <article v-for="event in selectedUserDetail?.moderationEvents ?? []" :key="`${event.kind}-${event.id}`" class="admin-history-item">
                <strong>
                  {{ event.kind === "mute" ? "Мут" : event.kind === "chat_message" ? "Сообщение" : "Комментарий" }}
                  · {{ event.status }}
                </strong>
                <span v-if="event.sourceTitle">{{ event.sourceTitle }}</span>
                <p v-if="event.body">{{ event.body }}</p>
                <small>
                  {{ new Date(event.createdAt).toLocaleString("ru-RU") }}
                  <template v-if="event.resolvedAt"> · обработано {{ new Date(event.resolvedAt).toLocaleString("ru-RU") }}</template>
                </small>
              </article>
            </section>
          </template>
          <p v-else class="admin-empty">Выберите клиента из списка или найдите по Telegram ID.</p>
        </aside>
      </div>
    </section>

    <section v-else-if="activePanel === 'chats'" class="admin-panel">
      <div class="admin-panel-head">
        <div>
          <h3>Темы общения</h3>
          <p>Создание, закрытие и архивирование чатов.</p>
        </div>
      </div>

      <form class="admin-form" @submit.prevent="handleCreateChat">
        <input v-model.trim="newChatTitle" class="text-input" placeholder="Название чата" />
        <input v-model.trim="newChatDescription" class="text-input" placeholder="Описание, необязательно" />
        <button class="primary-button" type="submit" :disabled="saving">
          <Plus class="h-4 w-4" aria-hidden="true" />
          Создать чат
        </button>
      </form>

      <div class="admin-list">
        <article v-for="chat in chats" :key="chat.id" class="admin-entity">
          <div>
            <strong>{{ chat.title }}</strong>
            <small>
              {{ chat.messagesCount }} сообщений
              <span v-if="chat.isLocked"> · закрыт</span>
              <span v-if="!chat.isPublished"> · архив</span>
            </small>
          </div>
          <div class="admin-inline-actions">
            <button class="secondary-button" type="button" :disabled="saving" @click="handleChatSettings(chat, { isLocked: !chat.isLocked })">
              {{ chat.isLocked ? "Открыть" : "Закрыть" }}
            </button>
            <button class="secondary-button" type="button" :disabled="saving" @click="handleChatSettings(chat, { isPublished: !chat.isPublished })">
              {{ chat.isPublished ? "В архив" : "Вернуть" }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <section v-else-if="activePanel === 'mutes'" class="admin-panel">
      <div class="admin-panel-head">
        <div>
          <h3>Муты</h3>
          <p>Выдача и снятие ограничений на комментарии и чат.</p>
        </div>
      </div>

      <form class="admin-form" @submit.prevent="handleCreateMute">
        <input v-model.trim="muteTelegramId" class="text-input" inputmode="numeric" pattern="[0-9]*" placeholder="Telegram ID клиента" />
        <div class="admin-two-cols">
          <select v-model="muteKind" class="text-input">
            <option value="temporary">Временный</option>
            <option value="permanent">Бессрочный</option>
          </select>
          <input v-model="muteExpiresAt" class="text-input" type="date" :disabled="muteKind === 'permanent'" />
        </div>
        <input v-model.trim="muteReason" class="text-input" placeholder="Причина, необязательно" />
        <button class="primary-button" type="submit" :disabled="saving">Выдать мут</button>
      </form>

      <div class="admin-list">
        <article v-for="mute in mutes" :key="mute.id" class="admin-entity">
          <div>
            <strong>ID {{ mute.telegramId }}</strong>
            <small>
              {{ mute.kind === "permanent" ? "Бессрочно" : "Временно" }}
              <span v-if="mute.expiresAt"> · до {{ new Date(mute.expiresAt).toLocaleDateString("ru-RU") }}</span>
              <span v-if="mute.revokedAt"> · снят</span>
            </small>
            <p v-if="mute.reason">{{ mute.reason }}</p>
          </div>
          <button v-if="!mute.revokedAt" class="secondary-button" type="button" :disabled="saving" @click="handleRevokeMute(mute.id)">
            Снять
          </button>
        </article>
      </div>
    </section>

    <section v-else class="admin-panel">
      <div class="admin-panel-head">
        <div>
          <h3>Администраторы</h3>
          <p>Владелец и список администраторов клуба.</p>
        </div>
      </div>

      <article class="admin-entity">
        <div>
          <strong>Владелец</strong>
          <small>ID {{ ownerTelegramId || session.user?.telegramId }}</small>
        </div>
        <Check class="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
      </article>

      <form v-if="isOwner" class="admin-search-row" @submit.prevent="handleAddAdmin">
        <input v-model.trim="newAdminTelegramId" class="text-input" inputmode="numeric" pattern="[0-9]*" placeholder="Telegram ID нового админа" />
        <button class="primary-button admin-add-button" type="submit" :disabled="saving">Добавить</button>
      </form>
      <p v-else class="admin-empty">Добавлять и удалять админов может только владелец.</p>

      <div class="admin-list">
        <article v-for="admin in admins" :key="admin.id" class="admin-entity">
          <div>
            <strong>ID {{ admin.telegramId }}</strong>
            <small>Добавлен {{ new Date(admin.createdAt).toLocaleDateString("ru-RU") }}</small>
          </div>
          <button v-if="isOwner" class="icon-button" type="button" :disabled="saving" @click="handleRemoveAdmin(admin.telegramId)">
            <Trash2 class="h-4 w-4" aria-hidden="true" />
          </button>
        </article>
      </div>
    </section>
  </section>
</template>
