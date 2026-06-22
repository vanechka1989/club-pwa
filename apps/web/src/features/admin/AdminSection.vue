<script setup lang="ts">
import type { AdminMute, AdminStatsUser, AdminUser } from "@club/shared";
import { BookOpen, CreditCard, Loader2, Search, Trash2, UsersRound } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import {
  addAdminUser,
  createUserMute,
  getAdminStats,
  getAdminMutes,
  getAdminUserStats,
  getAdminUsers,
  removeAdminUser,
  revokeUserMute,
  updateAdminUserAccess
} from "@/api/client";
import { formatMembershipStatus, useI18n } from "@/features/app/i18n";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type PreviewMembership } from "@/stores/ui";

const { t } = useI18n();
const session = useSessionStore();
const ui = useUiStore();

const blocks = [
  { title: "adminMembers", text: "adminMembersText", icon: UsersRound },
  { title: "adminContent", text: "adminContentText", icon: BookOpen },
  { title: "adminPayments", text: "adminPaymentsText", icon: CreditCard }
] as const;

const previewOptions: Array<{ value: PreviewMembership; label: "previewReal" | "previewInactive" | "previewActive" }> =
  [
    { value: "real", label: "previewReal" },
    { value: "inactive", label: "previewInactive" },
    { value: "active", label: "previewActive" }
  ];

const ownerTelegramId = ref("");
const admins = ref<AdminUser[]>([]);
const statsUsers = ref<AdminStatsUser[]>([]);
const selectedStatsUser = ref<AdminStatsUser | null>(null);
const mutes = ref<AdminMute[]>([]);
const statsTotalUsers = ref(0);
const statsActiveUsers = ref(0);
const statsCompletedItems = ref(0);
const statsTotalItems = ref(0);
const newAdminTelegramId = ref("");
const searchTelegramId = ref("");
const memberSearch = ref("");
const accessTelegramId = ref("");
const accessStatus = ref<"active" | "inactive" | "expired">("active");
const accessExpiresAt = ref("");
const muteTelegramId = ref("");
const muteKind = ref<"temporary" | "permanent">("temporary");
const muteReason = ref("");
const muteExpiresAt = ref("");
const loading = ref(false);
const statsLoading = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);

const isOwner = computed(() => session.user?.role === "owner");
const filteredStatsUsers = computed(() => {
  const query = memberSearch.value.trim().toLowerCase();
  if (!query) {
    return statsUsers.value;
  }

  return statsUsers.value.filter((user) =>
    [user.telegramId, user.firstName ?? "", user.username ?? ""].some((value) => value.toLowerCase().includes(query))
  );
});
const extensionOptions = [
  { days: 7, label: "adminExtend7" },
  { days: 30, label: "adminExtend30" },
  { days: 90, label: "adminExtend90" }
] as const;

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

async function loadAdmins() {
  loading.value = true;
  error.value = null;

  try {
    const response = await getAdminUsers();
    ownerTelegramId.value = response.ownerTelegramId;
    admins.value = response.admins;
  } catch {
    error.value = t("adminError");
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  statsLoading.value = true;
  error.value = null;

  try {
    const response = await getAdminStats();
    statsUsers.value = response.users;
    statsTotalUsers.value = response.totalUsers;
    statsActiveUsers.value = response.activeUsers;
    statsCompletedItems.value = response.completedItems;
    statsTotalItems.value = response.totalItems;
  } catch {
    error.value = t("adminStatsError");
  } finally {
    statsLoading.value = false;
  }
}

async function loadModeration() {
  const mutesResponse = await getAdminMutes();
  mutes.value = mutesResponse.mutes;
}

async function handleFindUser() {
  if (!searchTelegramId.value) {
    return;
  }

  statsLoading.value = true;
  error.value = null;

  try {
    selectedStatsUser.value = await getAdminUserStats(searchTelegramId.value);
    accessTelegramId.value = selectedStatsUser.value.telegramId;
    accessStatus.value = selectedStatsUser.value.membershipStatus === "expired" ? "active" : selectedStatsUser.value.membershipStatus;
    accessExpiresAt.value = selectedStatsUser.value.membershipExpiresAt?.slice(0, 10) ?? "";
  } catch {
    selectedStatsUser.value = null;
    error.value = t("adminStatsError");
  } finally {
    statsLoading.value = false;
  }
}

function openStatsUser(user: AdminStatsUser) {
  selectedStatsUser.value = user;
  accessTelegramId.value = user.telegramId;
  accessStatus.value = user.membershipStatus === "expired" ? "active" : user.membershipStatus;
  accessExpiresAt.value = user.membershipExpiresAt?.slice(0, 10) ?? "";
}

function prepareMuteForUser(user: AdminStatsUser) {
  muteTelegramId.value = user.telegramId;
  muteKind.value = "temporary";
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + 1);
  muteExpiresAt.value = formatDateInput(nextDate);
}

