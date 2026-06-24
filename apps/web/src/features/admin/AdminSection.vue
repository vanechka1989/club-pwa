<script setup lang="ts">
import type { AdminMute, AdminStatsUser, AdminUser, AdminUserDetailResponse } from "@club/shared";
import {
  BarChart3,
  Check,
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
  createUserMute,
  getAdminMutes,
  getAdminStats,
  getAdminUsers,
  getAdminUserDetail,
  getAdminUserStats,
  removeAdminUser,
  revokeUserMute,
  updateAdminUserAccess,
} from "@/api/client";
import { formatMembershipStatus, useI18n } from "@/features/app/i18n";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type PreviewMode } from "@/stores/ui";

const { t } = useI18n();
const session = useSessionStore();
const ui = useUiStore();

type AdminPanel = "overview" | "users" | "mutes" | "admins";

const panels: Array<{ id: AdminPanel; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Обзор", icon: BarChart3 },
  { id: "users", label: "Клиенты", icon: UsersRound },
  { id: "mutes", label: "Муты", icon: ShieldOff },
  { id: "admins", label: "Админы", icon: Shield }
];

const previewOptions: Array<{ value: PreviewMode; label: string }> = [
  { value: "developer", label: "Разработчик" },
  { value: "admin", label: "Админ" },
  { value: "member-active", label: "С доступом" },
  { value: "member-inactive", label: "Без доступа" }
];

const extensionOptions = [
  { days: 7, label: "+7 дней" },
  { days: 30, label: "+30 дней" },
  { days: 90, label: "+90 дней" }
] as const;

const activePanel = ref<AdminPanel>("overview");
const ownerTelegramId = ref("");
const admins = ref<AdminUser[]>([]);
const users = ref<AdminStatsUser[]>([]);
const selectedUser = ref<AdminStatsUser | null>(null);
const selectedUserDetail = ref<AdminUserDetailResponse | null>(null);
const mutes = ref<AdminMute[]>([]);
const search = ref("");
const subscriptionFilter = ref<"all" | "active" | "inactive" | "expired">("all");
const tariffFilter = ref("all");
const findTelegramId = ref("");
const accessStatus = ref<"active" | "inactive" | "expired">("active");
const accessExpiresAt = ref("");
const muteTelegramId = ref("");
const muteReason = ref("");
const newAdminTelegramId = ref("");
const loading = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);

const isOwner = computed(() => session.user?.realRole === "owner");
const totalUsers = computed(() => users.value.length);
const activeUsers = computed(() => users.value.filter((user) => user.membershipStatus === "active").length);
const activeMutes = computed(() => mutes.value.filter((mute) => !mute.revokedAt).length);
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

function muteTitle(mute: AdminMute) {
  return mute.firstName || mute.username || `ID ${mute.telegramId}`;
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
    const [adminsResponse, statsResponse, mutesResponse] = await Promise.all([
      getAdminUsers(),
      getAdminStats(),
      getAdminMutes()
    ]);
    ownerTelegramId.value = adminsResponse.ownerTelegramId;
    admins.value = adminsResponse.admins;
    users.value = statsResponse.users;
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

function prepareMute(user: AdminStatsUser) {
  muteTelegramId.value = user.telegramId;
}

async function handleCreateMute() {
  if (!muteTelegramId.value.trim()) {
    return;
  }

  saving.value = true;
  try {
    await createUserMute({
      telegramId: muteTelegramId.value,
      kind: "permanent",
      reason: muteReason.value || null,
      expiresAt: null
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

async function handleQuickMute(user: AdminStatsUser) {
  prepareMute(user);
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

async function handlePreviewChange(previewMode: PreviewMode) {
  ui.setPreviewMode(previewMode);
  await session.load();
}

onMounted(() => {
  void loadAll();
});
</script>

<template>
  <section class="admin-shell">
    <header class="section-head">
      <div>
        <h2 class="section-title">Админка</h2>
        <p class="section-subtitle">Клиенты, доступ и ограничения.</p>
      </div>
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
            <p>Проверить интерфейс в разных ролях и статусах доступа.</p>
          </div>
        </div>
        <div class="segmented-control">
          <button
            v-for="option in previewOptions"
            :key="option.value"
            class="segmented-control-item"
            :class="{ 'segmented-control-item-active': ui.previewMode === option.value }"
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

        <aside class="admin-detail" :class="{ 'admin-detail-empty': !selectedUser }">
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
              <button class="secondary-button" type="button" :disabled="saving" @click="handleQuickMute(selectedUser)">
                Мут пока не снимут
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

    <section v-else-if="activePanel === 'mutes'" class="admin-panel">
      <div class="admin-panel-head">
        <div>
          <h3>Муты</h3>
          <p>Выдача и снятие ограничений на комментарии и чат.</p>
        </div>
      </div>

      <form class="admin-form" @submit.prevent="handleCreateMute">
        <input v-model.trim="muteTelegramId" class="text-input" inputmode="numeric" pattern="[0-9]*" placeholder="Telegram ID клиента" />
        <input v-model.trim="muteReason" class="text-input" placeholder="Причина, необязательно" />
        <button class="primary-button" type="submit" :disabled="saving">Выдать мут пока не снимут</button>
      </form>

      <div class="admin-list">
        <article v-for="mute in mutes" :key="mute.id" class="admin-entity">
          <div>
            <strong>{{ muteTitle(mute) }}</strong>
            <small>
              ID {{ mute.telegramId }} ·
              Мут пока не снимут
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
