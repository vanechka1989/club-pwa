<script setup lang="ts">
import type { AdminLearningMaterial, AdminStatsUser, AdminUser, AdminUserDetailResponse, ContentKind, LearningCategory } from "@club/shared";
import {
  BarChart3,
  Check,
  FileVideo,
  Search,
  Shield,
  Trash2,
  UsersRound,
  X,
  type LucideIcon
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import {
  addAdminUser,
  createAdminLearningCategory,
  createAdminLearningMaterial,
  createUserMute,
  deleteAdminLearningCategory,
  deleteAdminLearningMaterial,
  getAdminLearning,
  getAdminStats,
  getAdminUsers,
  getAdminUserDetail,
  getAdminUserStats,
  removeAdminUser,
  revokeUserMute,
  updateAdminLearningMaterialStatus,
  updateAdminUserAccess,
} from "@/api/client";
import { formatMembershipStatus } from "@/features/app/i18n";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type PreviewMode } from "@/stores/ui";

const session = useSessionStore();
const ui = useUiStore();

type AdminPanel = "overview" | "users" | "materials" | "admins";

const panels: Array<{ id: AdminPanel; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Обзор", icon: BarChart3 },
  { id: "users", label: "Клиенты", icon: UsersRound },
  { id: "materials", label: "Записи", icon: FileVideo },
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
const learningCategories = ref<LearningCategory[]>([]);
const learningMaterials = ref<AdminLearningMaterial[]>([]);
const search = ref("");
const subscriptionFilter = ref<"all" | "active" | "inactive" | "expired">("all");
const tariffFilter = ref("all");
const restrictionFilter = ref<"all" | "restricted">("all");
const findTelegramId = ref("");
const accessStatus = ref<"active" | "inactive" | "expired">("active");
const accessExpiresAt = ref("");
const materialCategoryId = ref("");
const materialKind = ref<ContentKind>("text");
const materialTitle = ref("");
const materialSummary = ref("");
const materialBody = ref("");
const materialPublished = ref(true);
const materialFile = ref<File | null>(null);
const categoryTitle = ref("");
const categoryDescription = ref("");
const showMaterialModal = ref(false);
const editorRef = ref<HTMLElement | null>(null);
const editorColor = ref("#111827");
const newAdminTelegramId = ref("");
const loading = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);

const isOwner = computed(() => session.user?.realRole === "owner");
const canManageSelectedUser = computed(() => isOwner.value || selectedUser.value?.role === "member");
const totalUsers = computed(() => users.value.length);
const activeUsers = computed(() => users.value.filter((user) => user.membershipStatus === "active").length);
const restrictedUsers = computed(() => users.value.filter((user) => user.hasRestrictions).length);
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
    const matchesRestrictions = restrictionFilter.value === "all" || user.hasRestrictions;
    return matchesQuery && matchesSubscription && matchesTariff && matchesRestrictions;
  });
});
const materialsByCategory = computed(() =>
  learningCategories.value.map((category) => ({
    category,
    materials: learningMaterials.value.filter((material) => material.categoryId === category.id)
  }))
);

function userTitle(user: AdminStatsUser) {
  return user.firstName || user.username || `ID ${user.telegramId}`;
}

function adminRoleLabel(role: AdminStatsUser["role"]) {
  if (role === "owner") {
    return "Главный админ";
  }

  if (role === "admin") {
    return "Админ";
  }

  return "Клиент";
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
}