async function handleUpdateAccess() {
  if (!accessTelegramId.value) {
    return;
  }

  saving.value = true;
  message.value = null;
  error.value = null;

  try {
    const expiresAt = accessExpiresAt.value ? new Date(`${accessExpiresAt.value}T23:59:59.000Z`).toISOString() : null;
    const response = await updateAdminUserAccess({
      telegramId: accessTelegramId.value,
      status: accessStatus.value,
      expiresAt
    });
    selectedStatsUser.value = response.user;
    message.value = t("adminAccessSaved");
    await loadStats();
  } catch {
    error.value = t("adminAccessError");
  } finally {
    saving.value = false;
  }
}

async function handleCreateMute() {
  if (!muteTelegramId.value) {
    return;
  }

  saving.value = true;
  try {
    await createUserMute({
      telegramId: muteTelegramId.value,
      kind: muteKind.value,
      reason: muteReason.value || null,
      expiresAt: muteKind.value === "temporary" && muteExpiresAt.value ? new Date(`${muteExpiresAt.value}T23:59:59.000Z`).toISOString() : null
    });
    muteTelegramId.value = "";
    muteReason.value = "";
    muteExpiresAt.value = "";
    await loadModeration();
  } finally {
    saving.value = false;
  }
}

async function handleRevokeMute(id: string) {
  saving.value = true;
  try {
    await revokeUserMute(id);
    await loadModeration();
  } finally {
    saving.value = false;
  }
}

async function handleAddAdmin() {
  saving.value = true;
  message.value = null;
  error.value = null;

  try {
    await addAdminUser(newAdminTelegramId.value);
    newAdminTelegramId.value = "";
    message.value = t("adminSaved");
    await loadAdmins();
  } catch {
    error.value = t("adminError");
  } finally {
    saving.value = false;
  }
}

async function handleRemoveAdmin(telegramId: string) {
  saving.value = true;
  message.value = null;
  error.value = null;

  try {
    await removeAdminUser(telegramId);
    message.value = t("adminSaved");
    await loadAdmins();
  } catch {
    error.value = t("adminError");
  } finally {
    saving.value = false;
  }
}

async function handlePreviewChange(previewMembership: PreviewMembership) {
  ui.setPreviewMembership(previewMembership);
  await session.load();
}

onMounted(() => {
  void loadAdmins();
  void loadStats();
  void loadModeration();
});
</script>

