<script setup lang="ts">
import type {
  AdminLearningMaterial,
  AdminStatsUser,
  AdminUser,
  AdminUserDetailResponse,
  ClubTopic,
  ContentKind,
  LearningCategory,
  PaymentOrderLog
} from "@club/shared";
import {
  BarChart3,
  ChevronDown,
  Check,
  CreditCard,
  ExternalLink,
  ImageIcon,
  Shield,
  Trash2,
  UsersRound,
  X,
  type LucideIcon
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  addAdminUser,
  createAdminLearningCategory,
  createAdminLearningMaterial,
  createUserMute,
  deleteAdminLearningCategory,
  deleteAdminLearningMaterial,
  getAdminLearning,
  getAdminPaymentHistory,
  getAdminStats,
  getAdminUsers,
  getAdminUserDetail,
  getCommunityTopics,
  removeAdminUser,
  revokeUserMute,
  transferClubOwner,
  updateAdminLearningMaterialStatus,
  updateAdminUserAccess,
} from "@/api/client";
import {
  getAccessSaveButtonText,
  getAdminSubscriptionActorLabel,
  getAdminSubscriptionSourceLabel,
  getAdminSubscriptionTitle,
  getAdminTariffLabel
} from "@/features/admin/adminClientCard";
import { getVisibleAdminPanels, type AdminPanel } from "@/features/admin/adminPanels";
import { buildAdminStatistics, type AdminStatisticsPeriod } from "@/features/admin/adminStatistics";
import { formatMembershipStatus } from "@/features/app/i18n";
import { releaseNotes } from "@/features/app/releaseNotes";
import { appVersion, appVersionUpdatedAt } from "@/features/app/version";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type PreviewMode } from "@/stores/ui";

const session = useSessionStore();
const ui = useUiStore();

type ClientAccordionSection = "subscriptions" | "payments" | "restrictions";

const panelIcons: Record<AdminPanel, LucideIcon> = {
  statistics: BarChart3,
  overview: BarChart3,
  users: UsersRound,
  payments: CreditCard,
  materials: ImageIcon,
  mockups: ImageIcon,
  admins: Shield
};

const adminMockups = [
  {
    id: "statistics-preview",
    title: "Статистика клуба",
    description: "Черновой макет будущей вкладки со статистикой по клиентам, оплатам, контенту и общению.",
    createdAt: "26.06.2026",
    images: [
      { title: "Верх экрана", url: "/previews/admin-stats-preview-1.png" },
      { title: "Оплаты и контент", url: "/previews/admin-stats-preview-2.png" },
      { title: "Общение", url: "/previews/admin-stats-preview-3.png" }
    ]
  }
] as const;

const previewOptions: Array<{ value: PreviewMode; label: string }> = [
  { value: "developer", label: "Разработчик" },
  { value: "admin", label: "Админ" },
  { value: "member-active", label: "Доступ открыт" },
  { value: "member-inactive", label: "Доступ закрыт" }
];

const extensionOptions = [
  { days: 7, label: "+7 дней" },
  { days: 30, label: "+30 дней" },
  { days: 90, label: "+90 дней" }
] as const;
const tariffOrder = ["manual", "prodamus", "prodamus_recurrent", "future"] as const;

const activePanel = ref<AdminPanel>("statistics");
const ownerTelegramId = ref("");
const admins = ref<AdminUser[]>([]);
const users = ref<AdminStatsUser[]>([]);
const paymentOrders = ref<PaymentOrderLog[]>([]);
const communityTopics = ref<ClubTopic[]>([]);
const selectedUser = ref<AdminStatsUser | null>(null);
const selectedUserDetail = ref<AdminUserDetailResponse | null>(null);
const learningCategories = ref<LearningCategory[]>([]);
const learningMaterials = ref<AdminLearningMaterial[]>([]);
const search = ref("");
const subscriptionFilter = ref<"all" | "active" | "closed">("all");
const tariffFilter = ref("all");
const restrictionFilter = ref<"all" | "restricted">("all");
const statisticsPeriod = ref<AdminStatisticsPeriod>("30d");
const accessStatus = ref<"active" | "inactive">("active");
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
const showCategoryModal = ref(false);
const showReleaseNotesModal = ref(false);
const expandedReleaseVersion = ref(appVersion);
const editorRef = ref<HTMLElement | null>(null);
const editorColor = ref("#111827");
const newAdminTelegramId = ref("");
const transferOwnerTelegramId = ref("");
const showTransferOwnerModal = ref(false);
const loading = ref(false);
const saving = ref(false);
const accessSaveSucceeded = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);
let accessSaveTimer: number | null = null;
const clientAccordion = ref<Record<ClientAccordionSection, boolean>>({
  subscriptions: false,
  payments: false,
  restrictions: false
});