function closeSelectedUser() {
  selectedUser.value = null;
  selectedUserDetail.value = null;
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

function showSuccessAlert(text: string) {
  setStatus(text);
  const showAlert = window.Telegram?.WebApp?.showAlert;
  if (showAlert) {
    showAlert(text);
  } else {
    window.alert(text);
  }
}

async function loadAll() {
  loading.value = true;
  try {
    const [adminsResponse, statsResponse, learningResponse] = await Promise.all([
      getAdminUsers(),
      getAdminStats(),
      getAdminLearning()
    ]);
    ownerTelegramId.value = adminsResponse.ownerTelegramId;
    admins.value = adminsResponse.admins;
    users.value = statsResponse.users;
    learningCategories.value = learningResponse.categories;
    learningMaterials.value = learningResponse.materials;
    if (!materialCategoryId.value && learningResponse.categories[0]) {
      materialCategoryId.value = learningResponse.categories[0].id;
    }
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
  if (selectedUser.value && !canManageSelectedUser.value) {
    setError("Менять доступ администраторов может только главный админ.");
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

async function handleQuickMute(user: AdminStatsUser) {
  if (!isOwner.value && user.role !== "member") {
    setError("Ограничивать администраторов может только главный админ.");
    return;
  }

  saving.value = true;
  try {
    await createUserMute({
      telegramId: user.telegramId,
      kind: "permanent",
      reason: "Ограничение из карточки клиента",
      expiresAt: null
    });
    selectedUserDetail.value = await getAdminUserDetail(user.telegramId);
    await loadAll();
    setStatus("Мут выдан.");
  } catch {
    setError(user.hasRestrictions ? "У клиента уже есть активное ограничение." : "Не удалось выдать мут.");
  } finally {
    saving.value = false;
  }
}

async function handleRevokeMute(id: string) {
  if (!selectedUser.value) {
    return;
  }

  saving.value = true;
  try {
    await revokeUserMute(id);
    selectedUserDetail.value = await getAdminUserDetail(selectedUser.value.telegramId);
    await loadAll();
    setStatus("Мут снят.");
  } catch {
    setError("Не удалось снять мут.");
  } finally {
    saving.value = false;
  }
}

function handleMaterialFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  materialFile.value = input.files?.[0] ?? null;
}

function resetMaterialForm() {
  materialTitle.value = "";
  materialSummary.value = "";
  materialBody.value = "";
  materialKind.value = "text";
  materialPublished.value = true;
  materialFile.value = null;
  if (editorRef.value) {
    editorRef.value.innerHTML = "";
  }
}

function openMaterialModal() {
  if (!materialCategoryId.value && learningCategories.value[0]) {
    materialCategoryId.value = learningCategories.value[0].id;
  }
  showMaterialModal.value = true;
}

function closeMaterialModal() {
  showMaterialModal.value = false;
}

function syncEditorBody() {
  materialBody.value = editorRef.value?.innerHTML ?? "";
}

function applyEditorCommand(command: string, value?: string) {
  editorRef.value?.focus();
  document.execCommand(command, false, value);
  syncEditorBody();
}

async function handleCreateMaterial() {
  if (!materialCategoryId.value || !materialTitle.value.trim()) {
    setError("Укажите категорию и название записи.");
    return;
  }
  if (materialKind.value !== "text" && !materialFile.value) {
    setError("Для фото, видео и аудио нужен файл.");
    return;
  }

  const form = new FormData();
  form.set("categoryId", materialCategoryId.value);
  form.set("kind", materialKind.value);
  form.set("title", materialTitle.value.trim());
  form.set("summary", materialSummary.value.trim());
  form.set("body", materialBody.value.trim());
  form.set("isPublished", String(materialPublished.value));
  if (materialFile.value) {
    form.set("file", materialFile.value);
  }

  saving.value = true;
  try {
    const response = await createAdminLearningMaterial(form);
    learningMaterials.value = [response.material, ...learningMaterials.value];
    learningCategories.value = learningCategories.value.map((category) =>
      category.id === response.material.categoryId ? { ...category, itemsCount: category.itemsCount + 1 } : category
    );
    resetMaterialForm();
    closeMaterialModal();
    showSuccessAlert("Запись добавлена.");
  } catch {
    setError("Не удалось добавить запись.");
  } finally {
    saving.value = false;
  }
}

async function handleToggleMaterial(material: AdminLearningMaterial) {
  saving.value = true;
  try {
    const response = await updateAdminLearningMaterialStatus(material.id, !material.isPublished);
    learningMaterials.value = learningMaterials.value.map((item) => (item.id === material.id ? response.material : item));
    setStatus(response.material.isPublished ? "Запись открыта." : "Запись скрыта.");
  } catch {
    setError("Не удалось изменить доступность записи.");
  } finally {
    saving.value = false;
  }
}

async function handleCreateCategory() {
  if (!categoryTitle.value.trim()) {
    setError("Укажите название категории.");
    return;
  }

  saving.value = true;
  try {
    const response = await createAdminLearningCategory({
      title: categoryTitle.value.trim(),
      description: categoryDescription.value.trim() || null
    });
    learningCategories.value = [...learningCategories.value, response.category];
    materialCategoryId.value = response.category.id;
    categoryTitle.value = "";
    categoryDescription.value = "";
    showSuccessAlert("Категория добавлена.");
  } catch {
    setError("Не удалось добавить категорию.");
  } finally {
    saving.value = false;
  }
}

async function handleDeleteCategory(category: LearningCategory) {
  const confirmed = window.confirm(`Удалить категорию "${category.title}" и все записи внутри неё?`);
  if (!confirmed) {
    return;
  }

  saving.value = true;
  try {
    await deleteAdminLearningCategory(category.id);
    learningCategories.value = learningCategories.value.filter((item) => item.id !== category.id);
    learningMaterials.value = learningMaterials.value.filter((item) => item.categoryId !== category.id);
    if (materialCategoryId.value === category.id) {
      materialCategoryId.value = learningCategories.value[0]?.id ?? "";
    }
    setStatus("Категория удалена.");
  } catch {
    setError("Не удалось удалить категорию.");
  } finally {
    saving.value = false;
  }
}

async function handleDeleteMaterial(material: AdminLearningMaterial) {
  const confirmed = window.confirm(`Удалить запись "${material.title}"?`);
  if (!confirmed) {
    return;
  }

  saving.value = true;
  try {
    await deleteAdminLearningMaterial(material.id);
    learningMaterials.value = learningMaterials.value.filter((item) => item.id !== material.id);
    learningCategories.value = learningCategories.value.map((category) =>
      category.id === material.categoryId ? { ...category, itemsCount: Math.max(0, category.itemsCount - 1) } : category
    );
    setStatus("Запись удалена.");
  } catch {
    setError("Не удалось удалить запись.");
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
        <span class="admin-card-label">Ограничения</span>
        <strong>{{ restrictedUsers }}</strong>
        <small>с активными ограничениями</small>
      </article>
      <article class="admin-card">
        <span class="admin-card-label">Админы</span>
        <strong>{{ admins.length + 1 }}</strong>
        <small>включая владельца</small>
      </article>

      <article v-if="isOwner" class="admin-panel admin-panel-wide">
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
        <select v-model="restrictionFilter" class="text-input">
          <option value="all">Все клиенты</option>
          <option value="restricted">С ограничениями</option>
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
              <small>
                {{ adminRoleLabel(user.role) }} · ID {{ user.telegramId }} · {{ user.tariff || "future" }} ·
                {{ user.completedItems }}/{{ user.totalItems }}
              </small>
            </span>
            <em>{{ user.hasRestrictions ? "Ограничен" : formatMembershipStatus(user.membershipStatus) }}</em>
          </button>
        </div>
      </div>

      <Teleport to="body">
        <div v-if="selectedUser && activePanel === 'users'" class="admin-modal-backdrop" @click.self="closeSelectedUser">
          <aside class="admin-detail admin-client-modal" role="dialog" aria-modal="true" aria-labelledby="admin-client-modal-title">
            <header class="admin-client-modal-head">
              <div>
                <h3 id="admin-client-modal-title">{{ userTitle(selectedUser) }}</h3>
                <p>{{ adminRoleLabel(selectedUser.role) }} · ID {{ selectedUser.telegramId }} · тариф {{ selectedUser.tariff || "future" }}</p>
              </div>
              <button class="icon-button" type="button" aria-label="Закрыть карточку клиента" @click="closeSelectedUser">
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            <div class="admin-detail-stats">
              <span>{{ formatMembershipStatus(selectedUser.membershipStatus) }}</span>
              <span>{{ adminRoleLabel(selectedUser.role) }}</span>
              <span>{{ selectedUser.completedItems }}/{{ selectedUser.totalItems }} уроков</span>
              <span v-if="selectedUser.membershipExpiresAt">до {{ new Date(selectedUser.membershipExpiresAt).toLocaleDateString("ru-RU") }}</span>
            </div>
            <p v-if="selectedUser.lastOpenedItemTitle" class="admin-muted-line">
              Последний урок: {{ selectedUser.lastOpenedItemTitle }}
            </p>

            <p v-if="!canManageSelectedUser" class="admin-warning-line">
              Менять доступ и ограничения администраторов может только главный админ.
            </p>

            <form class="admin-form" @submit.prevent="handleUpdateAccess">
              <select v-model="accessStatus" class="text-input" :disabled="!canManageSelectedUser">
                <option value="active">{{ formatMembershipStatus("active") }}</option>
                <option value="inactive">{{ formatMembershipStatus("inactive") }}</option>
                <option value="expired">{{ formatMembershipStatus("expired") }}</option>
              </select>
              <input v-model="accessExpiresAt" class="text-input" type="date" :disabled="!canManageSelectedUser" />
              <div class="admin-inline-actions">
                <button
                  v-for="option in extensionOptions"
                  :key="option.days"
                  class="secondary-button"
                  type="button"
                  :disabled="!canManageSelectedUser"
                  @click="extendAccess(option.days)"
                >
                  {{ option.label }}
                </button>
              </div>
              <button class="primary-button" type="submit" :disabled="saving || !canManageSelectedUser">Сохранить доступ</button>
            </form>

            <div class="admin-inline-actions">
              <button class="secondary-button" type="button" :disabled="saving || !canManageSelectedUser" @click="handleQuickMute(selectedUser)">
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
              <article v-for="event in selectedUserDetail?.moderationEvents ?? []" :key="`${event.kind}-${event.id}`" class="admin-log-item">
                <time>{{ new Date(event.createdAt).toLocaleString("ru-RU") }}</time>
                <div>
                  <strong>
                    {{ event.kind === "mute" ? "Мут" : event.kind === "chat_message" ? "Сообщение" : "Комментарий" }}
                    · {{ event.status }}
                  </strong>
                  <span v-if="event.sourceTitle">{{ event.sourceTitle }}</span>
                  <p v-if="event.body">{{ event.body }}</p>
                  <small v-if="event.resolvedAt">обработано {{ new Date(event.resolvedAt).toLocaleString("ru-RU") }}</small>
                  <button
                    v-if="event.kind === 'mute' && !event.resolvedAt && canManageSelectedUser"
                    class="secondary-button mt-2"
                    type="button"
                    :disabled="saving"
                    @click="handleRevokeMute(event.id)"
                  >
                    Снять мут
                  </button>
                </div>
              </article>
            </section>
          </aside>
        </div>
      </Teleport>
    </section>

    <section v-else-if="activePanel === 'materials'" class="admin-panel">
      <div class="admin-panel-head">
        <div>
          <h3>Записи обучения</h3>
          <p>Категории, текст, фото, видео и аудио. Медиа загружается в облако сразу при добавлении.</p>
        </div>
        <button class="primary-button admin-add-button" type="button" :disabled="!learningCategories.length" @click="openMaterialModal">
          Добавить запись
        </button>
      </div>

      <section class="admin-crm-block">
        <h4>Категории</h4>
        <form class="admin-form" @submit.prevent="handleCreateCategory">
          <input v-model.trim="categoryTitle" class="text-input" placeholder="Название категории" />
          <input v-model.trim="categoryDescription" class="text-input" placeholder="Описание, необязательно" />
          <button class="secondary-button" type="submit" :disabled="saving">Добавить категорию</button>
        </form>

        <div class="admin-list mt-3">
          <article v-for="category in learningCategories" :key="category.id" class="admin-entity">
            <div>
              <strong>{{ category.title }}</strong>
              <small>{{ category.itemsCount }} записей</small>
              <p v-if="category.description">{{ category.description }}</p>
            </div>
            <button class="icon-button" type="button" :disabled="saving" @click="handleDeleteCategory(category)">
              <Trash2 class="h-4 w-4" aria-hidden="true" />
            </button>
          </article>
          <p v-if="!learningCategories.length" class="admin-empty">Категорий пока нет. Добавьте первую, чтобы создавать записи.</p>
        </div>
      </section>

      <div class="admin-list">
        <section v-for="group in materialsByCategory" :key="group.category.id" class="admin-crm-block">
          <h4>{{ group.category.title }}</h4>
          <article v-for="material in group.materials" :key="material.id" class="admin-entity">
            <div>
              <strong>{{ material.title }}</strong>
              <small>
                {{ material.kind }} · {{ material.isPublished ? "открыт" : "скрыт" }}
                <template v-if="material.mediaSizeBytes"> · {{ Math.round(material.mediaSizeBytes / 1024 / 1024 * 10) / 10 }} МБ</template>
              </small>
              <p v-if="material.summary">{{ material.summary }}</p>
            </div>
            <div class="admin-inline-actions">
              <button class="secondary-button" type="button" :disabled="saving" @click="handleToggleMaterial(material)">
                {{ material.isPublished ? "Скрыть" : "Открыть" }}
              </button>
              <button class="icon-button" type="button" :disabled="saving" @click="handleDeleteMaterial(material)">
                <Trash2 class="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </article>
          <p v-if="!group.materials.length" class="admin-empty">В этой категории пока нет записей.</p>
        </section>
        <p v-if="!learningMaterials.length" class="admin-empty">Записей пока нет.</p>
      </div>

      <Teleport to="body">
        <div v-if="showMaterialModal" class="admin-modal-backdrop" @click.self="closeMaterialModal">
          <aside class="admin-detail admin-client-modal" role="dialog" aria-modal="true" aria-labelledby="admin-material-modal-title">
            <header class="admin-client-modal-head">
              <div>
                <h3 id="admin-material-modal-title">Новая запись</h3>
                <p>Добавьте текст, медиа и оформление записи.</p>
              </div>
              <button class="icon-button" type="button" aria-label="Закрыть добавление записи" @click="closeMaterialModal">
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            <form class="admin-form" @submit.prevent="handleCreateMaterial">
              <select v-model="materialCategoryId" class="text-input">
                <option value="" disabled>Категория записи</option>
                <option v-for="category in learningCategories" :key="category.id" :value="category.id">
                  {{ category.title }}
                </option>
              </select>
              <select v-model="materialKind" class="text-input">
                <option value="text">Текст</option>
                <option value="photo">Фото</option>
                <option value="video">Видео</option>
                <option value="audio">Аудио</option>
              </select>
              <input v-model.trim="materialTitle" class="text-input" placeholder="Название записи" />
              <input v-model.trim="materialSummary" class="text-input" placeholder="Краткое описание" />

              <div class="admin-editor">
                <div class="admin-editor-toolbar">
                  <button class="icon-button" type="button" @click="applyEditorCommand('bold')">B</button>
                  <button class="icon-button" type="button" @click="applyEditorCommand('italic')">I</button>
                  <button class="icon-button" type="button" @click="applyEditorCommand('underline')">U</button>
                  <button class="secondary-button" type="button" @click="applyEditorCommand('insertUnorderedList')">Список</button>
                  <label class="admin-color-control">
                    <span>Цвет</span>
                    <input v-model="editorColor" type="color" @change="applyEditorCommand('foreColor', editorColor)" />
                  </label>
                </div>
                <div
                  ref="editorRef"
                  class="admin-rich-editor"
                  contenteditable="true"
                  role="textbox"
                  aria-label="Текст записи"
                  data-placeholder="Текст, описание или конспект"
                  @input="syncEditorBody"
                ></div>
              </div>

              <input
                v-if="materialKind !== 'text'"
                class="text-input"
                type="file"
                :accept="materialKind === 'photo' ? 'image/*' : materialKind === 'video' ? 'video/*' : 'audio/*'"
                @change="handleMaterialFileChange"
              />
              <label class="admin-check-row">
                <input v-model="materialPublished" type="checkbox" />
                <span>Сразу открыть клиентам</span>
              </label>
              <button class="primary-button" type="submit" :disabled="saving || !learningCategories.length">Добавить запись</button>
            </form>
          </aside>
        </div>
      </Teleport>
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