<template>
  <section class="space-y-5">
    <div>
      <p class="section-eyebrow">{{ t("adminEyebrow") }}</p>
      <h2 class="section-title">{{ t("adminTitle") }}</h2>
      <p class="mt-2 text-sm leading-6 text-[var(--muted)]">{{ t("adminIntro") }}</p>
    </div>

    <div class="grid gap-3">
      <article v-for="block in blocks" :key="block.title" class="surface-card">
        <component :is="block.icon" class="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
        <h3 class="mt-3 font-semibold text-[var(--text)]">{{ t(block.title) }}</h3>
        <p class="mt-1 text-sm leading-6 text-[var(--muted)]">{{ t(block.text) }}</p>
      </article>
    </div>

    <section class="surface-card space-y-4">
      <div>
        <h3 class="font-semibold text-[var(--text)]">{{ t("previewTitle") }}</h3>
        <p class="mt-1 text-sm leading-6 text-[var(--muted)]">{{ t("previewText") }}</p>
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
          {{ t(option.label) }}
        </button>
      </div>
    </section>

    <section class="surface-card space-y-4">
      <div>
        <h3 class="font-semibold text-[var(--text)]">{{ t("adminMutesTitle") }}</h3>
        <p class="mt-1 text-sm leading-6 text-[var(--muted)]">{{ t("adminMutesText") }}</p>
      </div>

      <form class="grid gap-2" @submit.prevent="handleCreateMute">
        <input v-model.trim="muteTelegramId" class="text-input" inputmode="numeric" pattern="[0-9]*" :placeholder="t('adminTelegramId')" required />
        <div class="grid grid-cols-2 gap-2">
          <select v-model="muteKind" class="text-input">
            <option value="temporary">{{ t("adminMuteTemporary") }}</option>
            <option value="permanent">{{ t("adminMutePermanent") }}</option>
          </select>
          <input v-model="muteExpiresAt" class="text-input" type="date" :disabled="muteKind === 'permanent'" />
        </div>
        <input v-model.trim="muteReason" class="text-input" :placeholder="t('adminMuteReason')" />
        <button class="primary-button" type="submit" :disabled="saving">{{ t("create") }}</button>
      </form>

      <div class="space-y-2">
        <article v-for="mute in mutes" :key="mute.id" class="rounded-xl border border-[var(--border)] p-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-semibold text-[var(--text)]">{{ mute.telegramId }}</p>
              <p class="mt-1 text-sm text-[var(--muted)]">
                {{ mute.kind === "permanent" ? t("adminMutePermanent") : t("adminMuteTemporary") }}
                <span v-if="mute.expiresAt"> · {{ new Date(mute.expiresAt).toLocaleDateString() }}</span>
                <span v-if="mute.revokedAt"> · снят</span>
              </p>
              <p v-if="mute.reason" class="mt-1 text-sm text-[var(--muted)]">{{ mute.reason }}</p>
            </div>
            <button v-if="!mute.revokedAt" class="secondary-button" type="button" :disabled="saving" @click="handleRevokeMute(mute.id)">
              {{ t("adminRevokeMute") }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="surface-card space-y-4">
      <div>
        <h3 class="font-semibold text-[var(--text)]">{{ t("adminClientStats") }}</h3>
        <p class="mt-1 text-sm leading-6 text-[var(--muted)]">{{ t("adminClientStatsText") }}</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg border border-[var(--border)] p-3">
          <p class="text-xs font-semibold text-[var(--muted)]">{{ t("adminUsersTotal") }}</p>
          <p class="mt-1 text-lg font-semibold text-[var(--text)]">{{ statsTotalUsers }}</p>
        </div>
        <div class="rounded-lg border border-[var(--border)] p-3">
          <p class="text-xs font-semibold text-[var(--muted)]">{{ t("adminUsersActive") }}</p>
          <p class="mt-1 text-lg font-semibold text-[var(--text)]">{{ statsActiveUsers }}</p>
        </div>
        <div class="rounded-lg border border-[var(--border)] p-3">
          <p class="text-xs font-semibold text-[var(--muted)]">{{ t("adminLessonsDone") }}</p>
          <p class="mt-1 text-lg font-semibold text-[var(--text)]">{{ statsCompletedItems }}</p>
        </div>
        <div class="rounded-lg border border-[var(--border)] p-3">
          <p class="text-xs font-semibold text-[var(--muted)]">{{ t("adminLessonsTotal") }}</p>
          <p class="mt-1 text-lg font-semibold text-[var(--text)]">{{ statsTotalItems }}</p>
        </div>
      </div>

      <form class="flex gap-2" @submit.prevent="handleFindUser">
        <input
          v-model.trim="searchTelegramId"
          class="text-input"
          inputmode="numeric"
          pattern="[0-9]*"
          :placeholder="t('adminFindUser')"
        />
        <button class="secondary-button shrink-0" type="submit" :disabled="statsLoading">
          <Search class="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      <div v-if="selectedStatsUser" class="rounded-lg border border-[var(--border)] p-3">
        <p class="font-semibold text-[var(--text)]">
          {{ selectedStatsUser.firstName || selectedStatsUser.username || `Telegram #${selectedStatsUser.telegramId}` }}
        </p>
        <p class="mt-1 text-sm text-[var(--muted)]">
          {{ t("status") }}: {{ formatMembershipStatus(selectedStatsUser.membershipStatus) }} ·
          {{ t("learningProgress") }}: {{ selectedStatsUser.completedItems }}/{{ selectedStatsUser.totalItems }}
        </p>
        <p v-if="selectedStatsUser.lastOpenedItemTitle" class="mt-1 text-sm text-[var(--muted)]">
          {{ t("lastOpenedLesson") }}: {{ selectedStatsUser.lastOpenedItemTitle }}
        </p>
      </div>

      <form class="grid gap-2" @submit.prevent="handleUpdateAccess">
        <input
          v-model.trim="accessTelegramId"
          class="text-input"
          inputmode="numeric"
          pattern="[0-9]*"
          :placeholder="t('adminTelegramId')"
          required
        />
        <div class="grid grid-cols-2 gap-2">
          <select v-model="accessStatus" class="text-input">
            <option value="active">{{ formatMembershipStatus("active") }}</option>
            <option value="inactive">{{ formatMembershipStatus("inactive") }}</option>
            <option value="expired">{{ formatMembershipStatus("expired") }}</option>
          </select>
          <input v-model="accessExpiresAt" class="text-input" type="date" />
        </div>
        <div class="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
          <p class="text-xs font-semibold text-[var(--muted)]">{{ t("adminExtendAccess") }}</p>
          <div class="mt-2 grid grid-cols-3 gap-2">
            <button
              v-for="option in extensionOptions"
              :key="option.days"
              class="secondary-button px-2 py-2 text-sm"
              type="button"
              @click="extendAccess(option.days)"
            >
              {{ t(option.label) }}
            </button>
          </div>
        </div>
        <button class="primary-button" type="submit" :disabled="saving">
          {{ t("adminAccessSave") }}
        </button>
      </form>

      <div v-if="statsLoading" class="flex items-center gap-2 text-sm text-[var(--muted)]">
        <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
        {{ t("loading") }}
      </div>

      <div class="space-y-3">
        <div>
          <h3 class="font-semibold text-[var(--text)]">Участники</h3>
          <p class="mt-1 text-sm text-[var(--muted)]">Просмотр, поиск и быстрые действия по клиентам клуба.</p>
        </div>
        <input v-model.trim="memberSearch" class="text-input" placeholder="Поиск по Telegram ID, имени или username" />
        <div
          v-for="user in filteredStatsUsers"
          :key="user.id"
          class="rounded-lg border border-[var(--border)] p-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-semibold text-[var(--text)]">{{ user.firstName || user.username || user.telegramId }}</p>
              <p class="text-xs text-[var(--muted)]">
                ID {{ user.telegramId }} · {{ formatMembershipStatus(user.membershipStatus) }} · {{ user.completedItems }}/{{ user.totalItems }}
              </p>
            </div>
            <span class="role-badge">{{ formatMembershipStatus(user.membershipStatus) }}</span>
          </div>
          <div class="mt-3 grid grid-cols-3 gap-2">
            <button class="secondary-button px-2 py-2 text-sm" type="button" @click="openStatsUser(user)">
              {{ t("adminOpenUser") }}
            </button>
            <button class="secondary-button px-2 py-2 text-sm" type="button" @click="openStatsUser(user); extendAccess(30)">
              +30 дней
            </button>
            <button class="secondary-button px-2 py-2 text-sm" type="button" @click="prepareMuteForUser(user)">
              Мут
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="surface-card space-y-4">
      <div>
        <h3 class="font-semibold text-[var(--text)]">{{ t("adminManageTitle") }}</h3>
        <p class="mt-1 text-sm leading-6 text-[var(--muted)]">{{ t("adminManageText") }}</p>
      </div>

      <div class="rounded-lg border border-[var(--border)] p-3">
        <p class="text-xs font-semibold text-[var(--muted)]">{{ t("adminOwner") }}</p>
        <p class="mt-1 font-semibold text-[var(--text)]">{{ ownerTelegramId || session.user?.telegramId }}</p>
      </div>

      <form v-if="isOwner" class="flex gap-2" @submit.prevent="handleAddAdmin">
        <input
          v-model.trim="newAdminTelegramId"
          class="text-input"
          inputmode="numeric"
          pattern="[0-9]*"
          :placeholder="t('adminTelegramId')"
          required
        />
        <button class="secondary-button shrink-0" type="submit" :disabled="saving">
          {{ t("adminAdd") }}
        </button>
      </form>
      <p v-else class="text-sm text-[var(--muted)]">{{ t("adminOnlyOwner") }}</p>

      <div v-if="loading" class="flex items-center gap-2 text-sm text-[var(--muted)]">
        <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
        {{ t("loading") }}
      </div>

      <div v-else class="space-y-2">
        <p v-if="!admins.length" class="text-sm text-[var(--muted)]">{{ t("adminListEmpty") }}</p>

        <div
          v-for="admin in admins"
          :key="admin.id"
          class="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3"
        >
          <span class="font-semibold text-[var(--text)]">{{ admin.telegramId }}</span>
          <button
            v-if="isOwner"
            class="icon-button"
            type="button"
            :aria-label="t('adminRemove')"
            :disabled="saving"
            @click="handleRemoveAdmin(admin.telegramId)"
          >
            <Trash2 class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <p v-if="message" class="text-sm text-[var(--muted-strong)]">{{ message }}</p>
      <p v-if="error" class="text-sm text-[var(--danger)]">{{ error }}</p>
    </section>
  </section>
</template>