const isOwner = computed(() => session.user?.realRole === "owner");
const panels = computed(() =>
  getVisibleAdminPanels(session.user?.realRole).map((panel) => ({
    ...panel,
    icon: panelIcons[panel.id]
  }))
);
const canManageSelectedUser = computed(() => isOwner.value || selectedUser.value?.role === "member");
const totalUsers = computed(() => users.value.length);
const activeUsers = computed(() => users.value.filter((user) => user.membershipStatus === "active").length);
const restrictedUsers = computed(() => users.value.filter((user) => user.hasRestrictions).length);
const paidOrders = computed(() => paymentOrders.value.filter((order) => order.status === "paid").length);
const paidRevenue = computed(() =>
  paymentOrders.value.filter((order) => order.status === "paid").reduce((sum, order) => sum + order.amountRub, 0)
);
const tariffOptions = computed(() => {
  const values = new Set(users.value.map((user) => user.tariff || "future"));
  return [
    { value: "all", label: "Все тарифы" },
    ...Array.from(values)
      .sort((left, right) => {
        const leftIndex = tariffOrder.indexOf(left as (typeof tariffOrder)[number]);
        const rightIndex = tariffOrder.indexOf(right as (typeof tariffOrder)[number]);
        const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

        if (normalizedLeftIndex !== normalizedRightIndex) {
          return normalizedLeftIndex - normalizedRightIndex;
        }

        return getAdminTariffLabel(left).localeCompare(getAdminTariffLabel(right), "ru");
      })
      .map((value) => ({ value, label: getAdminTariffLabel(value) }))
  ];
});
const filteredUsers = computed(() => {
  const query = search.value.trim().toLowerCase();
  return users.value.filter((user) => {
    const matchesQuery =
      !query || [user.telegramId, user.firstName ?? "", user.username ?? ""].some((value) => value.toLowerCase().includes(query));
    const matchesSubscription =
      subscriptionFilter.value === "all" ||
      (subscriptionFilter.value === "active" ? user.membershipStatus === "active" : user.membershipStatus !== "active");
    const matchesTariff = tariffFilter.value === "all" || (user.tariff || "future") === tariffFilter.value;
    const matchesRestrictions = restrictionFilter.value === "all" || user.hasRestrictions;
    return matchesQuery && matchesSubscription && matchesTariff && matchesRestrictions;
  });
});
const filtersActive = computed(
  () => Boolean(search.value.trim()) || subscriptionFilter.value !== "all" || tariffFilter.value !== "all" || restrictionFilter.value !== "all"
);
const selectedUserPaymentOrders = computed(() =>
  selectedUser.value ? paymentOrders.value.filter((order) => order.customer.telegramId === selectedUser.value?.telegramId) : []
);
const accessSaveButtonText = computed(() => getAccessSaveButtonText(accessSaveSucceeded.value));
const materialsByCategory = computed(() =>
  learningCategories.value.map((category) => ({
    category,
    materials: learningMaterials.value.filter((material) => material.categoryId === category.id)
  }))
);
const adminStatistics = computed(() =>
  buildAdminStatistics(
    {
      users: users.value,
      paymentOrders: paymentOrders.value,
      learningCategories: learningCategories.value,
      learningMaterials: learningMaterials.value,
      communityTopics: communityTopics.value
    },
    { period: statisticsPeriod.value }
  )
);
const statisticsPeriodOptions: Array<{ value: AdminStatisticsPeriod; label: string }> = [
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "all", label: "Всё время" }
];

function userTitle(user: AdminStatsUser) {
  return user.firstName || user.username || `ID ${user.telegramId}`;
}

function openReleaseNotesModal() {
  expandedReleaseVersion.value = appVersion;
  showReleaseNotesModal.value = true;
}

function closeReleaseNotesModal() {
  showReleaseNotesModal.value = false;
}

function toggleReleaseNote(version: string) {
  expandedReleaseVersion.value = expandedReleaseVersion.value === version ? "" : version;
}

function adminTitle(admin: AdminUser) {
  return admin.firstName || (admin.username ? `@${admin.username}` : `ID ${admin.telegramId}`);
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

function paymentOrderStatusLabel(status: PaymentOrderLog["status"]) {
  if (status === "paid") {
    return "Оплачен";
  }

  if (status === "failed") {
    return "Ошибка";
  }

  if (status === "cancelled") {
    return "Отменён";
  }

  return "Ожидает";
}

function paymentCustomerTitle(order: PaymentOrderLog) {
  return order.customer.firstName || order.customer.username || `ID ${order.customer.telegramId}`;
}

function paymentOrderDate(order: PaymentOrderLog) {
  return new Date(order.paidAt ?? order.createdAt).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function applySelectedUser(user: AdminStatsUser) {
  selectedUser.value = user;
  accessStatus.value = user.membershipStatus === "active" ? "active" : "inactive";
  accessExpiresAt.value = user.membershipExpiresAt?.slice(0, 10) ?? "";
}

function resetClientAccordion() {
  clientAccordion.value = {
    subscriptions: false,
    payments: false,
    restrictions: false
  };
}

function toggleClientAccordion(section: ClientAccordionSection) {
  clientAccordion.value = {
    ...clientAccordion.value,
    [section]: !clientAccordion.value[section]
  };
}

function resetAccessSaveState() {
  accessSaveSucceeded.value = false;
  if (accessSaveTimer) {
    window.clearTimeout(accessSaveTimer);
    accessSaveTimer = null;
  }
}

function markAccessSaved() {
  resetAccessSaveState();
  accessSaveSucceeded.value = true;
  accessSaveTimer = window.setTimeout(() => {
    accessSaveSucceeded.value = false;
    accessSaveTimer = null;
  }, 5000);
}

function closeSelectedUser() {
  resetAccessSaveState();
  resetClientAccordion();
  selectedUser.value = null;
  selectedUserDetail.value = null;
}

async function selectUser(user: AdminStatsUser) {
  resetAccessSaveState();
  resetClientAccordion();
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

function setAccessDateToday() {
  accessExpiresAt.value = formatDateInput(new Date());
}

function resetClientFilters() {
  search.value = "";
  subscriptionFilter.value = "all";
  tariffFilter.value = "all";
  restrictionFilter.value = "all";
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
    const [adminsResponse, statsResponse, learningResponse, paymentsResponse, topicsResponse] = await Promise.all([
      getAdminUsers(),
      getAdminStats(),
      getAdminLearning(),
      getAdminPaymentHistory(),
      getCommunityTopics()
    ]);
    ownerTelegramId.value = adminsResponse.ownerTelegramId;
    admins.value = adminsResponse.admins;
    users.value = statsResponse.users;
    paymentOrders.value = paymentsResponse.orders;
    communityTopics.value = topicsResponse.topics;
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

async function handleUpdateAccess() {
  const telegramId = selectedUser.value?.telegramId;
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
    markAccessSaved();
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

function openCategoryModal() {
  showCategoryModal.value = true;
}

function closeCategoryModal() {
  showCategoryModal.value = false;
}

function openTransferOwnerModal() {
  transferOwnerTelegramId.value = admins.value[0]?.telegramId ?? "";
  showTransferOwnerModal.value = true;
}

function closeTransferOwnerModal() {
  showTransferOwnerModal.value = false;
  transferOwnerTelegramId.value = "";
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
    setError("Укажите категорию и название контента.");
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
    showSuccessAlert("Контент добавлен.");
  } catch {
    setError("Не удалось добавить контент.");
  } finally {
    saving.value = false;
  }
}

async function handleToggleMaterial(material: AdminLearningMaterial) {
  saving.value = true;
  try {
    const response = await updateAdminLearningMaterialStatus(material.id, !material.isPublished);
    learningMaterials.value = learningMaterials.value.map((item) => (item.id === material.id ? response.material : item));
    setStatus(response.material.isPublished ? "Контент открыт." : "Контент скрыт.");
  } catch {
    setError("Не удалось изменить доступность контента.");
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
    closeCategoryModal();
    showSuccessAlert("Категория добавлена.");
  } catch {
    setError("Не удалось добавить категорию.");
  } finally {
    saving.value = false;
  }
}

async function handleDeleteCategory(category: LearningCategory) {
  const confirmed = window.confirm(`Удалить категорию "${category.title}" и весь контент внутри неё?`);
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
  const confirmed = window.confirm(`Удалить контент "${material.title}"?`);
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
    setStatus("Контент удалён.");
  } catch {
    setError("Не удалось удалить контент.");
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

async function handleTransferOwner() {
  if (!transferOwnerTelegramId.value) {
    setError("Выберите администратора для передачи клуба.");
    return;
  }

  saving.value = true;
  try {
    await transferClubOwner(transferOwnerTelegramId.value);
    const response = await getAdminUsers();
    admins.value = response.admins;
    ownerTelegramId.value = response.ownerTelegramId;
    closeTransferOwnerModal();
    await session.load();
    setStatus("Клуб передан новому владельцу.");
  } catch {
    setError("Не удалось передать клуб. Проверьте, что выбранный пользователь остаётся администратором.");
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

onUnmounted(() => {
  resetAccessSaveState();
});
</script>

<template>
  <section class="admin-shell">
    <header class="section-head">
      <div>
        <h2 class="section-title">Админка</h2>
        <p class="section-subtitle">Клиенты, доступ и ограничения.</p>
      </div>
      <button class="app-version-badge" type="button" aria-label="Открыть список обновлений" @click="openReleaseNotesModal">
        <span>v{{ appVersion }}</span>
        <small>{{ appVersionUpdatedAt }}</small>
      </button>
    </header>

    <Teleport to="body">
      <div v-if="showReleaseNotesModal" class="admin-modal-backdrop" @click.self="closeReleaseNotesModal">
        <aside class="admin-detail admin-client-modal release-notes-modal" role="dialog" aria-modal="true" aria-labelledby="release-notes-title">
          <header class="admin-client-modal-head">
            <div>
              <h3 id="release-notes-title">Обновления</h3>
              <p>История изменений приложения по версиям.</p>
            </div>
            <button class="icon-button" type="button" aria-label="Закрыть список обновлений" @click="closeReleaseNotesModal">
              <X class="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div class="release-notes-list">
            <article v-for="note in releaseNotes" :key="note.version" class="release-note-card">
              <button class="release-note-head" type="button" @click="toggleReleaseNote(note.version)">
                <span>
                  <strong>v{{ note.version }}</strong>
                  <small>{{ note.updatedAt }}</small>
                </span>
                <span class="release-note-title">{{ note.title }}</span>
                <ChevronDown class="h-4 w-4" :class="{ 'admin-accordion-icon-open': expandedReleaseVersion === note.version }" aria-hidden="true" />
              </button>
              <ul v-if="expandedReleaseVersion === note.version" class="release-note-items">
                <li v-for="item in note.items" :key="item">{{ item }}</li>
              </ul>
            </article>
          </div>
        </aside>
      </div>
    </Teleport>

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

    <section v-if="activePanel === 'statistics'" class="admin-panel admin-statistics-panel">
      <div class="admin-panel-head admin-statistics-head">
        <div>
          <h3>Статистика клуба</h3>
          <p>Клиенты, оплаты, контент и общение по выбранному периоду.</p>
        </div>
        <div class="admin-stat-periods" aria-label="Период статистики">
          <button
            v-for="period in statisticsPeriodOptions"
            :key="period.value"
            class="admin-stat-period"
            :class="{ 'admin-stat-period-active': statisticsPeriod === period.value }"
            type="button"
            @click="statisticsPeriod = period.value"
          >
            {{ period.label }}
          </button>
        </div>
      </div>

      <div class="admin-stat-kpis">
        <article class="admin-stat-kpi">
          <span>Клиенты</span>
          <strong>{{ adminStatistics.clients.total }}</strong>
          <small>+{{ adminStatistics.clients.newInPeriod }} за период</small>
        </article>
        <article class="admin-stat-kpi">
          <span>Доступ открыт</span>
          <strong>{{ adminStatistics.clients.active }}</strong>
          <small>{{ adminStatistics.clients.activePercent }}% от базы</small>
        </article>
        <article class="admin-stat-kpi">
          <span>Выручка</span>
          <strong>{{ adminStatistics.payments.revenueRub.toLocaleString("ru-RU") }} ₽</strong>
          <small>{{ adminStatistics.payments.paidOrders }} оплат</small>
        </article>
        <article class="admin-stat-kpi">
          <span>Автоподписки</span>
          <strong>{{ adminStatistics.payments.recurrentPaidOrders }}</strong>
          <small>средний чек {{ adminStatistics.payments.averagePaidOrderRub.toLocaleString("ru-RU") }} ₽</small>
        </article>
      </div>

      <div class="admin-stat-layout">
        <section class="admin-stat-block">
          <header>
            <div>
              <h4>Доступ и подписки</h4>
              <p>Состояние клиентской базы сейчас.</p>
            </div>
            <strong>{{ adminStatistics.clients.activePercent }}%</strong>
          </header>
          <div class="admin-stat-meter" aria-hidden="true">
            <span :style="{ width: `${adminStatistics.clients.activePercent}%` }"></span>
          </div>
          <div class="admin-stat-mini-grid">
            <article>
              <span>Без доступа</span>
              <strong>{{ adminStatistics.clients.inactive }}</strong>
            </article>
            <article>
              <span>Ограничения</span>
              <strong>{{ adminStatistics.clients.restricted }}</strong>
            </article>
            <article>
              <span>Истекают скоро</span>
              <strong>{{ adminStatistics.clients.expiringSoon }}</strong>
            </article>
          </div>
          <div v-if="adminStatistics.tariffs.length" class="admin-stat-bars">
            <div v-for="tariff in adminStatistics.tariffs" :key="tariff.tariff" class="admin-stat-bar-row">
              <div>
                <span>{{ tariff.label }}</span>
                <strong>{{ tariff.value }}</strong>
              </div>
              <div class="admin-stat-meter admin-stat-meter-small" aria-hidden="true">
                <span :style="{ width: `${tariff.percent}%` }"></span>
              </div>
            </div>
          </div>
        </section>

        <section class="admin-stat-block">
          <header>
            <div>
              <h4>Оплаты</h4>
              <p>Статусы заказов и качество webhook.</p>
            </div>
            <strong>{{ adminStatistics.payments.paidOrders }}</strong>
          </header>
          <div class="admin-stat-mini-grid admin-stat-mini-grid-two">
            <article>
              <span>Ожидают</span>
              <strong>{{ adminStatistics.payments.pendingOrders }}</strong>
            </article>
            <article>
              <span>Ошибки webhook</span>
              <strong>{{ adminStatistics.payments.failedWebhookOrders }}</strong>
            </article>
            <article>
              <span>Разовые</span>
              <strong>{{ adminStatistics.payments.oneTimePaidOrders }}</strong>
            </article>
            <article>
              <span>Ошибки оплат</span>
              <strong>{{ adminStatistics.payments.failedOrders }}</strong>
            </article>
          </div>
        </section>

        <section class="admin-stat-block">
          <header>
            <div>
              <h4>Контент</h4>
              <p>Наполнение и прогресс обучения.</p>
            </div>
            <strong>{{ adminStatistics.learning.averageProgressPercent }}%</strong>
          </header>
          <div class="admin-stat-meter" aria-hidden="true">
            <span :style="{ width: `${adminStatistics.learning.averageProgressPercent}%` }"></span>
          </div>
          <div class="admin-stat-mini-grid">
            <article>
              <span>Опубликовано</span>
              <strong>{{ adminStatistics.learning.publishedMaterials }}</strong>
            </article>
            <article>
              <span>Скрыто</span>
              <strong>{{ adminStatistics.learning.hiddenMaterials }}</strong>
            </article>
            <article>
              <span>Удалено</span>
              <strong>{{ adminStatistics.learning.archivedMaterials }}</strong>
            </article>
          </div>
          <p class="admin-stat-note">
            {{ adminStatistics.learning.popularTitle ? `Чаще открывают: ${adminStatistics.learning.popularTitle}` : "Пока нет данных по открытиям." }}
          </p>
          <div class="admin-stat-kind-list">
            <span v-for="kind in adminStatistics.contentKinds" :key="kind.kind">{{ kind.label }} · {{ kind.count }}</span>
          </div>
        </section>

        <section class="admin-stat-block">
          <header>
            <div>
              <h4>Общение</h4>
              <p>Темы клуба и активность в чатах.</p>
            </div>
            <strong>{{ adminStatistics.communication.messages }}</strong>
          </header>
          <div class="admin-stat-mini-grid admin-stat-mini-grid-two">
            <article>
              <span>Темы</span>
              <strong>{{ adminStatistics.communication.topics }}</strong>
            </article>
            <article>
              <span>Открыты</span>
              <strong>{{ adminStatistics.communication.openTopics }}</strong>
            </article>
            <article>
              <span>Закрыты</span>
              <strong>{{ adminStatistics.communication.lockedTopics }}</strong>
            </article>
            <article>
              <span>В архиве</span>
              <strong>{{ adminStatistics.communication.archivedTopics }}</strong>
            </article>
          </div>
        </section>
      </div>
    </section>

    <section v-else-if="activePanel === 'overview'" class="admin-grid">
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
      <article class="admin-card">
        <span class="admin-card-label">Оплаты</span>
        <strong>{{ paidOrders }}</strong>
        <small>{{ paidRevenue.toLocaleString("ru-RU") }} ₽ оплачено</small>
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

      <div class="admin-filter-grid">
        <input v-model.trim="search" class="text-input" placeholder="Поиск по ID, имени или username" />
        <select v-model="subscriptionFilter" class="text-input">
          <option value="all">Любой доступ</option>
          <option value="active">Доступ открыт</option>
          <option value="closed">Доступ закрыт</option>
        </select>
        <select v-model="tariffFilter" class="text-input">
          <option v-for="tariff in tariffOptions" :key="tariff.value" :value="tariff.value">
            {{ tariff.label }}
          </option>
        </select>
        <select v-model="restrictionFilter" class="text-input">
          <option value="all">Все клиенты</option>
          <option value="restricted">С ограничениями</option>
        </select>
        <button class="secondary-button admin-filter-reset" type="button" :disabled="!filtersActive" @click="resetClientFilters">
          Сбросить
        </button>
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
                {{ adminRoleLabel(user.role) }} · ID {{ user.telegramId }} · {{ getAdminTariffLabel(user.tariff) }} ·
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
                <p>{{ adminRoleLabel(selectedUser.role) }} · ID {{ selectedUser.telegramId }} · {{ getAdminTariffLabel(selectedUser.tariff) }}</p>
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
              </select>
              <input v-model="accessExpiresAt" class="text-input" type="date" :disabled="!canManageSelectedUser" />
              <div class="admin-inline-actions">
                <button class="secondary-button" type="button" :disabled="!canManageSelectedUser" @click="setAccessDateToday">
                  Сегодня
                </button>
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
              <button
                class="primary-button"
                :class="{ 'admin-save-success': accessSaveSucceeded }"
                type="submit"
                :disabled="saving || !canManageSelectedUser"
              >
                {{ accessSaveButtonText }}
              </button>
            </form>

            <div class="admin-inline-actions">
              <button class="secondary-button" type="button" :disabled="saving || !canManageSelectedUser" @click="handleQuickMute(selectedUser)">
                Мут пока не снимут
              </button>
            </div>

            <section class="admin-crm-block admin-accordion-block">
              <button
                class="admin-accordion-head"
                type="button"
                :aria-expanded="clientAccordion.subscriptions"
                @click="toggleClientAccordion('subscriptions')"
              >
                <span>
                  <strong>Подписки</strong>
                  <small>{{ selectedUserDetail?.subscriptions.length ?? 0 }} записей</small>
                </span>
                <ChevronDown class="h-4 w-4" :class="{ 'admin-accordion-icon-open': clientAccordion.subscriptions }" aria-hidden="true" />
              </button>
              <div v-if="clientAccordion.subscriptions" class="admin-accordion-body">
                <p v-if="!selectedUserDetail?.subscriptions.length" class="admin-empty">Истории подписок пока нет.</p>
                <article v-for="subscription in selectedUserDetail?.subscriptions ?? []" :key="subscription.id" class="admin-history-item">
                  <strong>{{ getAdminSubscriptionTitle(subscription) }}</strong>
                  <span>{{ getAdminSubscriptionSourceLabel(subscription) }} · {{ formatMembershipStatus(subscription.status) }}</span>
                  <small v-if="getAdminSubscriptionActorLabel(subscription)">{{ getAdminSubscriptionActorLabel(subscription) }}</small>
                  <small>
                    {{ new Date(subscription.createdAt).toLocaleDateString("ru-RU") }}
                    <template v-if="subscription.expiresAt"> · до {{ new Date(subscription.expiresAt).toLocaleDateString("ru-RU") }}</template>
                  </small>
                </article>
              </div>
            </section>

            <section class="admin-crm-block admin-accordion-block">
              <button
                class="admin-accordion-head"
                type="button"
                :aria-expanded="clientAccordion.payments"
                @click="toggleClientAccordion('payments')"
              >
                <span>
                  <strong>Оплаты клиента</strong>
                  <small>{{ selectedUserPaymentOrders.length }} записей</small>
                </span>
                <ChevronDown class="h-4 w-4" :class="{ 'admin-accordion-icon-open': clientAccordion.payments }" aria-hidden="true" />
              </button>
              <div v-if="clientAccordion.payments" class="admin-accordion-body">
                <p v-if="!selectedUserPaymentOrders.length" class="admin-empty">Оплат пока нет.</p>
                <article v-for="order in selectedUserPaymentOrders" :key="order.id" class="admin-payment-card admin-payment-card-compact">
                  <div class="admin-payment-main">
                    <div>
                      <strong>{{ order.productTitle }}</strong>
                      <small>{{ paymentOrderDate(order) }} · {{ order.amountRub.toLocaleString("ru-RU") }} ₽</small>
                    </div>
                    <em :class="`payment-status-${order.status}`">{{ paymentOrderStatusLabel(order.status) }}</em>
                  </div>
                  <div class="admin-payment-ids">
                    <span>order: {{ order.providerOrderId }}</span>
                    <span>Webhook: {{ order.webhook ? (order.webhook.isValid ? "валидный" : "ошибка подписи") : "не пришёл" }}</span>
                  </div>
                </article>
              </div>
            </section>

            <section class="admin-crm-block admin-accordion-block">
              <button
                class="admin-accordion-head"
                type="button"
                :aria-expanded="clientAccordion.restrictions"
                @click="toggleClientAccordion('restrictions')"
              >
                <span>
                  <strong>Ограничения и удаления</strong>
                  <small>{{ selectedUserDetail?.moderationEvents.length ?? 0 }} записей</small>
                </span>
                <ChevronDown class="h-4 w-4" :class="{ 'admin-accordion-icon-open': clientAccordion.restrictions }" aria-hidden="true" />
              </button>
              <div v-if="clientAccordion.restrictions" class="admin-accordion-body">
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
              </div>
            </section>
          </aside>
        </div>
      </Teleport>
    </section>

    <section v-else-if="activePanel === 'payments'" class="admin-panel">
      <div class="admin-panel-head">
        <div>
          <h3>Платежи</h3>
          <p>История заказов, webhook и статусы оплат Prodamus.</p>
        </div>
      </div>

      <div class="admin-payment-summary">
        <article>
          <span>Всего заказов</span>
          <strong>{{ paymentOrders.length }}</strong>
        </article>
        <article>
          <span>Оплачено</span>
          <strong>{{ paidOrders }}</strong>
        </article>
        <article>
          <span>Сумма оплат</span>
          <strong>{{ paidRevenue.toLocaleString("ru-RU") }} ₽</strong>
        </article>
      </div>

      <div class="admin-list">
        <article v-for="order in paymentOrders" :key="order.id" class="admin-payment-card">
          <div class="admin-payment-main">
            <div>
              <strong>{{ order.productTitle }}</strong>
              <small>{{ paymentCustomerTitle(order) }} · ID {{ order.customer.telegramId }}</small>
            </div>
            <em :class="`payment-status-${order.status}`">{{ paymentOrderStatusLabel(order.status) }}</em>
          </div>
          <div class="admin-payment-meta">
            <span>{{ paymentOrderDate(order) }}</span>
            <span>{{ order.amountRub.toLocaleString("ru-RU") }} ₽</span>
            <span>{{ order.productKind === "recurrent" ? "Рекуррент" : "Разовый" }}</span>
            <span>Webhook: {{ order.webhook ? (order.webhook.isValid ? "валидный" : "ошибка подписи") : "не пришёл" }}</span>
          </div>
          <div class="admin-payment-ids">
            <span>order: {{ order.providerOrderId }}</span>
            <span v-if="order.providerPaymentId">payment: {{ order.providerPaymentId }}</span>
          </div>
        </article>
        <p v-if="!paymentOrders.length" class="admin-empty">Оплат пока нет. Первый заказ появится сразу после нажатия клиентом на оплату.</p>
      </div>
    </section>

    <section v-else-if="activePanel === 'mockups' && isOwner" class="admin-panel">
      <div class="admin-panel-head">
        <div>
          <h3>Макеты</h3>
          <p>Черновые визуальные варианты будущих разделов. Доступно только главному админу.</p>
        </div>
      </div>

      <div class="admin-mockup-list">
        <article v-for="mockup in adminMockups" :key="mockup.id" class="admin-mockup-card">
          <div class="admin-mockup-card-head">
            <div>
              <strong>{{ mockup.title }}</strong>
              <small>Добавлено {{ mockup.createdAt }}</small>
            </div>
            <span>{{ mockup.images.length }} экрана</span>
          </div>
          <p>{{ mockup.description }}</p>
          <div class="admin-mockup-grid">
            <a v-for="image in mockup.images" :key="image.url" class="admin-mockup-thumb" :href="image.url" target="_blank" rel="noreferrer">
              <img :src="image.url" :alt="image.title" loading="lazy" />
              <span>
                {{ image.title }}
                <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </a>
          </div>
        </article>
      </div>
    </section>

    <section v-else-if="activePanel === 'materials'" class="admin-panel">
      <div class="admin-panel-head">
        <div>
          <h3>Контент обучения</h3>
          <p>Категории, текст, фото, видео и аудио. Медиа загружается в облако сразу при добавлении.</p>
        </div>
        <button class="primary-button admin-add-button" type="button" :disabled="!learningCategories.length" @click="openMaterialModal">
          Добавить контент
        </button>
      </div>

      <section class="admin-crm-block">
        <div class="admin-panel-head">
          <div>
            <h4>Категории</h4>
            <p>Группы, внутри которых хранится контент.</p>
          </div>
          <button class="secondary-button admin-add-button" type="button" @click="openCategoryModal">
            Добавить категорию
          </button>
        </div>

        <div class="admin-list mt-3">
          <article v-for="category in learningCategories" :key="category.id" class="admin-entity">
            <div>
              <strong>{{ category.title }}</strong>
              <small>{{ category.itemsCount }} элементов контента</small>
              <p v-if="category.description">{{ category.description }}</p>
            </div>
            <button class="icon-button" type="button" :disabled="saving" @click="handleDeleteCategory(category)">
              <Trash2 class="h-4 w-4" aria-hidden="true" />
            </button>
          </article>
          <p v-if="!learningCategories.length" class="admin-empty">Категорий пока нет. Добавьте первую, чтобы создавать контент.</p>
        </div>
      </section>

      <Teleport to="body">
        <div v-if="showCategoryModal" class="admin-modal-backdrop" @click.self="closeCategoryModal">
          <aside class="admin-detail admin-client-modal" role="dialog" aria-modal="true" aria-labelledby="admin-category-modal-title">
            <header class="admin-client-modal-head">
              <div>
                <h3 id="admin-category-modal-title">Новая категория</h3>
                <p>Создайте раздел для контента.</p>
              </div>
              <button class="icon-button" type="button" aria-label="Закрыть добавление категории" @click="closeCategoryModal">
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            <form class="admin-form" @submit.prevent="handleCreateCategory">
              <input v-model.trim="categoryTitle" class="text-input" placeholder="Название категории" />
              <input v-model.trim="categoryDescription" class="text-input" placeholder="Описание, необязательно" />
              <button class="primary-button" type="submit" :disabled="saving">Добавить категорию</button>
            </form>
          </aside>
        </div>
      </Teleport>

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
          <p v-if="!group.materials.length" class="admin-empty">В этой категории пока нет контента.</p>
        </section>
        <p v-if="!learningMaterials.length" class="admin-empty">Контента пока нет.</p>
      </div>

      <Teleport to="body">
        <div v-if="showMaterialModal" class="admin-modal-backdrop" @click.self="closeMaterialModal">
          <aside class="admin-detail admin-client-modal" role="dialog" aria-modal="true" aria-labelledby="admin-material-modal-title">
            <header class="admin-client-modal-head">
              <div>
                <h3 id="admin-material-modal-title">Новый контент</h3>
                <p>Добавьте текст, медиа и оформление контента.</p>
              </div>
              <button class="icon-button" type="button" aria-label="Закрыть добавление контента" @click="closeMaterialModal">
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            <form class="admin-form" @submit.prevent="handleCreateMaterial">
              <select v-model="materialCategoryId" class="text-input">
                <option value="" disabled>Категория контента</option>
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
              <input v-model.trim="materialTitle" class="text-input" placeholder="Название контента" />
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
                  aria-label="Текст контента"
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
              <button class="primary-button" type="submit" :disabled="saving || !learningCategories.length">Добавить контент</button>
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

      <button
        v-if="isOwner"
        class="primary-button"
        type="button"
        :disabled="saving || !admins.length"
        @click="openTransferOwnerModal"
      >
        Передать владение клубом
      </button>
      <p v-if="isOwner && !admins.length" class="admin-empty">Чтобы передать клуб, сначала добавьте нового администратора.</p>

      <Teleport to="body">
        <div v-if="showTransferOwnerModal" class="admin-modal-backdrop" @click.self="closeTransferOwnerModal">
          <aside class="admin-detail admin-client-modal" role="dialog" aria-modal="true" aria-labelledby="admin-owner-transfer-title">
            <header class="admin-client-modal-head">
              <div>
                <h3 id="admin-owner-transfer-title">Передать клуб</h3>
                <p>Новый владелец получит полный доступ. Вы останетесь обычным админом.</p>
              </div>
              <button class="icon-button" type="button" aria-label="Закрыть передачу клуба" @click="closeTransferOwnerModal">
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            <form class="admin-form" @submit.prevent="handleTransferOwner">
              <select v-model="transferOwnerTelegramId" class="text-input">
                <option value="" disabled>Выберите администратора</option>
                <option v-for="admin in admins" :key="admin.id" :value="admin.telegramId">
                  {{ adminTitle(admin) }} · ID {{ admin.telegramId }}
                </option>
              </select>
              <p class="admin-warning-line">
                Подтвердите действие только если точно хотите сменить владельца клуба.
              </p>
              <button class="primary-button" type="submit" :disabled="saving || !transferOwnerTelegramId">
                Подтвердить передачу
              </button>
            </form>
          </aside>
        </div>
      </Teleport>

      <form v-if="isOwner" class="admin-search-row" @submit.prevent="handleAddAdmin">
        <input v-model.trim="newAdminTelegramId" class="text-input" inputmode="numeric" pattern="[0-9]*" placeholder="Telegram ID нового админа" />
        <button class="primary-button admin-add-button" type="submit" :disabled="saving">Добавить</button>
      </form>
      <p v-else class="admin-empty">Добавлять и удалять админов может только владелец.</p>

      <div class="admin-list">
        <article v-for="admin in admins" :key="admin.id" class="admin-entity">
          <div>
            <strong>{{ adminTitle(admin) }}</strong>
            <small>
              ID {{ admin.telegramId }}
              <template v-if="admin.username"> · @{{ admin.username }}</template>
              · добавлен {{ new Date(admin.createdAt).toLocaleDateString("ru-RU") }}
            </small>
          </div>
          <button v-if="isOwner" class="icon-button" type="button" :disabled="saving" @click="handleRemoveAdmin(admin.telegramId)">
            <Trash2 class="h-4 w-4" aria-hidden="true" />
          </button>
        </article>
      </div>
    </section>
  </section>
</template>
