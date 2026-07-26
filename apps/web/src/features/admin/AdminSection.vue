<script setup lang="ts">
import "./adminRoute.css";
import {
  adminPermissionLabels,
  allAdminPermissions,
  type AdminActionActor,
  type AdminActionLog,
  type AdminCommunityMessage,
  type AdminPermission,
  type AdminMailing,
  type AdminMailingAnalytics,
  type AdminMailingAnalyticsRecipient,
  type AdminMailingPreviewResponse,
  type AdminLearningMaterial,
  type AdminLoginIp,
  type AdminStatsUser,
  type AdminStatsResponse,
  type AdminUser,
  type AdminUserDetailResponse,
  type ClubTopic,
  type EmailDeliveryQuota,
  type LearningCategory,
  type MailingChannel,
  type MailingFilters,
  type PaymentOrderLog,
  type S3StorageObject,
  type S3StorageSettings
} from "@club/shared";
import {
  BarChart3,
  ChevronRight,
  Check,
  Cloud,
  Copy,
  CreditCard,
  Link2,
  Megaphone,
  Paperclip,
  RotateCcw,
  Server,
  SlidersHorizontal,
  Shield,
  Trash2,
  UsersRound,
  X,
  type LucideIcon
} from "lucide-vue-next";
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { sanitizeHtml } from "@/utils/sanitizeHtml";
import type { StatisticsDetail } from "./AdminStatisticsDetail.vue";
import { prepareMailingHtml, type MailingEditorMode } from "./mailingEditorMode";
import {
  addAdminUser,
  createAdminMailing,
  createAdminClientSupportTicket,
  createUserMute,
  deleteAdminS3Object,
  getAdminActionLogs,
  getAdminLearning,
  getAdminMailings,
  getAdminMailingAnalytics,
  getAdminMailingAnalyticsRecipients,
  getAdminPaymentHistory,
  getAdminS3Objects,
  getAdminS3ObjectUrl,
  getAdminS3StorageSettings,
  getAdminStats,
  getAdminUsers,
  getAdminUserDetail,
  getAdminUserLoginIps,
  getCommunityTopics,
  removeAdminUser,
  pauseAdminMailing,
  previewAdminMailing,
  retryFailedAdminMailing,
  revokeUserMute,
  resumeAdminMailing,
  stopAdminMailing,
  testAdminMailing,
  testAdminMailingDraft,
  transferClubOwner,
  updateAdminUserPermissions,
  updateAdminS3StorageSettings,
  updateAdminUserAccess,
} from "@/api/client";
import {
  getAccessSaveButtonText,
  getAdminSubscriptionActorLabel,
  getAdminSubscriptionSourceLabel,
  getAdminSubscriptionTitle,
  getAdminClientAccessState,
  getAdminClientDisplayName,
  getAdminTariffLabel
} from "@/features/admin/adminClientCard";
import {
  allClientSourcesFilter,
  filterAdminClients,
  getAdminClientSourceOptions,
  untaggedClientSourceFilter,
  type AdminClientUtmField
} from "@/features/admin/adminClientAcquisitionFilters";
import { blurActiveTextField } from "@/features/app/keyboardFocus";
import ConfirmDialog from "@/features/app/ConfirmDialog.vue";
import TaskScreen from "@/features/app/TaskScreen.vue";
import { UiPageHeader } from "@/features/ui";
import {
  filterPaymentOrdersByBreakdown,
  resolvePaymentBreakdownItem,
  type AdminPaymentBreakdownItem
} from "@/features/admin/adminPaymentDrilldown";
import {
  filterUsersByAccessBreakdown,
  filterUsersByTariff,
  type AdminAccessBreakdownItem
} from "@/features/admin/adminUserDrilldown";
import { getAdminPanelForTaskPath, getVisibleAdminPanels, type AdminPanel } from "@/features/admin/adminPanels";
import { buildAdminStatistics, type AdminStatisticsPeriod } from "@/features/admin/adminStatistics";
import { formatAdminPaymentMoney, paymentRubMajor } from "@/features/admin/adminPaymentMoney";
import { canUseDeveloperPreview, normalizeAdminPreviewMode } from "@/features/admin/developerPreview";
import { formatMembershipStatus } from "@/features/app/i18n";
import { useOperationIndicator } from "@/features/app/useOperationIndicator";
import { appVersion, appVersionUpdatedAt } from "@/features/app/version";
import { useNotificationsStore } from "@/stores/notifications";
import { useAppDialogsStore } from "@/stores/appDialogs";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type PreviewMode } from "@/stores/ui";
import "./adminShell.css";

const AdminStatisticsDetail = defineAsyncComponent(() => import("./AdminStatisticsDetail.vue"));
const AdminAcquisitionAnalytics = defineAsyncComponent(() => import("./AdminAcquisitionAnalytics.vue"));
const AdminLearningEngagement = defineAsyncComponent(() => import("./AdminLearningEngagement.vue"));
const AdminClientAcquisition = defineAsyncComponent(() => import("./AdminClientAcquisition.vue"));
const AdminPaymentsPanel = defineAsyncComponent(() => import("./AdminPaymentsPanel.vue"));
const AdminStoragePanel = defineAsyncComponent(() => import("./AdminStoragePanel.vue"));
const AdminProjectSettingsPanel = defineAsyncComponent(() => import("./AdminProjectSettingsPanel.vue"));
const AdminServerPanel = defineAsyncComponent(() => import("./AdminServerPanel.vue"));
const AdminReleaseNotesTask = defineAsyncComponent(() => import("./AdminReleaseNotesTask.vue"));

const session = useSessionStore();
const notifications = useNotificationsStore();
const appDialogs = useAppDialogsStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();

function openAdminTask(path: string) {
  if (route.path !== path) void router.push(path);
}

function closeAdminTask() {
  if (route.path !== "/admin") void router.push("/admin");
}

const props = defineProps<{
  openClientTelegramId?: string | null;
  clientCardOnly?: boolean;
}>();

const emit = defineEmits<{
  "client-card-close": [];
  "preview-mode-change": [mode: PreviewMode];
}>();

type ClientAccessAction = "open" | "close" | "extend7" | "extend30" | "manual";
type AnalyticsDetail = "acquisition" | StatisticsDetail;
type UserDrilldownSelection =
  | {
      kind: "access";
      key: AdminAccessBreakdownItem["key"];
      title: string;
    }
  | {
      kind: "tariff";
      tariff: string;
      title: string;
    };

const panelIcons: Record<AdminPanel, LucideIcon> = {
  statistics: BarChart3,
  users: UsersRound,
  mailings: Megaphone,
  payments: CreditCard,
  storage: Cloud,
  "project-settings": SlidersHorizontal,
  admins: Shield,
  "server-logs": Server
};

const tariffOrder = ["manual", "prodamus", "prodamus_recurrent", "lava", "lava_recurrent", "future"] as const;
const previewModeOptions: Array<{ value: PreviewMode; label: string }> = [
  { value: "developer", label: "Разраб" },
  { value: "admin", label: "Админ" },
  { value: "member-active", label: "С доступом" },
  { value: "member-inactive", label: "Без доступа" }
];
const mailingChannelOptions: Array<{ value: MailingChannel; label: string; hint: string }> = [
  { value: "push", label: "Push", hint: "Приложение + PWA" },
  { value: "email", label: "Email", hint: "Письмо на почту" },
  { value: "push_email", label: "Push + Email", hint: "Оба канала" }
];
const mailingAccessStatusOptions: Array<{ value: MailingFilters["accessStatus"]; label: string }> = [
  { value: "active", label: "Активна подписка" },
  { value: "inactive", label: "Нет активной подписки" },
  { value: "all", label: "Любой статус" }
];
const mailingAccessTypeOptions: Array<{ value: MailingFilters["accessType"]; label: string }> = [
  { value: "all", label: "Любой тип" },
  { value: "manual", label: "Ручной доступ" },
  { value: "one_time", label: "Разовая оплата" },
  { value: "recurrent", label: "Автоподписка" },
  { value: "none", label: "Без типа доступа" }
];
const storagePrefixOptions = [
  { value: "", label: "Все файлы" },
  { value: "learning/", label: "Уроки" },
  { value: "support/", label: "Поддержка" },
  { value: "mailings/", label: "Рассылки" },
  { value: "notifications/", label: "Уведомления" }
];
const adminPermissionOptions = allAdminPermissions.map((permission) => ({
  value: permission,
  label: adminPermissionLabels[permission]
}));

const activePanel = ref<AdminPanel>("statistics");
const ownerTelegramId = ref("");
const admins = ref<AdminUser[]>([]);
const adminActionAdmins = ref<AdminActionActor[]>([]);
const adminActionLogs = ref<AdminActionLog[]>([]);
const adminActionActorFilter = ref("");
const adminActionLogExpanded = ref(false);
const users = ref<AdminStatsUser[]>([]);
const mailings = ref<AdminMailing[]>([]);
const mailingPreview = ref<AdminMailingPreviewResponse | null>(null);
const mailingEmailQuota = ref<EmailDeliveryQuota>({
  used: 0,
  remaining: 2_000,
  limit: 2_000,
  windowHours: 24,
  maxRecipientsPerMessage: 100,
  messagesPerSecond: 5,
  resetsAt: null
});
const mailingTitle = ref("");
const mailingBody = ref("");
const mailingBodyHtml = ref("");
const mailingEditorMode = ref<MailingEditorMode>("visual");
const mailingChannel = ref<MailingChannel>("push");
const mailingFilters = ref<MailingFilters>({
  accessStatus: "active",
  accessType: "all",
  excludeAdmins: true,
  excludeRestricted: true
});
const mailingScheduledAt = ref("");
const mailingAttachment = ref<File | null>(null);
const mailingEditorRef = ref<HTMLElement | null>(null);
const mailingPreviewLoading = ref(false);
const showMailingComposer = ref(false);
const showMailingHistory = ref(false);
const paymentOrders = ref<PaymentOrderLog[]>([]);
const communityTopics = ref<ClubTopic[]>([]);
const communityMessages = ref<AdminCommunityMessage[]>([]);
const pollStats = ref<AdminStatsResponse["pollStats"]>({ totalPolls: 0, activePolls: 0, closedPolls: 0, uniqueParticipants: 0, totalVotes: 0, participationPercent: 0, polls: [] });
const selectedUser = ref<AdminStatsUser | null>(null);
const selectedUserDetail = ref<AdminUserDetailResponse | null>(null);
const selectedUserDisplayName = ref("");
const selectedUserDisplayNameError = ref<string | null>(null);
const selectedUserLoginIps = ref<AdminLoginIp[]>([]);
const selectedUserLoginIpsLoading = ref(false);
const selectedUserLoginIpsError = ref(false);
const selectedPaymentBreakdown = ref<AdminPaymentBreakdownItem | null>(null);
const selectedUserDrilldown = ref<UserDrilldownSelection | null>(null);
const activeStatisticsDetail = ref<AnalyticsDetail | null>(null);
const selectedMailing = ref<AdminMailing | null>(null);
const mailingAnalytics = ref<AdminMailingAnalytics | null>(null);
const mailingAnalyticsRecipients = ref<AdminMailingAnalyticsRecipient[]>([]);
const mailingAnalyticsLoading = ref(false);
const mailingAnalyticsError = ref(false);
const mailingAnalyticsRecipientsLoading = ref(false);
const mailingAnalyticsRecipientStatus = ref<"all" | "delivered" | "opened" | "clicked" | "failed" | "skipped" | "pending">("all");
const mailingAnalyticsRecipientChannel = ref<"all" | "push" | "email">("all");
const mailingAnalyticsNextCursor = ref<string | null>(null);
const mailingAnalyticsTimelineMax = computed(() => Math.max(
  1,
  ...(mailingAnalytics.value?.timeline.flatMap((item) => [item.sent, item.opened, item.clicked]) ?? [])
));
const selectedMailingBodyHtml = computed(() => {
  const html = selectedMailing.value?.bodyHtml?.trim();
  return html ? sanitizeHtml(html) : "";
});
const pendingOpenClientTelegramId = ref<string | null>(null);
const learningCategories = ref<LearningCategory[]>([]);
const learningMaterials = ref<AdminLearningMaterial[]>([]);
const search = ref("");
const subscriptionFilter = ref<"all" | "active" | "closed">("all");
const tariffFilter = ref("all");
const restrictionFilter = ref<"all" | "restricted">("all");
const sourceFilter = ref(allClientSourcesFilter);
const utmFieldFilter = ref<AdminClientUtmField>("all");
const utmValueFilter = ref("");
const statisticsPeriod = ref<AdminStatisticsPeriod>("30d");
const statisticsCustomFrom = ref("");
const statisticsCustomTo = ref("");
const accessStatus = ref<"active" | "inactive">("active");
const accessExpiresAt = ref("");
const pendingClientAccessAction = ref<ClientAccessAction | null>(null);
const materialCategoryId = ref("");
const materialFile = ref<File | null>(null);
const showMaterialModal = ref(false);
const showCategoryModal = ref(false);
const showReleaseNotesModal = ref(false);
const clientMessageOpen = ref(false);
const clientMessageText = ref("");
const clientMessageFiles = ref<File[]>([]);
const clientMessageInputRef = ref<HTMLTextAreaElement | null>(null);
const sendingClientMessage = ref(false);
const adminSearchQuery = ref("");
const selectedAdminAccess = ref<AdminUser | null>(null);
const transferOwnerTelegramId = ref("");
const showTransferOwnerModal = ref(false);
const showTransferOwnerConfirm = ref(false);
const loading = ref(false);
const saving = ref(false);
const accessSaveSucceeded = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);
const storageSettings = ref<S3StorageSettings | null>(null);
const storageObjects = ref<S3StorageObject[]>([]);
const storageOverviewObjects = ref<S3StorageObject[]>([]);
const storageObjectsLoading = ref(false);
const storageObjectsCursor = ref<string | null>(null);
const storagePrefix = ref("");
const storageSearch = ref("");
const showStorageFilesModal = ref(false);
const showStorageFolderModal = ref(false);
const selectedStorageFolder = ref<(typeof storagePrefixOptions)[number] | null>(null);
const storageFolderSort = ref<"date" | "size" | "uploader">("date");
const showStorageSettingsModal = ref(false);
const storagePanelRef = ref<{ focusStorageActions: () => void } | null>(null);
const selectedStorageTarget = ref<"primary" | "reserve">("primary");
const storageForm = ref({
  endpoint: "",
  region: "us-east-1",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  publicBaseUrl: "",
  reserveEndpoint: "",
  reserveRegion: "us-east-1",
  reserveBucket: "",
  reserveAccessKeyId: "",
  reserveSecretAccessKey: "",
  reservePublicBaseUrl: "",
  signedUrlTtlSeconds: 3600
});
let accessSaveTimer: number | null = null;
let mailingPreviewTimer: number | null = null;

const isOwner = computed(() => session.user?.realRole === "owner");
const isPaymentsPanel = computed(() => activePanel.value === "payments");
const isProjectSettingsPanel = computed(() => activePanel.value === "project-settings");
// Compatibility note for the admin-shell contract: activePanel === 'server-logs'
// is rendered by AdminServerPanel, while navigation remains owned by this shell.
const isServerPanel = computed(() => activePanel.value === "server-logs");
const canViewReleaseNotes = computed(() => canUseDeveloperPreview(session.user?.realRole, ui.previewMode));
const isMemberPreviewMode = computed(() => ui.previewMode === "member-active" || ui.previewMode === "member-inactive");
const selectedStorageTargetLabel = computed(() => (selectedStorageTarget.value === "primary" ? "S3 основное" : "S3 резервное"));
const selectedStorageTargetConfigured = computed(() =>
  selectedStorageTarget.value === "primary" ? Boolean(storageSettings.value?.configured) : Boolean(storageSettings.value?.reserveConfigured)
);
const selectedStorageFilesStatus = computed(() => {
  if (!selectedStorageTargetConfigured.value) {
    return "Не подключено";
  }

  return `${storageOverviewObjects.value.length} файлов`;
});
const selectedStorageSettingsStatus = computed(() => (selectedStorageTargetConfigured.value ? "Подключено" : "Заполнить"));
const selectedStorageSettingsTitle = computed(() =>
  selectedStorageTarget.value === "primary" ? "Настройки S3 основного" : "Настройки S3 резервного"
);
const panels = computed(() =>
  getVisibleAdminPanels(session.user?.realRole, session.user?.adminPermissions).map((panel) => ({
    ...panel,
    icon: panelIcons[panel.id]
  }))
);
const adminPermissionStateKey = computed(
  () => `${session.user?.role ?? "none"}:${session.user?.adminPermissions.join("|") ?? ""}`
);
function hasCurrentAdminPermission(permission: AdminPermission) {
  return isOwner.value || Boolean(session.user?.adminPermissions.includes(permission));
}

function selectAdminPanel(panel: AdminPanel) {
  blurActiveTextField();
  activePanel.value = panel;
}

const canUseStorage = computed(() => hasCurrentAdminPermission("storage"));
const canViewLoginIps = computed(() => hasCurrentAdminPermission("login_ips"));
const canGrantClientAccess = computed(() => hasCurrentAdminPermission("accesses"));
const canManageSelectedUser = computed(() => isOwner.value || selectedUser.value?.role === "member");
const canManageSelectedUserAccess = computed(() => canGrantClientAccess.value && canManageSelectedUser.value);
const clientAccessBusy = computed(() => Boolean(pendingClientAccessAction.value));
const totalUsers = computed(() => users.value.length);
const activeUsers = computed(() => users.value.filter((user) => user.membershipStatus === "active").length);
const restrictedUsers = computed(() => users.value.filter((user) => user.hasRestrictions).length);
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
const clientSourceOptions = computed(() => getAdminClientSourceOptions(users.value));
const filteredUsers = computed(() => filterAdminClients(users.value, {
  query: search.value,
  subscription: subscriptionFilter.value,
  tariff: tariffFilter.value,
  restrictions: restrictionFilter.value,
  source: sourceFilter.value,
  utmField: utmFieldFilter.value,
  utmValue: utmValueFilter.value
}));
const adminTelegramIds = computed(() => new Set([ownerTelegramId.value, ...admins.value.map((admin) => admin.telegramId)]));
const adminSearchCandidates = computed(() => {
  const query = adminSearchQuery.value.trim().toLowerCase();
  if (!query || /^\d{3,32}$/.test(query)) {
    return [];
  }

  return users.value
    .filter((user) => !adminTelegramIds.value.has(user.telegramId))
    .filter((user) =>
      [user.telegramId, user.firstName ?? "", user.username ?? ""].some((value) => value.toLowerCase().includes(query))
    )
    .slice(0, 5);
});
const selectedAdminAccessCurrent = computed(() => {
  const selected = selectedAdminAccess.value;
  if (!selected) {
    return null;
  }

  return admins.value.find((admin) => admin.id === selected.id) ?? selected;
});
const visibleAdminActionActors = computed(() => {
  const seen = new Set<string>();
  return adminActionAdmins.value.filter((admin) => {
    if (seen.has(admin.telegramId)) {
      return false;
    }
    seen.add(admin.telegramId);
    return true;
  });
});
const filtersActive = computed(
  () =>
    Boolean(search.value.trim()) ||
    subscriptionFilter.value !== "all" ||
    tariffFilter.value !== "all" ||
    restrictionFilter.value !== "all" ||
    sourceFilter.value !== allClientSourcesFilter ||
    utmFieldFilter.value !== "all" ||
    Boolean(utmValueFilter.value.trim())
);
const selectedUserPaymentOrders = computed(() =>
  selectedUser.value ? paymentOrders.value.filter((order) => order.customer.telegramId === selectedUser.value?.telegramId) : []
);
const selectedUserPaidOrders = computed(() => selectedUserPaymentOrders.value.filter((order) => order.status === "paid"));
const selectedUserLastPayment = computed(
  () =>
    [...selectedUserPaymentOrders.value].sort(
      (left, right) => Date.parse(right.paidAt ?? right.createdAt) - Date.parse(left.paidAt ?? left.createdAt)
    )[0] ?? null
);
const selectedUserPaidTotal = computed(() => selectedUserPaidOrders.value.reduce((sum, order) => sum + paymentRubMajor(order), 0));
const selectedUserDevices = computed(() => selectedUserDetail.value?.devices ?? []);
const selectedUserDeviceText = computed(() => {
  if (!selectedUserDevices.value.length) {
    return "";
  }

  return JSON.stringify(selectedUserDevices.value, null, 2);
});
type ClientDeviceDiagnostics = AdminUserDetailResponse["devices"][number]["diagnostics"];
function getClientDeviceTitle(device: ClientDeviceDiagnostics) {
  const userAgent = device.userAgent.toLowerCase();
  const platform = userAgent.includes("android")
    ? "Android"
    : /iphone|ipad|ios/.test(userAgent)
      ? "iPhone / iOS"
      : userAgent.includes("windows")
        ? "Windows"
        : userAgent.includes("mac os")
          ? "macOS"
          : device.platform || "Неизвестное устройство";
  const browser = userAgent.includes("edg/")
    ? "Edge"
    : userAgent.includes("firefox/")
      ? "Firefox"
      : userAgent.includes("chrome/")
        ? "Chrome"
        : userAgent.includes("safari/")
          ? "Safari"
          : "Браузер";
  const mode = device.browser.standalone || device.browser.displayMode === "standalone" ? "PWA" : browser;
  return `${platform} · ${mode}`;
}

function getClientDeviceScreen(device: ClientDeviceDiagnostics) {
  return `${device.screen.width ?? "?"}×${device.screen.height ?? "?"} · viewport ${device.viewport.width ?? "?"}×${device.viewport.height ?? "?"}`;
}
const statisticsDateRange = computed(() =>
  statisticsPeriod.value === "custom"
    ? {
        from: statisticsCustomFrom.value,
        to: statisticsCustomTo.value
      }
    : undefined
);
const statisticsEngagementRange = computed(() => {
  if (statisticsDateRange.value) return statisticsDateRange.value;
  const to = new Date();
  if (statisticsPeriod.value === "all") {
    return { from: "2000-01-01", to: formatDateInput(to) };
  }
  const from = new Date(to);
  from.setDate(from.getDate() - (statisticsPeriod.value === "7d" ? 6 : 29));
  return { from: formatDateInput(from), to: formatDateInput(to) };
});
const statisticsOptions = computed(() =>
  statisticsDateRange.value
    ? { period: statisticsPeriod.value, dateRange: statisticsDateRange.value }
    : { period: statisticsPeriod.value }
);
const routePaymentBreakdown = computed(() => {
  const match = route.path.match(/^\/admin\/statistics\/payments\/([^/]+)$/);
  return match ? resolvePaymentBreakdownItem(decodeURIComponent(match[1]!), []) : null;
});
const activePaymentBreakdown = computed(() => selectedPaymentBreakdown.value ?? routePaymentBreakdown.value);
const paymentDrilldownOrders = computed(() =>
  activePaymentBreakdown.value
    ? filterPaymentOrdersByBreakdown(activePaymentBreakdown.value.key, paymentOrders.value, statisticsOptions.value)
    : []
);
const routeUserDrilldown = computed<UserDrilldownSelection | null>(() => {
  const match = route.path.match(/^\/admin\/statistics\/users\/(access|tariff)-([^/]+)$/);
  if (!match) {
    return null;
  }

  const kind = match[1];
  const key = decodeURIComponent(match[2]!);
  if (kind === "tariff") {
    return { kind: "tariff", tariff: key, title: getAdminTariffLabel(key) };
  }

  const accessTitles: Record<AdminAccessBreakdownItem["key"], string> = {
    inactive: "Без доступа",
    restricted: "Ограничения",
    expiring_soon: "Истекают скоро"
  };
  const accessKey = key as AdminAccessBreakdownItem["key"];
  return accessTitles[accessKey] ? { kind: "access", key: accessKey, title: accessTitles[accessKey] } : null;
});
const activeUserDrilldown = computed(() => selectedUserDrilldown.value ?? routeUserDrilldown.value);
const userDrilldownUsers = computed(() => {
  if (!activeUserDrilldown.value) {
    return [];
  }

  if (activeUserDrilldown.value.kind === "tariff") {
    return filterUsersByTariff(activeUserDrilldown.value.tariff, users.value);
  }

  return filterUsersByAccessBreakdown(activeUserDrilldown.value.key, users.value);
});
const accessSaveButtonText = computed(() => getAccessSaveButtonText(accessSaveSucceeded.value));
const adminStatistics = computed(() =>
  buildAdminStatistics(
    {
      users: users.value,
      paymentOrders: paymentOrders.value,
      learningCategories: learningCategories.value,
      learningMaterials: learningMaterials.value,
      communityTopics: communityTopics.value,
      communityMessages: communityMessages.value
    },
    statisticsOptions.value
  )
);
const statisticsDetailMeta = computed(() => {
  const meta: Record<AnalyticsDetail, { title: string; subtitle: string }> = {
    acquisition: { title: "Рекламные ссылки", subtitle: "Переходы, регистрации и оплаты" },
    clients: { title: "Клиенты", subtitle: "Доступ, ограничения и тарифы" },
    finance: { title: "Финансы", subtitle: "Выручка и статусы платежей" },
    learning: { title: "Обучение", subtitle: "Материалы и прогресс клиентов" },
    community: { title: "Общение", subtitle: "Темы и активность в чатах" },
    polls: { title: "Опросы", subtitle: "Участие и распределение ответов" }
  };
  return activeStatisticsDetail.value ? meta[activeStatisticsDetail.value] : meta.clients;
});
const storageOverview = computed(() =>
  storagePrefixOptions.map((option) => {
    const objects = option.value
      ? storageOverviewObjects.value.filter((item) => item.key.startsWith(option.value))
      : storageOverviewObjects.value;
    return {
      ...option,
      count: objects.length,
      sizeBytes: objects.reduce((sum, item) => sum + item.sizeBytes, 0)
    };
  })
);
const selectedStorageFolderObjects = computed(() => {
  const folder = selectedStorageFolder.value;
  if (!folder) {
    return [];
  }

  const query = storageSearch.value.trim().toLowerCase();
  const objects = folder.value ? storageObjects.value.filter((item) => item.key.startsWith(folder.value)) : storageObjects.value;
  if (!query) {
    return objects;
  }

  return objects.filter((item) =>
    [item.key, item.entityTitle ?? "", item.uploadedBy?.firstName ?? "", item.uploadedBy?.username ?? ""].some((value) =>
      value.toLowerCase().includes(query)
    )
  );
});
const sortedStorageFolderObjects = computed(() => {
  const objects = [...selectedStorageFolderObjects.value];
  if (storageFolderSort.value === "size") {
    return objects.sort((left, right) => right.sizeBytes - left.sizeBytes);
  }

  if (storageFolderSort.value === "uploader") {
    return objects.sort((left, right) => {
      const leftName = left.uploadedBy?.firstName || left.uploadedBy?.username || left.uploadedBy?.telegramId || "";
      const rightName = right.uploadedBy?.firstName || right.uploadedBy?.username || right.uploadedBy?.telegramId || "";
      return leftName.localeCompare(rightName, "ru") || storageObjectFileName(left.key).localeCompare(storageObjectFileName(right.key), "ru");
    });
  }

  return objects.sort((left, right) => Date.parse(right.lastModified ?? "") - Date.parse(left.lastModified ?? ""));
});
const storageFolderGroups = computed(() => {
  const groups = new Map<string, { title: string; objects: S3StorageObject[]; sizeBytes: number }>();
  for (const item of sortedStorageFolderObjects.value) {
    const title = item.entityTitle || item.fileKind || "Без привязки";
    const group = groups.get(title) ?? { title, objects: [], sizeBytes: 0 };
    group.objects.push(item);
    group.sizeBytes += item.sizeBytes;
    groups.set(title, group);
  }

  return Array.from(groups.values()).sort((left, right) => left.title.localeCompare(right.title, "ru"));
});
const mailingPreparedMessage = computed(() => prepareMailingHtml(mailingBodyHtml.value));
const mailingCanSubmit = computed(
  () => mailingTitle.value.trim().length > 0 && mailingPreparedMessage.value.plainText.length > 0
);
const mailingAttachmentLabel = computed(() => mailingAttachment.value?.name ?? "Добавить вложение");
const adminOperation = computed(() => {
  if (saving.value && activePanel.value === "mailings") {
    return {
      title: mailingAttachment.value ? "Готовим рассылку..." : "Сохраняем рассылку...",
      detail: "Считаем аудиторию и создаём очередь отправки"
    };
  }

  if (sendingClientMessage.value) {
    return {
      title: "Отправляем сообщение...",
      detail: clientMessageFiles.value.length ? "Загружаем файлы и создаём диалог" : "Создаём диалог с клиентом"
    };
  }

  if (!saving.value) {
    return null;
  }

  if (showMaterialModal.value) {
    return {
      title: materialFile.value ? "Загружаем контент..." : "Сохраняем контент...",
      detail: "Обновляем материалы клуба"
    };
  }

  if (showCategoryModal.value) {
    return {
      title: "Сохраняем категорию...",
      detail: "Обновляем структуру материалов"
    };
  }

  if (showTransferOwnerModal.value) {
    return {
      title: "Передаём клуб...",
      detail: "Обновляем владельца и права доступа"
    };
  }

  if (activePanel.value === "storage") {
    return {
      title: "Сохраняем хранилище...",
      detail: "Проверяем подключение S3"
    };
  }

  if (activePanel.value === "users") {
    return {
      title: "Сохраняем клиента...",
      detail: "Обновляем доступ и ограничения"
    };
  }

  if (activePanel.value === "admins") {
    return {
      title: "Сохраняем админов...",
      detail: "Обновляем права команды"
    };
  }

  return {
    title: "Сохраняем изменения...",
    detail: "Обновляем админку"
  };
});
const statisticsPeriodOptions: Array<{ value: AdminStatisticsPeriod; label: string }> = [
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "custom", label: "Период" },
  { value: "all", label: "Всё время" }
];
const statisticsPeriodShortLabel = computed(
  () => statisticsPeriodOptions.find((period) => period.value === statisticsPeriod.value)?.label ?? "Период"
);

useOperationIndicator(adminOperation);

function syncMailingEditorBody() {
  mailingBodyHtml.value = mailingEditorRef.value?.innerHTML ?? "";
  mailingBody.value = mailingPreparedMessage.value.plainText;
}

function syncActiveMailingEditor() {
  if (mailingEditorMode.value === "visual") {
    syncMailingEditorBody();
    return;
  }

  mailingBody.value = mailingPreparedMessage.value.plainText;
}

async function setMailingEditorMode(mode: MailingEditorMode) {
  if (mode === mailingEditorMode.value) {
    return;
  }

  syncActiveMailingEditor();
  if (mode === "visual") {
    mailingBodyHtml.value = mailingPreparedMessage.value.safeHtml;
  }

  mailingEditorMode.value = mode;
  await nextTick();
  if (mode === "visual" && mailingEditorRef.value) {
    mailingEditorRef.value.innerHTML = mailingBodyHtml.value;
  }
}

function handleMailingEditorPaste(event: ClipboardEvent) {
  event.preventDefault();
  const clipboardHtml = event.clipboardData?.getData("text/html") ?? "";
  const clipboardText = event.clipboardData?.getData("text/plain") ?? "";
  const safeHtml = clipboardHtml ? sanitizeHtml(clipboardHtml) : clipboardText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  document.execCommand("insertHTML", false, safeHtml);
  syncMailingEditorBody();
}

function applyMailingEditorCommand(command: string, value?: string) {
  mailingEditorRef.value?.focus();
  document.execCommand(command, false, value);
  syncMailingEditorBody();
}

async function applyMailingEditorLink() {
  const rawUrl = await appDialogs.prompt({
    title: "Добавить ссылку",
    description: "Укажите адрес, который будет открыт из текста рассылки.",
    label: "Ссылка",
    placeholder: "https://example.com",
    confirmLabel: "Добавить",
    validate: (value) => {
      if (!value) return "Введите ссылку";
      try {
        new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
        return null;
      } catch {
        return "Введите корректную ссылку";
      }
    }
  });
  const trimmedUrl = rawUrl?.trim();
  if (!trimmedUrl) {
    return;
  }

  const url = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
  applyMailingEditorCommand("createLink", url);
}

function updateMailingAttachment(event: Event) {
  const input = event.target as HTMLInputElement;
  mailingAttachment.value = input.files?.[0] ?? null;
}

function resetMailingForm() {
  mailingTitle.value = "";
  mailingBody.value = "";
  mailingBodyHtml.value = "";
  mailingEditorMode.value = "visual";
  mailingChannel.value = "push";
  mailingFilters.value = {
    accessStatus: "active",
    accessType: "all",
    excludeAdmins: true,
    excludeRestricted: true
  };
  mailingScheduledAt.value = "";
  mailingAttachment.value = null;
  if (mailingEditorRef.value) {
    mailingEditorRef.value.innerHTML = "";
  }
  scheduleMailingPreview();
}

async function openMailingComposer(options: { reset?: boolean } = {}) {
  if (options.reset ?? true) {
    resetMailingForm();
  }

  showMailingHistory.value = false;
  showMailingComposer.value = true;
  openAdminTask("/admin/mailings/new");
  await nextTick();

  if (mailingEditorRef.value) {
    mailingEditorRef.value.innerHTML = mailingBodyHtml.value;
    syncMailingEditorBody();
  }

  scheduleMailingPreview();
}

function closeMailingComposer() {
  showMailingComposer.value = false;
  closeAdminTask();
}

function openMailingHistory() {
  selectedMailing.value = null;
  showMailingComposer.value = false;
  showMailingHistory.value = true;
  openAdminTask("/admin/mailings/history");
  void loadMailings().catch(() => null);
}

function closeMailingHistory() {
  showMailingHistory.value = false;
  closeAdminTask();
}

function getMailingStatusLabel(status: AdminMailing["status"]) {
  if (status === "scheduled") {
    return "Запланирована";
  }

  if (status === "running") {
    return "Отправляется";
  }

  if (status === "paused") {
    return "Пауза";
  }

  if (status === "stopped") {
    return "Остановлена";
  }

  if (status === "completed") {
    return "Завершена";
  }

  return "Черновик";
}

function getMailingChannelLabel(channel: MailingChannel) {
  return mailingChannelOptions.find((option) => option.value === channel)?.label ?? channel;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}




function mailingAuthorLabel(mailing: AdminMailing) {
  const author = mailing.createdBy;
  if (!author) {
    return "Автор не указан";
  }

  return author.firstName || (author.username ? `@${author.username}` : `ID ${author.telegramId}`);
}

function mailingAttachmentText(mailing: AdminMailing) {
  if (!mailing.attachment) {
    return "Без вложения";
  }

  const sizeMb = mailing.attachment.sizeBytes ? Math.round((mailing.attachment.sizeBytes / 1024 / 1024) * 10) / 10 : 0;
  return sizeMb ? `${mailing.attachment.fileName} · ${sizeMb} МБ` : mailing.attachment.fileName;
}

function mailingFilterSummary(mailing: AdminMailing) {
  const accessStatus = mailingAccessStatusOptions.find((option) => option.value === mailing.filters.accessStatus)?.label ?? "Любой статус";
  const accessType = mailingAccessTypeOptions.find((option) => option.value === mailing.filters.accessType)?.label ?? "Любой тип";
  const extra = [
    mailing.filters.excludeAdmins ? "без админов" : "с админами",
    mailing.filters.excludeRestricted ? "без ограничений" : "с ограничениями"
  ];
  return `${accessStatus} · ${accessType} · ${extra.join(" · ")}`;
}

function canRetryFailedMailing(mailing: AdminMailing) {
  return mailing.failedCount > 0 && (mailing.status === "completed" || mailing.status === "stopped");
}

function formatMailingAnalyticsRate(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatMailingAnalyticsBucket(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function mailingAnalyticsBarWidth(value: number) {
  if (!value) return "0%";
  return `${Math.max(5, Math.round((value / mailingAnalyticsTimelineMax.value) * 100))}%`;
}

function mailingAnalyticsStatusLabel(status: AdminMailingAnalyticsRecipient["analyticsStatus"]) {
  return {
    delivered: "Доставлено",
    opened: "Открыто",
    clicked: "Переход",
    failed: "Ошибка",
    skipped: "Пропущено",
    pending: "Ожидает"
  }[status];
}

async function loadMailingAnalyticsRecipients(reset = true) {
  const mailingId = selectedMailing.value?.id;
  if (!mailingId) return;

  mailingAnalyticsRecipientsLoading.value = true;
  try {
    const response = await getAdminMailingAnalyticsRecipients(mailingId, {
      status: mailingAnalyticsRecipientStatus.value,
      channel: mailingAnalyticsRecipientChannel.value,
      cursor: reset ? null : mailingAnalyticsNextCursor.value
    });
    if (selectedMailing.value?.id !== mailingId) return;
    mailingAnalyticsRecipients.value = reset
      ? response.recipients
      : [...mailingAnalyticsRecipients.value, ...response.recipients];
    mailingAnalyticsNextCursor.value = response.nextCursor;
  } finally {
    if (selectedMailing.value?.id === mailingId) mailingAnalyticsRecipientsLoading.value = false;
  }
}

async function loadSelectedMailingAnalytics(mailingId: string) {
  mailingAnalyticsLoading.value = true;
  mailingAnalyticsError.value = false;
  mailingAnalytics.value = null;
  mailingAnalyticsRecipients.value = [];
  mailingAnalyticsNextCursor.value = null;
  try {
    const analytics = await getAdminMailingAnalytics(mailingId);
    if (selectedMailing.value?.id !== mailingId) return;
    mailingAnalytics.value = analytics;
    if (analytics.trackingEnabledAt) await loadMailingAnalyticsRecipients(true);
  } catch {
    if (selectedMailing.value?.id === mailingId) mailingAnalyticsError.value = true;
  } finally {
    if (selectedMailing.value?.id === mailingId) mailingAnalyticsLoading.value = false;
  }
}

function refreshMailingAnalytics() {
  if (selectedMailing.value) void loadSelectedMailingAnalytics(selectedMailing.value.id);
}

function updateMailingAnalyticsRecipients() {
  mailingAnalyticsNextCursor.value = null;
  void loadMailingAnalyticsRecipients(true);
}

function openMailingDetail(mailing: AdminMailing) {
  showMailingHistory.value = false;
  selectedMailing.value = mailing;
  openAdminTask(`/admin/mailings/${mailing.id}`);
}

function closeMailingDetail() {
  selectedMailing.value = null;
  closeAdminTask();
}

watch(
  () => selectedMailing.value?.id,
  (mailingId) => {
    if (mailingId) {
      mailingAnalyticsRecipientStatus.value = "all";
      mailingAnalyticsRecipientChannel.value = "all";
      void loadSelectedMailingAnalytics(mailingId);
      return;
    }
    mailingAnalytics.value = null;
    mailingAnalyticsRecipients.value = [];
    mailingAnalyticsNextCursor.value = null;
  }
);

function renderMailingEditorHtml(mailing: AdminMailing) {
  return mailing.bodyHtml || mailing.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

async function reuseMailing(mailing: AdminMailing) {
  mailingTitle.value = mailing.title;
  mailingBody.value = mailing.body;
  mailingBodyHtml.value = renderMailingEditorHtml(mailing);
  mailingEditorMode.value = "visual";
  mailingChannel.value = mailing.channel;
  mailingFilters.value = { ...mailing.filters };
  mailingScheduledAt.value = "";
  mailingAttachment.value = null;
  closeMailingDetail();
  await openMailingComposer({ reset: false });
  scheduleMailingPreview();
  setStatus("Рассылка перенесена в форму. Можно сменить канал и отправить снова.");
}

async function loadMailings() {
  const response = await getAdminMailings();
  mailings.value = response.mailings;
  mailingEmailQuota.value = response.emailQuota;
}

async function refreshMailingPreview() {
  mailingPreviewLoading.value = true;
  try {
    mailingPreview.value = await previewAdminMailing({
      channel: mailingChannel.value,
      filters: mailingFilters.value
    });
  } catch {
    mailingPreview.value = null;
  } finally {
    mailingPreviewLoading.value = false;
  }
}

function scheduleMailingPreview() {
  if (mailingPreviewTimer) {
    window.clearTimeout(mailingPreviewTimer);
  }

  mailingPreviewTimer = window.setTimeout(() => {
    void refreshMailingPreview();
  }, 350);
}

function buildMailingFormData() {
  const form = new FormData();
  form.set("title", mailingTitle.value.trim());
  form.set("body", mailingPreparedMessage.value.plainText);
  form.set("bodyHtml", mailingPreparedMessage.value.safeHtml);
  form.set("channel", mailingChannel.value);
  form.set("filters", JSON.stringify(mailingFilters.value));
  if (mailingScheduledAt.value) {
    form.set("scheduledAt", new Date(mailingScheduledAt.value).toISOString());
  }
  if (mailingAttachment.value) {
    form.set("attachment", mailingAttachment.value);
  }

  return form;
}

async function handleCreateMailing() {
  syncActiveMailingEditor();
  if (!mailingCanSubmit.value) {
    setError("Заполните заголовок и сообщение рассылки.");
    return;
  }

  saving.value = true;
  try {
    const response = await createAdminMailing(buildMailingFormData());
    await loadMailings();
    closeMailingComposer();
    scheduleMailingPreview();
    setStatus(response.mailing.status === "scheduled" ? "Рассылка запланирована." : "Рассылка поставлена в очередь.");
  } catch {
    setError("Не удалось создать рассылку.");
  } finally {
    saving.value = false;
  }
}

async function handleTestMailingDraft() {
  syncActiveMailingEditor();
  if (!mailingCanSubmit.value) {
    setError("Заполните заголовок и сообщение для теста.");
    return;
  }

  saving.value = true;
  try {
    await testAdminMailingDraft(buildMailingFormData());
    setStatus("Тест рассылки отправлен себе.");
  } catch {
    setError("Не удалось отправить тест рассылки себе.");
  } finally {
    saving.value = false;
  }
}

async function handleTestMailing(mailing: AdminMailing) {
  saving.value = true;
  try {
    await testAdminMailing(mailing.id);
    setStatus("Тест рассылки отправлен себе.");
  } catch {
    setError("Не удалось отправить тест рассылки.");
  } finally {
    saving.value = false;
  }
}

async function handlePauseMailing(mailing: AdminMailing) {
  saving.value = true;
  try {
    const response = await pauseAdminMailing(mailing.id);
    mailings.value = mailings.value.map((entry) => (entry.id === response.mailing.id ? response.mailing : entry));
    setStatus("Рассылка поставлена на паузу.");
  } catch {
    setError("Не удалось поставить рассылку на паузу.");
  } finally {
    saving.value = false;
  }
}

async function handleResumeMailing(mailing: AdminMailing) {
  saving.value = true;
  try {
    const response = await resumeAdminMailing(mailing.id);
    mailings.value = mailings.value.map((entry) => (entry.id === response.mailing.id ? response.mailing : entry));
    setStatus("Рассылка продолжена.");
  } catch {
    setError("Не удалось продолжить рассылку.");
  } finally {
    saving.value = false;
  }
}

async function handleStopMailing(mailing: AdminMailing) {
  saving.value = true;
  try {
    const response = await stopAdminMailing(mailing.id);
    mailings.value = mailings.value.map((entry) => (entry.id === response.mailing.id ? response.mailing : entry));
    setStatus("Рассылка остановлена.");
  } catch {
    setError("Не удалось остановить рассылку.");
  } finally {
    saving.value = false;
  }
}

async function handleRetryFailedMailing(mailing: AdminMailing) {
  saving.value = true;
  try {
    const response = await retryFailedAdminMailing(mailing.id);
    mailings.value = mailings.value.map((entry) => (entry.id === response.mailing.id ? response.mailing : entry));
    if (selectedMailing.value?.id === response.mailing.id) {
      selectedMailing.value = response.mailing;
    }
    setStatus("Ошибочные доставки возвращены в очередь.");
  } catch {
    setError("Не удалось повторить ошибочные доставки.");
  } finally {
    saving.value = false;
  }
}

function userTitle(user: AdminStatsUser) {
  return getAdminClientDisplayName(user);
}

function referralUserTitle(user: { telegramId: string; firstName: string | null; username: string | null }) {
  return user.firstName || user.username || `ID ${user.telegramId}`;
}

function referralRewardStatusLabel(status: "none" | "available" | "activated") {
  if (status === "activated") {
    return "Дни активированы";
  }

  if (status === "available") {
    return "Дни начислены";
  }

  return "Ждём первую оплату";
}

function openReleaseNotesModal() {
  if (!canViewReleaseNotes.value) {
    return;
  }

  showReleaseNotesModal.value = true;
  openAdminTask("/admin/releases");
}

function closeReleaseNotesModal() {
  showReleaseNotesModal.value = false;
  closeAdminTask();
}

async function handlePreviewModeChange(mode: PreviewMode) {
  clearAdminFeedback();
  ui.setPreviewMode(mode);
  emit("preview-mode-change", mode);
  if (mode === "member-active" || mode === "member-inactive") {
    void session.load({ silent: true }).catch(() => null);
    return;
  }

  await session.load({ silent: true });
  await loadAll();
}

function openPaymentDrilldown(item: AdminPaymentBreakdownItem) {
  activeStatisticsDetail.value = null;
  selectedPaymentBreakdown.value = item;
  openAdminTask(`/admin/statistics/payments/${item.key}`);
}

function closePaymentDrilldown() {
  selectedPaymentBreakdown.value = null;
  closeAdminTask();
}

function openUserAccessDrilldown(item: AdminAccessBreakdownItem) {
  activeStatisticsDetail.value = null;
  selectedUserDrilldown.value = {
    kind: "access",
    key: item.key,
    title: item.label
  };
  openAdminTask(`/admin/statistics/users/access-${item.key}`);
}

function openUserTariffDrilldown(tariff: { tariff: string; label: string }) {
  activeStatisticsDetail.value = null;
  selectedUserDrilldown.value = {
    kind: "tariff",
    tariff: tariff.tariff,
    title: tariff.label
  };
  openAdminTask(`/admin/statistics/users/tariff-${encodeURIComponent(tariff.tariff)}`);
}

function closeUserDrilldown() {
  selectedUserDrilldown.value = null;
  closeAdminTask();
}

async function openPaymentDrilldownUser(order: PaymentOrderLog) {
  const user = users.value.find((entry) => entry.telegramId === order.customer.telegramId);

  if (!user) {
    setError("Клиент по этой оплате не найден.");
    return;
  }

  closePaymentDrilldown();
  activePanel.value = "users";
  await selectUser(user);
}

async function openUserDrilldownClient(user: AdminStatsUser) {
  closeUserDrilldown();
  activePanel.value = "users";
  await selectUser(user);
}

async function openClientByTelegramId(telegramId: string) {
  pendingOpenClientTelegramId.value = telegramId;
  activePanel.value = "users";
  const user = users.value.find((entry) => entry.telegramId === telegramId);
  if (!user) {
    return;
  }

  pendingOpenClientTelegramId.value = null;
  await selectUser(user);
}

function adminTitle(admin: AdminUser) {
  return admin.firstName || (admin.username ? `@${admin.username}` : `ID ${admin.telegramId}`);
}

function adminActionActorTitle(actor: AdminActionActor | null) {
  if (!actor) {
    return "Администратор не найден";
  }

  return actor.firstName || (actor.username ? `@${actor.username}` : `ID ${actor.telegramId}`);
}

function adminActionTargetTitle(log: AdminActionLog) {
  if (log.target) {
    return adminActionActorTitle(log.target);
  }

  return log.targetTelegramId ? `ID ${log.targetTelegramId}` : "";
}

function adminActionAccessDetails(log: AdminActionLog) {
  if (log.action !== "client.access.updated") {
    return "";
  }

  const status = typeof log.metadata.status === "string" ? log.metadata.status : "";
  const expiresAt = typeof log.metadata.expiresAt === "string" ? log.metadata.expiresAt : "";
  const durationDays = typeof log.metadata.durationDays === "number" ? log.metadata.durationDays : null;
  if (status === "active" && expiresAt) {
    return `Доступ к клубу до ${formatDateTime(expiresAt)}${durationDays ? ` · ${durationDays} дн.` : ""}`;
  }

  if (status === "inactive" || status === "expired") {
    return "Доступ к клубу закрыт";
  }

  return "";
}

function adminActionMetaText(log: AdminActionLog) {
  const target = adminActionTargetTitle(log);
  const accessDetails = adminActionAccessDetails(log);
  if (accessDetails) {
    return [target ? `Клиент: ${target}` : "", accessDetails].filter(Boolean).join(" · ");
  }

  return target ? `Клиент: ${target}` : "";
}

function adminRoleTitle(admin: AdminUser) {
  return admin.roleLabel || "Админ";
}

function adminPermissionCount(admin: AdminUser) {
  return admin.permissions.length;
}

function hasAdminPermissionEntry(admin: AdminUser, permission: AdminPermission) {
  return admin.permissions.includes(permission);
}

function getAdminCandidateTitle(user: AdminStatsUser) {
  return `${user.firstName || user.username || `ID ${user.telegramId}`}${user.username ? ` · @${user.username}` : ""}`;
}

function resolveAdminSearchTelegramId() {
  const query = adminSearchQuery.value.trim();
  if (/^\d{3,32}$/.test(query)) {
    return query;
  }

  return adminSearchCandidates.value[0]?.telegramId ?? "";
}

function openAdminAccessModal(admin: AdminUser) {
  selectedAdminAccess.value = admin;
  openAdminTask(`/admin/admins/${admin.id}/access`);
}

function closeAdminAccessModal() {
  selectedAdminAccess.value = null;
  closeAdminTask();
}

async function reloadAdmins() {
  const response = await getAdminUsers();
  admins.value = response.admins;
  ownerTelegramId.value = response.ownerTelegramId;
}

async function loadAdminActionLogs() {
  const response = await getAdminActionLogs(adminActionActorFilter.value || undefined);
  adminActionAdmins.value = response.admins;
  adminActionLogs.value = response.logs;
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

function userInitial(user: AdminStatsUser) {
  return userTitle(user).slice(0, 1).toUpperCase();
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

function paymentCustomerInitial(order: PaymentOrderLog) {
  return paymentCustomerTitle(order).slice(0, 1).toUpperCase();
}

function paymentOrderDate(order: PaymentOrderLog) {
  return new Date(order.paidAt ?? order.createdAt).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatAdminDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatAdminDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatAdminShortDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit"
  });
}

function formatAdminCompactDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatLearningEngagementDuration(seconds: number) {
  if (seconds < 60) return `${seconds} сек.`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} ч ${minutes} мин` : `${minutes} мин ${seconds % 60} сек`;
}

async function copyTextToClipboard(text: string) {
  if (!text) {
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function selectedUserMeta(user: AdminStatsUser) {
  return `${adminRoleLabel(user.role)}${user.email ? ` · ${user.email}` : ""}`;
}

function getAccessActionSummary(user: AdminStatsUser) {
  const tariff = getAdminTariffLabel(user.tariff);
  return user.membershipExpiresAt ? `${tariff} до ${formatAdminDate(user.membershipExpiresAt)}` : tariff;
}


function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function selectStatisticsPeriod(period: AdminStatisticsPeriod) {
  statisticsPeriod.value = period;
  if (period !== "custom") {
    return;
  }

  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  statisticsCustomFrom.value ||= formatDateInput(from);
  statisticsCustomTo.value ||= formatDateInput(to);
}

function openStatisticsDetail(detail: AnalyticsDetail) {
  activeStatisticsDetail.value = detail;
}

function closeStatisticsDetail() {
  activeStatisticsDetail.value = null;
}

async function openAcquisitionClient(telegramId: string) {
  closeStatisticsDetail();
  await openClientByTelegramId(telegramId);
}

function applySelectedUser(user: AdminStatsUser) {
  selectedUser.value = user;
  accessStatus.value = user.membershipStatus === "active" ? "active" : "inactive";
  accessExpiresAt.value = user.membershipExpiresAt?.slice(0, 10) ?? "";
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
  closeClientMessageModal();
  selectedUser.value = null;
  selectedUserDetail.value = null;
  selectedUserLoginIps.value = [];
  selectedUserLoginIpsError.value = false;
  emit("client-card-close");
  if (!props.clientCardOnly) {
    closeAdminTask();
  }
}

function isNewLoginIp(entry: AdminLoginIp) {
  return Date.now() - Date.parse(entry.firstSeenAt) < 24 * 60 * 60 * 1000;
}

async function loadSelectedUserLoginIps(telegramId: string) {
  selectedUserLoginIps.value = [];
  selectedUserLoginIpsError.value = false;
  if (!canViewLoginIps.value) return;

  selectedUserLoginIpsLoading.value = true;
  try {
    selectedUserLoginIps.value = (await getAdminUserLoginIps(telegramId)).loginIps;
  } catch {
    selectedUserLoginIpsError.value = true;
  } finally {
    selectedUserLoginIpsLoading.value = false;
  }
}

async function selectUser(user: AdminStatsUser) {
  resetAccessSaveState();
  applySelectedUser(user);
  selectedUserDisplayName.value = user.displayName || user.firstName || user.username || "";
  selectedUserDisplayNameError.value = null;
  if (!props.clientCardOnly) {
    openAdminTask(`/admin/clients/${user.telegramId}`);
  }
  try {
    selectedUserDetail.value = await getAdminUserDetail(user.telegramId);
    applySelectedUser(selectedUserDetail.value.user);
    await loadSelectedUserLoginIps(user.telegramId);
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

async function openClientMessageModal() {
  clientMessageText.value = "";
  clientMessageFiles.value = [];
  clientMessageOpen.value = true;
  await nextTick();
  clientMessageInputRef.value?.focus({ preventScroll: true });
}

function closeClientMessageModal() {
  clientMessageOpen.value = false;
  clientMessageText.value = "";
  clientMessageFiles.value = [];
}

function updateClientMessageFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  clientMessageFiles.value = Array.from(input.files ?? []).slice(0, 4);
  input.value = "";
}

function resetClientFilters() {
  search.value = "";
  subscriptionFilter.value = "all";
  tariffFilter.value = "all";
  restrictionFilter.value = "all";
  sourceFilter.value = allClientSourcesFilter;
  utmFieldFilter.value = "all";
  utmValueFilter.value = "";
}

function setStatus(text: string) {
  message.value = text;
  error.value = null;
  notifications.showSuccess(text);
}

function setError(text: string) {
  error.value = text;
  message.value = null;
  notifications.showError(text);
}

function clearAdminFeedback() {
  error.value = null;
  message.value = null;
}

function showSuccessAlert(text: string) {
  setStatus(text);
}

function storageSourceLabel(source: S3StorageSettings["source"]) {
  if (source === "database") {
    return "настройка из админки";
  }

  if (source === "environment") {
    return "переменные сервера";
  }

  return "не подключено";
}

function fillStorageForm(settings: S3StorageSettings | null) {
  storageForm.value = {
    endpoint: settings?.endpoint ?? "",
    region: settings?.region ?? "us-east-1",
    bucket: settings?.bucket ?? "",
    accessKeyId: "",
    secretAccessKey: "",
    publicBaseUrl: settings?.publicBaseUrl ?? "",
    reserveEndpoint: settings?.reserveEndpoint ?? "",
    reserveRegion: settings?.reserveRegion ?? "us-east-1",
    reserveBucket: settings?.reserveBucket ?? "",
    reserveAccessKeyId: "",
    reserveSecretAccessKey: "",
    reservePublicBaseUrl: settings?.reservePublicBaseUrl ?? "",
    signedUrlTtlSeconds: settings?.signedUrlTtlSeconds ?? 3600
  };
}

function formatStorageSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }

  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}


function storageObjectFileName(key: string) {
  return key.split("/").filter(Boolean).at(-1) ?? key;
}

async function openStorageFolder(folder: (typeof storagePrefixOptions)[number]) {
  selectedStorageFolder.value = folder;
  storagePrefix.value = folder.value;
  storageSearch.value = "";
  storageFolderSort.value = "date";
  await loadStorageObjects();
  showStorageFolderModal.value = true;
  openAdminTask(`/admin/storage/folders/${encodeURIComponent(folder.value || "all")}`);
}

async function openStorageSettings() {
  const confirmed = await appDialogs.confirm({
    title: "Открыть настройки хранилища?",
    description: "Неверные параметры S3 могут сделать файлы клуба временно недоступными.",
    confirmLabel: "Открыть настройки",
    tone: "danger"
  });
  if (confirmed) {
    showStorageSettingsModal.value = true;
    openAdminTask("/admin/storage/settings");
  }
}

async function openStorageStatusActions(target: "primary" | "reserve") {
  if (selectedStorageTarget.value !== target) {
    storageObjects.value = [];
    storageOverviewObjects.value = [];
    storageObjectsCursor.value = null;
    storagePrefix.value = "";
  }
  selectedStorageTarget.value = target;
  await nextTick();
  if (selectedStorageTargetConfigured.value) {
    void loadStorageObjects();
  }
  storagePanelRef.value?.focusStorageActions();
}

function openSelectedStorageFiles() {
  if (!selectedStorageTargetConfigured.value) {
    openStorageSettings();
    return;
  }

  showStorageFilesModal.value = true;
  openAdminTask("/admin/storage/files");
}

function closeStorageFiles() {
  showStorageFilesModal.value = false;
  closeAdminTask();
}

function closeStorageFolder() {
  showStorageFolderModal.value = false;
  selectedStorageFolder.value = null;
  closeAdminTask();
}

function closeStorageSettings() {
  showStorageSettingsModal.value = false;
  closeAdminTask();
}

function closeStorageTask(task: "files" | "folder" | "settings") {
  if (task === "files") {
    closeStorageFiles();
    return;
  }

  if (task === "folder") {
    closeStorageFolder();
    return;
  }

  closeStorageSettings();
}

async function loadStorageObjects({ append = false } = {}) {
  if (!isOwner.value || !selectedStorageTargetConfigured.value) {
    storageObjects.value = [];
    storageOverviewObjects.value = [];
    storageObjectsCursor.value = null;
    return;
  }

  storageObjectsLoading.value = true;
  try {
    const response = await getAdminS3Objects(storagePrefix.value, append ? storageObjectsCursor.value : null, selectedStorageTarget.value);
    storageObjects.value = append ? [...storageObjects.value, ...response.objects] : response.objects;
    if (!storagePrefix.value && !append) {
      storageOverviewObjects.value = response.objects;
    }
    storageObjectsCursor.value = response.nextCursor;
  } catch {
    setError("Не удалось загрузить список файлов S3.");
  } finally {
    storageObjectsLoading.value = false;
  }
}

async function openStorageObject(item: S3StorageObject) {
  try {
    const response = await getAdminS3ObjectUrl(item.key, selectedStorageTarget.value);
    window.open(response.url, "_blank", "noopener,noreferrer");
  } catch {
    setError("Не удалось открыть файл.");
  }
}

async function handleDeleteStorageObject(item: S3StorageObject) {
  const confirmed = await appDialogs.confirm({
    title: "Удалить файл из S3?",
    description: item.key,
    confirmLabel: "Удалить файл",
    tone: "danger"
  });
  if (!confirmed) {
    return;
  }

  storageObjectsLoading.value = true;
  try {
    await deleteAdminS3Object(item.key, selectedStorageTarget.value);
    storageObjects.value = storageObjects.value.filter((object) => object.key !== item.key);
    storageOverviewObjects.value = storageOverviewObjects.value.filter((object) => object.key !== item.key);
    setStatus("Файл удалён из S3.");
  } catch {
    setError("Не удалось удалить файл из S3.");
  } finally {
    storageObjectsLoading.value = false;
  }
}

async function loadStorageSettings() {
  if (!isOwner.value) {
    storageSettings.value = null;
    storageObjects.value = [];
    storageOverviewObjects.value = [];
    storageObjectsCursor.value = null;
    showStorageFilesModal.value = false;
    showStorageFolderModal.value = false;
    selectedStorageFolder.value = null;
    showStorageSettingsModal.value = false;
    fillStorageForm(null);
    return;
  }

  const response = await getAdminS3StorageSettings();
  storageSettings.value = response.settings;
  fillStorageForm(response.settings);
  if (response.settings.configured) {
    await loadStorageObjects();
  }
}

async function handleSaveStorageSettings() {
  if (!isOwner.value) {
    setError("Настройки хранилища может менять только главный админ.");
    return;
  }

  if (!storageForm.value.endpoint.trim() || !storageForm.value.bucket.trim() || !storageForm.value.region.trim()) {
    setError("Заполните Endpoint URL, Bucket и Region.");
    return;
  }

  saving.value = true;
  try {
    const payload: {
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      publicBaseUrl?: string | null;
      reserveEndpoint?: string;
      reserveRegion?: string;
      reserveBucket?: string;
      reserveAccessKeyId?: string;
      reserveSecretAccessKey?: string;
      reservePublicBaseUrl?: string | null;
      signedUrlTtlSeconds: number;
    } = {
      endpoint: storageForm.value.endpoint.trim(),
      region: storageForm.value.region.trim(),
      bucket: storageForm.value.bucket.trim(),
      publicBaseUrl: storageForm.value.publicBaseUrl.trim() || null,
      reserveEndpoint: storageForm.value.reserveEndpoint.trim(),
      reserveRegion: storageForm.value.reserveRegion.trim() || "us-east-1",
      reserveBucket: storageForm.value.reserveBucket.trim(),
      reservePublicBaseUrl: storageForm.value.reservePublicBaseUrl.trim() || null,
      signedUrlTtlSeconds: Number(storageForm.value.signedUrlTtlSeconds || 3600)
    };
    const accessKeyId = storageForm.value.accessKeyId.trim();
    const secretAccessKey = storageForm.value.secretAccessKey.trim();
    if (accessKeyId) {
      payload.accessKeyId = accessKeyId;
    }
    if (secretAccessKey) {
      payload.secretAccessKey = secretAccessKey;
    }
    const reserveAccessKeyId = storageForm.value.reserveAccessKeyId.trim();
    const reserveSecretAccessKey = storageForm.value.reserveSecretAccessKey.trim();
    if (reserveAccessKeyId) {
      payload.reserveAccessKeyId = reserveAccessKeyId;
    }
    if (reserveSecretAccessKey) {
      payload.reserveSecretAccessKey = reserveSecretAccessKey;
    }

    const response = await updateAdminS3StorageSettings(payload);
    storageSettings.value = response.settings;
    fillStorageForm(response.settings);
    showStorageSettingsModal.value = false;
    await loadStorageObjects();
    showSuccessAlert("S3-хранилище сохранено.");
  } catch {
    setError("Не удалось подключиться к S3. Проверьте endpoint, bucket, region и ключи.");
  } finally {
    saving.value = false;
  }
}

async function loadAll() {
  if (isMemberPreviewMode.value) {
    clearAdminFeedback();
    return;
  }

  loading.value = true;
  try {
    const shouldLoadAdmins = hasCurrentAdminPermission("admins");
    const shouldLoadStats = hasCurrentAdminPermission("statistics") || hasCurrentAdminPermission("users");
    const shouldLoadLearning = hasCurrentAdminPermission("materials");
    const shouldLoadPayments = hasCurrentAdminPermission("payments") || hasCurrentAdminPermission("statistics");
    const shouldLoadCommunity = hasCurrentAdminPermission("community");
    const shouldLoadMailings = hasCurrentAdminPermission("mailings");
    const shouldLoadAdminActions = hasCurrentAdminPermission("admins");
    const [
      adminsResponse,
      statsResponse,
      learningResponse,
      paymentsResponse,
      topicsResponse,
      mailingsResponse,
      actionLogsResponse
    ] = await Promise.all([
      shouldLoadAdmins ? getAdminUsers() : Promise.resolve(null),
      shouldLoadStats ? getAdminStats() : Promise.resolve(null),
      shouldLoadLearning ? getAdminLearning() : Promise.resolve(null),
      shouldLoadPayments ? getAdminPaymentHistory() : Promise.resolve(null),
      shouldLoadCommunity ? getCommunityTopics() : Promise.resolve(null),
      shouldLoadMailings ? getAdminMailings() : Promise.resolve(null),
      shouldLoadAdminActions ? getAdminActionLogs(adminActionActorFilter.value || undefined) : Promise.resolve(null)
    ]);
    if (adminsResponse) {
      ownerTelegramId.value = adminsResponse.ownerTelegramId;
      admins.value = adminsResponse.admins;
    }
    if (statsResponse) {
      users.value = statsResponse.users;
      communityMessages.value = statsResponse.communityMessages ?? [];
      pollStats.value = statsResponse.pollStats;
    }
    if (paymentsResponse) {
      paymentOrders.value = paymentsResponse.orders;
    }
    if (topicsResponse) {
      communityTopics.value = topicsResponse.topics;
    }
    if (mailingsResponse) {
      mailings.value = mailingsResponse.mailings;
      mailingEmailQuota.value = mailingsResponse.emailQuota;
    }
    if (actionLogsResponse) {
      adminActionAdmins.value = actionLogsResponse.admins;
      adminActionLogs.value = actionLogsResponse.logs;
    }
    if (learningResponse) {
      learningCategories.value = learningResponse.categories;
      learningMaterials.value = learningResponse.materials;
      if (!materialCategoryId.value && learningResponse.categories[0]) {
        materialCategoryId.value = learningResponse.categories[0].id;
      }
    }
    if (selectedUser.value && statsResponse) {
      const updated = statsResponse.users.find((user) => user.telegramId === selectedUser.value?.telegramId);
      if (updated) {
        applySelectedUser(updated);
      }
    }
    if (pendingOpenClientTelegramId.value && statsResponse) {
      const pendingUser = statsResponse.users.find((user) => user.telegramId === pendingOpenClientTelegramId.value);
      if (pendingUser) {
        const telegramId = pendingOpenClientTelegramId.value;
        pendingOpenClientTelegramId.value = null;
        activePanel.value = "users";
        await selectUser(pendingUser);
        if (props.openClientTelegramId === telegramId) {
          pendingOpenClientTelegramId.value = null;
        }
      }
    }
    if (canUseStorage.value) {
      await loadStorageSettings();
    }
  } catch {
    if (isMemberPreviewMode.value) {
      clearAdminFeedback();
      return;
    }
    setError("Не удалось загрузить админку.");
  } finally {
    loading.value = false;
  }
}

async function saveSelectedUserAccess(status: "active" | "inactive", expiresAtValue: string, successText: string, action: ClientAccessAction) {
  const telegramId = selectedUser.value?.telegramId;
  if (!telegramId) {
    return;
  }
  if (pendingClientAccessAction.value) {
    return;
  }
  if (!canGrantClientAccess.value) {
    setError("Нет права на выдачу доступов.");
    return;
  }
  if (selectedUser.value && !canManageSelectedUser.value) {
    setError("Менять доступ администраторов может только главный админ.");
    return;
  }

  saving.value = true;
  pendingClientAccessAction.value = action;
  try {
    const response = await updateAdminUserAccess({
      telegramId,
      status,
      expiresAt: expiresAtValue ? new Date(`${expiresAtValue}T23:59:59.000Z`).toISOString() : null
    });
    applySelectedUser(response.user);
    selectedUserDetail.value = await getAdminUserDetail(response.user.telegramId);
    await loadAll();
    markAccessSaved();
    setStatus(successText);
  } catch {
    setError("Не удалось сохранить доступ.");
  } finally {
    pendingClientAccessAction.value = null;
    saving.value = false;
  }
}

async function handleOpenAccess() {
  accessStatus.value = "active";
  await saveSelectedUserAccess("active", accessExpiresAt.value, "Доступ открыт.", "open");
}

async function handleCloseAccess() {
  accessStatus.value = "inactive";
  accessExpiresAt.value = "";
  await saveSelectedUserAccess("inactive", "", "Доступ закрыт.", "close");
}

async function handleExtendAccess(days: number) {
  extendAccess(days);
  await saveSelectedUserAccess("active", accessExpiresAt.value, `Доступ продлён на ${days} дней.`, days === 7 ? "extend7" : "extend30");
}

async function handleManualAccessSave() {
  accessStatus.value = "active";
  await saveSelectedUserAccess("active", accessExpiresAt.value, "Ручной доступ сохранён.", "manual");
}

async function submitClientMessage() {
  const telegramId = selectedUser.value?.telegramId;
  if (!telegramId) {
    return;
  }

  const text = clientMessageText.value.trim();
  if (!text && clientMessageFiles.value.length === 0) {
    setError("Напишите сообщение или приложите файл.");
    return;
  }

  saving.value = true;
  sendingClientMessage.value = true;
  const form = new FormData();
  form.set("message", text);
  clientMessageFiles.value.forEach((file) => form.append("attachments", file));

  try {
    await createAdminClientSupportTicket(telegramId, form);
    closeClientMessageModal();
    setStatus("Сообщение отправлено клиенту.");
  } catch (requestError) {
    const errorPayload = requestError as { data?: { error?: string } };
    setError(errorPayload.data?.error ?? "Не удалось отправить сообщение клиенту.");
  } finally {
    sendingClientMessage.value = false;
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







function openTransferOwnerModal() {
  transferOwnerTelegramId.value = admins.value[0]?.telegramId ?? "";
  showTransferOwnerModal.value = true;
  openAdminTask("/admin/owner/transfer");
}

function closeTransferOwnerModal() {
  showTransferOwnerConfirm.value = false;
  showTransferOwnerModal.value = false;
  transferOwnerTelegramId.value = "";
  closeAdminTask();
}








async function handleAddAdmin(telegramId = resolveAdminSearchTelegramId()) {
  if (!telegramId) {
    return;
  }

  saving.value = true;
  try {
    await addAdminUser(telegramId);
    adminSearchQuery.value = "";
    await reloadAdmins();
    await loadAdminActionLogs();
    setStatus("Админ добавлен.");
  } catch {
    setError("Не удалось добавить админа.");
  } finally {
    saving.value = false;
  }
}

async function handleUpdateAdminAccess(admin: AdminUser, patch: { roleLabel?: string | null; isActive?: boolean; permissions?: AdminPermission[] }) {
  saving.value = true;
  try {
    await updateAdminUserPermissions(admin.telegramId, patch);
    await reloadAdmins();
    await loadAdminActionLogs();
    await session.load({ silent: true });
  } catch {
    setError("Не удалось сохранить права админа.");
  } finally {
    saving.value = false;
  }
}

async function handleAdminRoleLabelChange(admin: AdminUser, event: Event) {
  const roleLabel = event.target instanceof HTMLInputElement ? event.target.value : "";
  await handleUpdateAdminAccess(admin, { roleLabel });
}

async function toggleAdminPermission(admin: AdminUser, permission: AdminPermission) {
  const nextPermissions = hasAdminPermissionEntry(admin, permission)
    ? admin.permissions.filter((entry) => entry !== permission)
    : [...admin.permissions, permission];

  await handleUpdateAdminAccess(admin, { permissions: nextPermissions });
}

async function handleRemoveAdmin(telegramId: string) {
  saving.value = true;
  try {
    await removeAdminUser(telegramId);
    const response = await getAdminUsers();
    admins.value = response.admins;
    ownerTelegramId.value = response.ownerTelegramId;
    await loadAdminActionLogs();
    if (selectedAdminAccess.value?.telegramId === telegramId) {
      closeAdminAccessModal();
    }
    setStatus("Админ удалён.");
  } catch {
    setError("Не удалось удалить админа.");
  } finally {
    saving.value = false;
  }
}

function requestTransferOwnerConfirmation() {
  if (!transferOwnerTelegramId.value) {
    setError("Выберите администратора для передачи клуба.");
    return;
  }

  showTransferOwnerConfirm.value = true;
}

async function handleTransferOwner() {
  if (!transferOwnerTelegramId.value) return;

  showTransferOwnerConfirm.value = false;
  saving.value = true;
  try {
    await transferClubOwner(transferOwnerTelegramId.value);
  } catch {
    setError("Не удалось передать клуб. Проверьте, что выбранный пользователь остаётся администратором.");
    return;
  } finally {
    saving.value = false;
  }

  closeTransferOwnerModal();
  setStatus("Клуб передан новому владельцу.");
  void Promise.allSettled([session.load()]);
}

function resetAdminTaskState() {
  showReleaseNotesModal.value = false;
  selectedPaymentBreakdown.value = null;
  selectedUserDrilldown.value = null;
  selectedUser.value = null;
  selectedUserDetail.value = null;
  selectedUserLoginIps.value = [];
  selectedMailing.value = null;
  showMailingComposer.value = false;
  showMailingHistory.value = false;
  showStorageFilesModal.value = false;
  showStorageFolderModal.value = false;
  showStorageSettingsModal.value = false;
  showTransferOwnerModal.value = false;
  showTransferOwnerConfirm.value = false;
  selectedAdminAccess.value = null;
  clientMessageOpen.value = false;
}

async function syncAdminTaskRoute() {
  if (props.clientCardOnly) {
    return;
  }

  const path = route.path;
  if (!path.startsWith("/admin/")) {
    resetAdminTaskState();
    return;
  }

  const requestedPanel = getAdminPanelForTaskPath(path);
  const ownerTaskDenied = requestedPanel === "owner-only" && !isOwner.value;
  const developerTaskDenied = requestedPanel === "developer-only" && !canViewReleaseNotes.value;
  const panelTaskDenied =
    requestedPanel !== null &&
    requestedPanel !== "owner-only" &&
    requestedPanel !== "developer-only" &&
    !panels.value.some((panel) => panel.id === requestedPanel);
  if (ownerTaskDenied || developerTaskDenied || panelTaskDenied) {
    resetAdminTaskState();
    await router.replace("/admin");
    return;
  }

  if (path === "/admin/releases" && canViewReleaseNotes.value) {
    showReleaseNotesModal.value = true;
    return;
  }
  if (path === "/admin/mailings/new") {
    activePanel.value = "mailings";
    showMailingHistory.value = false;
    if (!showMailingComposer.value) await openMailingComposer();
    return;
  }
  if (path === "/admin/mailings/history") {
    activePanel.value = "mailings";
    showMailingComposer.value = false;
    showMailingHistory.value = true;
    if (!mailings.value.length) void loadMailings().catch(() => null);
    return;
  }
  const mailingMatch = path.match(/^\/admin\/mailings\/([^/]+)$/);
  if (mailingMatch) {
    activePanel.value = "mailings";
    showMailingHistory.value = false;
    const mailingId = decodeURIComponent(mailingMatch[1]!);
    selectedMailing.value = mailings.value.find((item) => item.id === mailingId) ?? null;
    if (!selectedMailing.value) {
      await loadMailings().catch(() => null);
      if (route.path !== path) return;
      selectedMailing.value = mailings.value.find((item) => item.id === mailingId) ?? null;
    }
    return;
  }
  const clientMatch = path.match(/^\/admin\/clients\/([^/]+)$/);
  if (clientMatch) {
    activePanel.value = "users";
    const telegramId = decodeURIComponent(clientMatch[1]!);
    const user = users.value.find((item) => item.telegramId === telegramId);
    if (user && selectedUser.value?.telegramId !== telegramId) await selectUser(user);
    return;
  }
  if (path === "/admin/storage/files" || path === "/admin/storage") {
    activePanel.value = "storage";
    showStorageFilesModal.value = true;
    return;
  }
  if (path === "/admin/storage/settings") {
    activePanel.value = "storage";
    showStorageSettingsModal.value = true;
    return;
  }
  const storageFolderMatch =
    path.match(/^\/admin\/storage\/folders\/([^/]+)$/) ?? path.match(/^\/admin\/storage\/(?!files$|settings$)([^/]+)$/);
  if (storageFolderMatch) {
    activePanel.value = "storage";
    const folderId = decodeURIComponent(storageFolderMatch[1]!);
    const folder = storagePrefixOptions.find((item) => (item.value || "all") === folderId);
    if (folder && selectedStorageFolder.value?.value !== folder.value) await openStorageFolder(folder);
    return;
  }
  if (path === "/admin/server/logs" || path === "/admin/server") {
    activePanel.value = "server-logs";
    return;
  }
  if (path === "/admin/owner/transfer") {
    activePanel.value = "admins";
    showTransferOwnerModal.value = true;
    transferOwnerTelegramId.value ||= admins.value[0]?.telegramId ?? "";
    return;
  }
  const adminMatch = path.match(/^\/admin\/admins\/([^/]+)\/access$/) ?? path.match(/^\/admin\/admins\/([^/]+)$/);
  if (adminMatch) {
    activePanel.value = "admins";
    const adminId = decodeURIComponent(adminMatch[1]!);
    selectedAdminAccess.value = admins.value.find((item) => item.id === adminId) ?? null;
    return;
  }
  const paymentStatsMatch =
    path.match(/^\/admin\/statistics\/payments\/([^/]+)$/) ?? path.match(/^\/admin\/statistics\/payments-(.+)$/);
  if (paymentStatsMatch) {
    activePanel.value = "statistics";
    const key = decodeURIComponent(paymentStatsMatch[1]!);
    selectedPaymentBreakdown.value = resolvePaymentBreakdownItem(key, adminStatistics.value.payments.breakdown);
    return;
  }
  const userStatsMatch =
    path.match(/^\/admin\/statistics\/users\/([^/]+)$/) ?? path.match(/^\/admin\/statistics\/(access-.+|tariff-.+)$/);
  if (userStatsMatch) {
    activePanel.value = "statistics";
    const segment = decodeURIComponent(userStatsMatch[1]!);
    if (segment.startsWith("access-")) {
      const item = adminStatistics.value.clients.accessBreakdown.find((entry) => entry.key === segment.slice("access-".length));
      if (item) selectedUserDrilldown.value = { kind: "access", key: item.key, title: item.label };
      return;
    }
    if (segment.startsWith("tariff-")) {
      const tariff = segment.slice("tariff-".length);
      selectedUserDrilldown.value = { kind: "tariff", tariff, title: getAdminTariffLabel(tariff) };
      return;
    }
  }
}

onMounted(() => {
  // Route-only task screens must not wait for every admin dashboard request.
  // Data-backed routes are synchronized again after the dashboard finishes loading.
  void syncAdminTaskRoute();
  void loadAll().then(syncAdminTaskRoute);
});

watch(
  () => route.path,
  () => void syncAdminTaskRoute()
);

watch(
  panels,
  (availablePanels) => {
    const firstPanel = availablePanels[0];
    if (firstPanel && !availablePanels.some((panel) => panel.id === activePanel.value)) {
      activePanel.value = firstPanel.id;
    }
  },
  { immediate: true }
);

watch(adminPermissionStateKey, () => {
  resetAdminTaskState();
  void syncAdminTaskRoute();
  void loadAll().then(syncAdminTaskRoute);
});

watch(
  [() => session.user?.realRole, () => ui.previewMode] as const,
  ([realRole, previewMode]) => {
    const normalized = normalizeAdminPreviewMode(realRole, previewMode);
    if (normalized !== previewMode) {
      ui.setPreviewMode(normalized);
    }
  },
  { immediate: true }
);

watch(
  () => props.openClientTelegramId,
  (telegramId) => {
    if (telegramId) {
      void openClientByTelegramId(telegramId);
    }
  },
  { immediate: true }
);

watch(
  [
    () => activePanel.value,
    () => mailingChannel.value,
    () => mailingFilters.value.accessStatus,
    () => mailingFilters.value.accessType,
    () => mailingFilters.value.excludeAdmins,
    () => mailingFilters.value.excludeRestricted
  ],
  () => {
    if (activePanel.value !== "mailings") {
      return;
    }

    scheduleMailingPreview();
    void loadMailings().catch(() => null);
  },
  { immediate: true }
);

watch(
  () => adminActionActorFilter.value,
  () => {
    if (activePanel.value === "admins") {
      void loadAdminActionLogs().catch(() => null);
    }
  }
);

onUnmounted(() => {
  resetAccessSaveState();
  if (mailingPreviewTimer) {
    window.clearTimeout(mailingPreviewTimer);
    mailingPreviewTimer = null;
  }
});
</script>

<template>
  <section class="admin-shell ui-page-section" :class="{ 'admin-shell-client-card-only': props.clientCardOnly }">
    <UiPageHeader title="Админка" subtitle="Клиенты, доступ и ограничения.">
      <template #actions>
        <div class="admin-head-actions">
        <button v-if="canViewReleaseNotes" class="app-version-badge ui-button" type="button" aria-label="Открыть список обновлений" @click="openReleaseNotesModal">
          <span>v{{ appVersion }}</span>
          <small>{{ appVersionUpdatedAt }}</small>
        </button>
        <section v-if="isOwner" class="admin-preview-switcher" aria-label="Вид как">
          <div>
            <button
              v-for="option in previewModeOptions"
              :key="option.value"
              class="admin-preview-option ui-button"
              :class="{ 'admin-preview-option-active': ui.previewMode === option.value }"
              type="button"
              @click="handlePreviewModeChange(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </section>
        </div>
      </template>
    </UiPageHeader>

    <AdminReleaseNotesTask
      v-if="(showReleaseNotesModal || route.path === '/admin/releases') && canViewReleaseNotes"
      @back="closeReleaseNotesModal"
    />

    <TaskScreen v-if="activePaymentBreakdown" class="admin-task-screen" :title="activePaymentBreakdown.label" :subtitle="`${paymentDrilldownOrders.length} записей`" portal @back="closePaymentDrilldown">
        <section class="admin-detail ui-card admin-client-modal admin-payment-drilldown-modal">
          <header class="admin-client-modal-head">
            <div>
              <h3 id="payment-drilldown-title">{{ activePaymentBreakdown.label }}</h3>
              <p>{{ paymentDrilldownOrders.length }} записей. Нажмите строку, чтобы открыть клиента.</p>
            </div>
            <button class="icon-button ui-icon-button" type="button" aria-label="Закрыть детализацию оплат" @click="closePaymentDrilldown">
              <X class="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div class="admin-payment-drilldown-list">
            <button
              v-for="order in paymentDrilldownOrders"
              :key="order.id"
              class="admin-payment-drilldown-card ui-card"
              type="button"
              @click="openPaymentDrilldownUser(order)"
            >
              <span class="admin-payment-customer-avatar">
                <img v-if="order.customer.photoUrl" :src="order.customer.photoUrl" :alt="paymentCustomerTitle(order)" loading="lazy" decoding="async" />
                <span v-else>{{ paymentCustomerInitial(order) }}</span>
              </span>
              <span class="admin-payment-drilldown-copy">
                <strong>{{ paymentCustomerTitle(order) }}</strong>
                <small>ID {{ order.customer.telegramId }} · {{ order.productTitle }}</small>
                <em>
                  {{ paymentOrderDate(order) }} · {{ formatAdminPaymentMoney(order) }} ·
                  {{ order.productKind === "recurrent" ? "Рекуррент" : "Разовый" }} · {{ order.provider === "lava" ? "Lava" : "Prodamus" }}
                </em>
              </span>
              <span :class="`payment-status-${order.status}`">{{ paymentOrderStatusLabel(order.status) }}</span>
            </button>
            <p v-if="!paymentDrilldownOrders.length" class="admin-empty">Записей по этому показателю пока нет.</p>
          </div>
        </section>
    </TaskScreen>

    <TaskScreen v-if="activeUserDrilldown" class="admin-task-screen" :title="activeUserDrilldown.title" :subtitle="`${userDrilldownUsers.length} клиентов`" portal @back="closeUserDrilldown">
        <section class="admin-detail ui-card admin-client-modal admin-payment-drilldown-modal">
          <header class="admin-client-modal-head">
            <div>
              <h3 id="user-drilldown-title">{{ activeUserDrilldown.title }}</h3>
              <p>{{ userDrilldownUsers.length }} клиентов. Нажмите строку, чтобы открыть карточку.</p>
            </div>
            <button class="icon-button ui-icon-button" type="button" aria-label="Закрыть детализацию клиентов" @click="closeUserDrilldown">
              <X class="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div class="admin-payment-drilldown-list">
            <button
              v-for="user in userDrilldownUsers"
              :key="user.id"
              class="admin-user-drilldown-card ui-card"
              type="button"
              @click="openUserDrilldownClient(user)"
            >
              <span class="admin-payment-customer-avatar">
                <img v-if="user.photoUrl" :src="user.photoUrl" :alt="userTitle(user)" loading="lazy" decoding="async" />
                <span v-else>{{ userInitial(user) }}</span>
              </span>
              <span class="admin-payment-drilldown-copy">
                <strong>{{ userTitle(user) }}</strong>
                <small>ID {{ user.telegramId }} · {{ adminRoleLabel(user.role) }} · {{ getAdminTariffLabel(user.tariff) }}</small>
                <em>
                  {{ formatMembershipStatus(user.membershipStatus) }}
                  <template v-if="user.membershipExpiresAt"> · до {{ new Date(user.membershipExpiresAt).toLocaleDateString("ru-RU") }}</template>
                  <template v-if="user.hasRestrictions"> · есть ограничения</template>
                </em>
              </span>
              <span :class="`membership-history-status-${user.membershipStatus}`">{{ formatMembershipStatus(user.membershipStatus) }}</span>
            </button>
            <p v-if="!userDrilldownUsers.length" class="admin-empty">Клиентов по этому показателю пока нет.</p>
          </div>
        </section>
    </TaskScreen>

    <div class="admin-tabs ui-responsive-grid">
      <button
        v-for="panel in panels"
        :key="panel.id"
        class="admin-tab ui-button"
        :class="{ 'admin-tab-active': activePanel === panel.id }"
        type="button"
        @click="selectAdminPanel(panel.id)"
      >
        <component :is="panel.icon" class="h-4 w-4" aria-hidden="true" />
        <span>{{ panel.label }}</span>
      </button>
    </div>

    <p v-if="message" class="admin-status admin-status-ok">{{ message }}</p>
    <p v-if="error" class="admin-status admin-status-error">{{ error }}</p>

    <section v-if="activePanel === 'statistics'" class="admin-panel ui-page-section admin-statistics-panel">
      <div class="admin-panel-head ui-page-header admin-statistics-head">
        <div>
          <h3>Аналитика клуба</h3>
          <p>Клиенты, оплаты, контент и общение по выбранному периоду.</p>
        </div>
        <div class="admin-stat-period-control">
          <div class="admin-stat-periods" aria-label="Период статистики">
            <button
              v-for="period in statisticsPeriodOptions"
              :key="period.value"
              class="admin-stat-period ui-button"
              :class="{ 'admin-stat-period-active': statisticsPeriod === period.value }"
              type="button"
              @click="selectStatisticsPeriod(period.value)"
            >
              {{ period.label }}
            </button>
          </div>
          <div v-if="statisticsPeriod === 'custom'" class="admin-stat-custom-period">
            <label>
              <span>С</span>
              <input v-model="statisticsCustomFrom" type="date" />
            </label>
            <label>
              <span>По</span>
              <input v-model="statisticsCustomTo" type="date" />
            </label>
          </div>
        </div>
      </div>

      <div class="admin-stat-period-summary ui-card">
        <article><span>Выручка</span><strong>{{ adminStatistics.payments.revenueRub.toLocaleString("ru-RU") }} ₽</strong><small>{{ adminStatistics.payments.paidOrders }} оплат за выбранный период</small></article>
        <article><span>Новые клиенты</span><strong>+{{ adminStatistics.clients.newInPeriod }}</strong><small>за выбранный период</small></article>
      </div>

      <p v-if="adminStatistics.clients.expiringSoon || adminStatistics.payments.failedOrders || adminStatistics.payments.failedWebhookOrders" class="admin-stat-alert-line">
        Требуют внимания: {{ adminStatistics.clients.expiringSoon }} доступов истекают, {{ adminStatistics.payments.failedOrders + adminStatistics.payments.failedWebhookOrders }} ошибок оплаты
      </p>

      <div class="admin-stat-overview-nav">
        <button class="admin-stat-nav-row ui-button" type="button" @click="openStatisticsDetail('acquisition')">
          <span class="admin-stat-nav-icon"><Link2 aria-hidden="true" /></span><span class="admin-stat-nav-copy"><strong>Рекламные ссылки</strong><small>UTM-метки и результаты</small></span><span class="admin-stat-nav-value"><strong>Переходы</strong><small>регистрации и оплаты</small></span><span class="admin-stat-nav-chevron"><ChevronRight aria-hidden="true" /></span>
        </button>
        <button class="admin-stat-nav-row ui-button" type="button" @click="openStatisticsDetail('clients')">
          <span class="admin-stat-nav-icon"><UsersRound aria-hidden="true" /></span><span class="admin-stat-nav-copy"><strong>Клиенты</strong><small>Состояние на сегодня</small></span><span class="admin-stat-nav-value"><strong>{{ adminStatistics.clients.active }} / {{ adminStatistics.clients.total }}</strong><small>активны</small></span><span class="admin-stat-nav-chevron"><ChevronRight aria-hidden="true" /></span>
        </button>
        <button class="admin-stat-nav-row ui-button" type="button" @click="openStatisticsDetail('finance')">
          <span class="admin-stat-nav-icon"><CreditCard aria-hidden="true" /></span><span class="admin-stat-nav-copy"><strong>Финансы</strong><small>За выбранный период</small></span><span class="admin-stat-nav-value"><strong>{{ adminStatistics.payments.revenueRub.toLocaleString("ru-RU") }} ₽</strong><small>{{ adminStatistics.payments.paidOrders }} оплат</small></span><span class="admin-stat-nav-chevron"><ChevronRight aria-hidden="true" /></span>
        </button>
        <button class="admin-stat-nav-row ui-button" type="button" @click="openStatisticsDetail('learning')">
          <span class="admin-stat-nav-icon"><BarChart3 aria-hidden="true" /></span><span class="admin-stat-nav-copy"><strong>Обучение</strong><small>Состояние на сегодня</small></span><span class="admin-stat-nav-value"><strong>{{ adminStatistics.learning.averageProgressPercent }}%</strong><small>прогресс</small></span><span class="admin-stat-nav-chevron"><ChevronRight aria-hidden="true" /></span>
        </button>
        <button class="admin-stat-nav-row ui-button" type="button" @click="openStatisticsDetail('community')">
          <span class="admin-stat-nav-icon"><Megaphone aria-hidden="true" /></span><span class="admin-stat-nav-copy"><strong>Общение</strong><small>За выбранный период</small></span><span class="admin-stat-nav-value"><strong>{{ adminStatistics.communication.messagesInPeriod }}</strong><small>сообщений</small></span><span class="admin-stat-nav-chevron"><ChevronRight aria-hidden="true" /></span>
        </button>
        <button class="admin-stat-nav-row ui-button" type="button" @click="openStatisticsDetail('polls')">
          <span class="admin-stat-nav-icon"><SlidersHorizontal aria-hidden="true" /></span><span class="admin-stat-nav-copy"><strong>Опросы</strong><small>За выбранный период</small></span><span class="admin-stat-nav-value"><strong>{{ pollStats.totalPolls }}</strong><small>{{ pollStats.uniqueParticipants }} участников</small></span><span class="admin-stat-nav-chevron"><ChevronRight aria-hidden="true" /></span>
        </button>
      </div>

      <TaskScreen v-if="activeStatisticsDetail" class="admin-statistics-task-screen" :title="statisticsDetailMeta.title" :subtitle="statisticsDetailMeta.subtitle" portal @back="closeStatisticsDetail">
        <template #actions>
          <span class="admin-stat-task-period">{{ statisticsPeriodShortLabel }}</span>
        </template>
        <AdminAcquisitionAnalytics
          v-if="activeStatisticsDetail === 'acquisition'"
          :from="statisticsDateRange?.from"
          :to="statisticsDateRange?.to"
          :learning-categories="learningCategories"
          @client="openAcquisitionClient"
        />
        <AdminLearningEngagement
          v-else-if="activeStatisticsDetail === 'learning'"
          :from="statisticsEngagementRange.from"
          :to="statisticsEngagementRange.to"
          @client="openAcquisitionClient"
        />
        <AdminStatisticsDetail v-else :detail="activeStatisticsDetail" :stats="adminStatistics" :poll-stats="pollStats" @access="openUserAccessDrilldown" @tariff="openUserTariffDrilldown" @payment="openPaymentDrilldown" />
      </TaskScreen>
    </section>

    <section v-else-if="activePanel === 'users'" class="admin-panel ui-page-section">
      <div class="admin-panel-head ui-page-header">
        <div>
          <h3>Клиенты и доступ</h3>
          <p>Поиск, продление доступа, быстрый мут и просмотр статистики.</p>
        </div>
      </div>

      <section class="admin-client-overview" aria-label="Сводка по клиентам">
        <article><span>Всего</span><strong>{{ totalUsers }}</strong></article>
        <article><span>С доступом</span><strong>{{ activeUsers }}</strong></article>
        <article><span>Ограничены</span><strong>{{ restrictedUsers }}</strong></article>
      </section>

      <div class="admin-client-searchbar">
        <input v-model.trim="search" class="text-input" placeholder="Поиск по ID, имени или username" />
        <span>Найдено: {{ filteredUsers.length }}</span>
      </div>
      <div class="admin-client-filter-chips" aria-label="Быстрые фильтры клиентов">
        <button type="button" :class="{ active: subscriptionFilter === 'all' && restrictionFilter === 'all' }" @click="subscriptionFilter = 'all'; restrictionFilter = 'all'">Все</button>
        <button type="button" :class="{ active: subscriptionFilter === 'active' }" @click="subscriptionFilter = 'active'; restrictionFilter = 'all'">Активные</button>
        <button type="button" :class="{ active: subscriptionFilter === 'closed' }" @click="subscriptionFilter = 'closed'; restrictionFilter = 'all'">Закрыты</button>
        <button type="button" :class="{ active: restrictionFilter === 'restricted' }" @click="restrictionFilter = 'restricted'; subscriptionFilter = 'all'">Ограничены</button>
      </div>
      <details class="admin-client-more-filters">
        <summary><SlidersHorizontal class="h-4 w-4" /> Дополнительные фильтры</summary>
        <div class="admin-filter-grid ui-responsive-grid">
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
        <div class="admin-client-acquisition-filters">
          <select v-model="sourceFilter" class="text-input" aria-label="Источник клиента">
            <option :value="allClientSourcesFilter">Любой источник</option>
            <option :value="untaggedClientSourceFilter">Без метки</option>
            <option v-for="source in clientSourceOptions" :key="source.value" :value="source.value">
              {{ source.label }}
            </option>
          </select>
          <select v-model="utmFieldFilter" class="text-input" aria-label="Поле UTM">
            <option value="all">Любая UTM-метка</option>
            <option value="source">utm_source</option>
            <option value="medium">utm_medium</option>
            <option value="campaign">utm_campaign</option>
            <option value="content">utm_content</option>
          </select>
          <input
            v-model.trim="utmValueFilter"
            class="text-input"
            aria-label="Значение UTM"
            placeholder="Значение UTM"
          />
        </div>
        <button class="secondary-button ui-button admin-filter-reset" type="button" :disabled="!filtersActive" @click="resetClientFilters">
          Сбросить
        </button>
        </div>
      </details>

      <div class="admin-user-layout">
        <div class="admin-list">
          <button
            v-for="user in filteredUsers"
            :key="user.id"
            class="admin-list-item ui-card admin-client-list-row"
            :class="{ 'admin-list-item-active': selectedUser?.id === user.id }"
            type="button"
            @click="selectUser(user)"
          >
            <span class="admin-client-list-avatar">
              <img v-if="user.photoUrl" :src="user.photoUrl" :alt="userTitle(user)" loading="lazy" decoding="async" />
              <span v-else>{{ userInitial(user) }}</span>
            </span>
            <span class="admin-list-item-main">
              <span class="admin-list-item-copy">
                <span class="admin-client-list-name-line">
                  <strong>{{ userTitle(user) }}</strong>
                  <small v-if="user.email">{{ user.email }}</small>
                </span>
              </span>
              <span class="admin-list-item-meta">
                <span>{{ getAdminTariffLabel(user.tariff) }}</span>
                <span class="admin-list-item-progress">Уроки {{ user.completedItems }}/{{ user.totalItems }}</span>
                <span>Вход {{ formatAdminCompactDateTime(user.lastLoginAt) }}</span>
              </span>
            </span>
            <span class="admin-list-badges">
              <em v-if="user.marketingEmailOptOutAt" class="admin-email-opt-out-badge">Email отключён</em>
              <em
                class="admin-access-badge"
                :class="`admin-access-badge-${getAdminClientAccessState(user).tone}`"
              >{{ getAdminClientAccessState(user).label }}</em>
            </span>
            <span class="admin-client-list-chevron"><ChevronRight aria-hidden="true" /></span>
          </button>
        </div>
      </div>

      <TaskScreen
        v-if="selectedUser && activePanel === 'users'"
        class="admin-task-screen admin-client-task-screen"
        :title="userTitle(selectedUser)"
        :subtitle="selectedUserMeta(selectedUser)"
        portal
        @back="closeSelectedUser"
      >
          <div class="admin-client-workspace">
            <header class="admin-client-identity admin-detail ui-card">
              <div class="admin-client-card-head">
                <span class="admin-client-avatar">
                  <img v-if="selectedUser.photoUrl" :src="selectedUser.photoUrl" :alt="userTitle(selectedUser)" />
                  <span v-else>{{ userInitial(selectedUser) }}</span>
                </span>
                <div class="admin-client-card-title">
                  <div class="admin-client-title-row">
                    <h3 id="admin-client-modal-title">{{ userTitle(selectedUser) }}</h3>
                  </div>
                  <p>{{ selectedUserMeta(selectedUser) }}</p>
                  <span class="admin-client-last-login">Последний вход: {{ formatAdminCompactDateTime(selectedUser.lastLoginAt) }}</span>
                </div>
              </div>
              <div class="admin-client-status-row">
                <span v-if="selectedUser.marketingEmailOptOutAt" class="admin-email-opt-out-badge">Email отключён</span>
                <span
                  class="admin-status-pill"
                  :class="`admin-access-badge-${getAdminClientAccessState(selectedUser).tone}`"
                >{{ getAdminClientAccessState(selectedUser).label }}</span>
                <span v-if="selectedUser.membershipExpiresAt" class="admin-status-pill admin-status-pill-yellow">до {{ formatAdminShortDate(selectedUser.membershipExpiresAt) }}</span>
                <span class="admin-status-pill admin-status-pill-blue">{{ getAdminTariffLabel(selectedUser.tariff) }}</span>
              </div>
            </header>

            <section class="admin-client-kpi-grid" aria-label="Краткая сводка клиента">
              <article class="admin-client-kpi">
                <span>Доступ</span>
                <strong>{{ selectedUser.membershipExpiresAt ? `до ${formatAdminShortDate(selectedUser.membershipExpiresAt)}` : formatMembershipStatus(selectedUser.membershipStatus) }}</strong>
              </article>
              <article class="admin-client-kpi">
                <span>Обучение</span>
                <strong>{{ selectedUser.completedItems }} / {{ selectedUser.totalItems }}</strong>
              </article>
              <article class="admin-client-kpi">
                <span>Оплаты</span>
                <strong>{{ selectedUserPaidTotal.toLocaleString("ru-RU") }} ₽</strong>
              </article>
              <article class="admin-client-kpi">
                <span>Последнее действие</span>
                <strong>{{ selectedUser.lastOpenedItemTitle ?? "Нет активности" }}</strong>
              </article>
            </section>

            <section class="admin-client-action-panel admin-detail ui-card" aria-label="Действия с клиентом">
              <div class="admin-client-action-head">
                <strong>Действие</strong>
                <small>{{ getAccessActionSummary(selectedUser) }}</small>
              </div>
              <div class="admin-access-toggle">
                <button
                  class="admin-access-open"
                  :class="{ 'admin-access-button-pending': pendingClientAccessAction === 'open' }"
                  type="button"
                  :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess"
                  @click="handleOpenAccess"
                >
                  {{ pendingClientAccessAction === "open" ? "Открываю..." : "Открыть доступ" }}
                </button>
                <button
                  class="admin-access-close"
                  :class="{ 'admin-access-button-pending': pendingClientAccessAction === 'close' }"
                  type="button"
                  :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess"
                  @click="handleCloseAccess"
                >
                  {{ pendingClientAccessAction === "close" ? "Закрываю..." : "Закрыть доступ" }}
                </button>
                <button
                  class="admin-access-add"
                  :class="{ 'admin-access-button-pending': pendingClientAccessAction === 'extend7' }"
                  type="button"
                  :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess"
                  @click="handleExtendAccess(7)"
                >
                  {{ pendingClientAccessAction === "extend7" ? "Продлеваю..." : "+7 дней" }}
                </button>
                <button
                  class="admin-access-add"
                  :class="{ 'admin-access-button-pending': pendingClientAccessAction === 'extend30' }"
                  type="button"
                  :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess"
                  @click="handleExtendAccess(30)"
                >
                  {{ pendingClientAccessAction === "extend30" ? "Продлеваю..." : "+30 дней" }}
                </button>
              </div>
              <form class="admin-compact-date-row" @submit.prevent="handleManualAccessSave">
                <label class="admin-date-action">
                  <span>Ручной доступ</span>
                  <input v-model="accessExpiresAt" type="date" aria-label="Дата окончания доступа" :disabled="!canManageSelectedUserAccess" />
                </label>
                <button
                  class="admin-client-mute-action"
                  type="button"
                  :disabled="saving || !canManageSelectedUser"
                  @click="handleQuickMute(selectedUser)"
                >
                  Мут до снятия
                </button>
                <button
                  class="admin-date-save"
                  :class="{ 'admin-save-success': accessSaveSucceeded, 'admin-access-button-pending': pendingClientAccessAction === 'manual' }"
                  type="submit"
                  :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess"
                >
                  {{ pendingClientAccessAction === "manual" ? "Сохраняю..." : accessSaveButtonText }}
                </button>
              </form>
            </section>

            <div class="admin-client-primary-actions">
              <button class="primary-button ui-button admin-message-client-button" type="button" :disabled="saving" @click="openClientMessageModal">
                Написать клиенту
              </button>
            </div>

            <p v-if="!canGrantClientAccess" class="admin-warning-line">
              Для выдачи доступа нужно право Доступы.
            </p>
            <p v-else-if="!canManageSelectedUser" class="admin-warning-line">
              Менять доступ и ограничения администраторов может только главный админ.
            </p>

            <AdminClientAcquisition :telegram-id="selectedUser.telegramId" />

            <details class="admin-client-section admin-client-compact-section admin-detail ui-card">
              <summary>Активность <span>последние события</span></summary>
              <div class="admin-client-section-head admin-client-section-head-hidden">
                <h4>Активность</h4>
                <small>последние события</small>
              </div>
              <div class="admin-client-timeline">
                <article v-if="selectedUser.lastOpenedItemTitle">
                  <span class="admin-client-dot admin-client-dot-green"></span>
                  <strong>Открыл урок "{{ selectedUser.lastOpenedItemTitle }}"</strong>
                  <time>{{ selectedUser.lastOpenedAt ? formatAdminCompactDateTime(selectedUser.lastOpenedAt) : "время не сохранено" }}</time>
                </article>
                <article v-if="selectedUserLastPayment">
                  <span class="admin-client-dot admin-client-dot-blue"></span>
                  <strong>Оплата: {{ formatAdminPaymentMoney(selectedUserLastPayment) }}</strong>
                  <time>{{ paymentOrderDate(selectedUserLastPayment) }}</time>
                </article>
                <p v-if="!selectedUser.lastOpenedItemTitle && !selectedUserLastPayment" class="admin-empty">
                  Последних событий пока нет.
                </p>
              </div>
            </details>

            <details class="admin-client-section admin-client-compact-section admin-detail ui-card">
              <summary>Просмотры обучения <span>{{ selectedUserDetail?.learningEngagement.length ?? 0 }} карточек</span></summary>
              <div class="admin-accordion-body">
                <p v-if="!selectedUserDetail?.learningEngagement.length" class="admin-empty">Данных об активном просмотре пока нет.</p>
                <article v-for="item in selectedUserDetail?.learningEngagement ?? []" :key="item.contentItemId" class="admin-payment-card admin-payment-card-compact">
                  <div class="admin-payment-main">
                    <div><strong>{{ item.title }}</strong><small>{{ item.categoryTitle }}</small></div>
                    <em>{{ formatLearningEngagementDuration(item.totalActiveSeconds) }}</em>
                  </div>
                  <div class="admin-payment-meta">
                    <span>{{ item.opens }} открытий</span>
                    <span v-if="item.videoSeconds">видео {{ formatLearningEngagementDuration(item.videoSeconds) }}</span>
                    <span>последний просмотр {{ formatAdminCompactDateTime(item.lastViewedAt) }}</span>
                  </div>
                </article>
              </div>
            </details>

            <details class="admin-client-section admin-client-compact-section admin-detail ui-card">
              <summary>Подписки <span>{{ selectedUserDetail?.subscriptions.length ?? 0 }} записей</span></summary>
              <div class="admin-accordion-body">
                <p v-if="!selectedUserDetail?.subscriptions.length" class="admin-empty">Истории подписок пока нет.</p>
                <article v-for="subscription in selectedUserDetail?.subscriptions ?? []" :key="subscription.id" class="admin-payment-card admin-payment-card-compact">
                  <div class="admin-payment-main">
                    <div>
                      <strong>{{ getAdminSubscriptionTitle(subscription) }}</strong>
                      <small>{{ getAdminSubscriptionSourceLabel(subscription) }}</small>
                    </div>
                    <em :class="`membership-history-status-${subscription.status}`">{{ formatMembershipStatus(subscription.status) }}</em>
                  </div>
                  <div class="admin-payment-meta">
                    <span>{{ new Date(subscription.createdAt).toLocaleDateString("ru-RU") }}</span>
                    <span v-if="subscription.expiresAt">до {{ new Date(subscription.expiresAt).toLocaleDateString("ru-RU") }}</span>
                    <span v-if="getAdminSubscriptionActorLabel(subscription)">{{ getAdminSubscriptionActorLabel(subscription) }}</span>
                  </div>
                </article>
              </div>
            </details>

            <details class="admin-client-section admin-client-compact-section admin-detail ui-card">
              <summary>Оплаты клиента <span>{{ selectedUserPaymentOrders.length }} записей</span></summary>
              <div class="admin-accordion-body">
                <p v-if="!selectedUserPaymentOrders.length" class="admin-empty">Оплат пока нет.</p>
                <article v-for="order in selectedUserPaymentOrders" :key="order.id" class="admin-payment-card admin-payment-card-compact">
                  <div class="admin-payment-main">
                    <div>
                      <strong>{{ order.productTitle }}</strong>
                      <small>{{ paymentOrderDate(order) }} · {{ formatAdminPaymentMoney(order) }}</small>
                    </div>
                    <em :class="`payment-status-${order.status}`">{{ paymentOrderStatusLabel(order.status) }}</em>
                  </div>
                  <div class="admin-payment-ids">
                    <span>order: {{ order.providerOrderId }}</span>
                    <span>Webhook: {{ order.webhook ? (order.webhook.isValid ? "валидный" : "ошибка подписи") : "не пришёл" }}</span>
                  </div>
                </article>
              </div>
            </details>

            <details class="admin-client-section admin-client-compact-section admin-detail ui-card">
              <summary>Рефералы <span>{{ selectedUserDetail?.referrals.invited.length ?? 0 }} приглашённых</span></summary>
              <div class="admin-accordion-body">
                <article v-if="selectedUserDetail?.referrals.invitedBy" class="admin-payment-card admin-payment-card-compact">
                  <div class="admin-payment-main">
                    <div>
                      <strong>Пришёл по ссылке</strong>
                      <small>{{ referralUserTitle(selectedUserDetail.referrals.invitedBy.inviterUser) }}</small>
                    </div>
                    <em>{{ formatAdminDateTime(selectedUserDetail.referrals.invitedBy.invitedAt) }}</em>
                  </div>
                  <div class="admin-payment-meta">
                    <span>ID {{ selectedUserDetail.referrals.invitedBy.inviterUser.telegramId }}</span>
                    <span v-if="selectedUserDetail.referrals.invitedBy.firstPaidAt">
                      первая оплата {{ formatAdminDateTime(selectedUserDetail.referrals.invitedBy.firstPaidAt) }}
                    </span>
                    <span v-else>первой оплаты ещё нет</span>
                  </div>
                </article>

                <p v-if="!selectedUserDetail?.referrals.invitedBy && !selectedUserDetail?.referrals.invited.length" class="admin-empty">
                  Реферальных связей пока нет.
                </p>

                <article v-for="referral in selectedUserDetail?.referrals.invited ?? []" :key="referral.id" class="admin-payment-card admin-payment-card-compact">
                  <div class="admin-payment-main">
                    <div>
                      <strong>{{ referralUserTitle(referral.invitedUser) }}</strong>
                      <small>приглашён {{ formatAdminDateTime(referral.invitedAt) }}</small>
                    </div>
                    <em>{{ referralRewardStatusLabel(referral.rewardStatus) }}</em>
                  </div>
                  <div class="admin-payment-meta">
                    <span>ID {{ referral.invitedUser.telegramId }}</span>
                    <span>{{ referral.rewardDays }} дн. вознаграждения</span>
                    <span v-if="referral.firstPaidAt">первая оплата {{ formatAdminDateTime(referral.firstPaidAt) }}</span>
                    <span v-else>оплаты ещё нет</span>
                  </div>
                </article>
              </div>
            </details>

            <details class="admin-client-section admin-client-compact-section admin-detail ui-card">
              <summary>Ограничения и удаления <span>{{ selectedUserDetail?.moderationEvents.length ?? 0 }} записей</span></summary>
              <div class="admin-accordion-body">
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
                      class="secondary-button ui-button mt-2"
                      type="button"
                      :disabled="saving"
                      @click="handleRevokeMute(event.id)"
                    >
                      Снять мут
                    </button>
                  </div>
                </article>
              </div>
            </details>

            <details class="admin-client-section admin-client-compact-section admin-detail ui-card admin-client-device-history">
              <summary>Устройства <span>{{ selectedUserDevices.length }} сохранено</span></summary>
              <div class="admin-client-section-head admin-client-section-head-hidden">
                <h4>Устройства</h4>
                <button
                  class="admin-client-copy-button"
                  type="button"
                  :disabled="!selectedUserDeviceText"
                  @click="copyTextToClipboard(selectedUserDeviceText)"
                >
                  <Copy class="h-4 w-4" aria-hidden="true" />
                  Скопировать
                </button>
              </div>
              <p v-if="!selectedUserDevices.length" class="admin-empty">История появится после следующего входа клиента.</p>
              <div v-else class="admin-client-device-list">
                <article v-for="entry in selectedUserDevices" :key="entry.id" class="admin-client-device-card">
                  <div class="admin-client-device-title">
                    <strong>{{ getClientDeviceTitle(entry.diagnostics) }}</strong>
                    <span>{{ getClientDeviceScreen(entry.diagnostics) }}</span>
                  </div>
                  <div class="admin-client-device-dates">
                    <span>Впервые: {{ formatAdminCompactDateTime(entry.firstSeenAt) }}</span>
                    <span>Последний вход: {{ formatAdminCompactDateTime(entry.lastSeenAt) }}</span>
                  </div>
                  <small>{{ entry.diagnostics.userAgent }}</small>
                </article>
              </div>
            </details>

            <details v-if="canViewLoginIps" class="admin-client-section admin-login-ips-section admin-client-compact-section admin-detail ui-card">
              <summary>IP входов <span>{{ selectedUserLoginIps.length }} адресов</span></summary>
              <div class="admin-client-section-head admin-client-section-head-hidden">
                <h4>IP входов</h4>
                <small>{{ selectedUserLoginIps.length }} адресов</small>
              </div>
              <p v-if="selectedUserLoginIpsLoading" class="admin-empty">Загружаю историю IP…</p>
              <p v-else-if="selectedUserLoginIpsError" class="admin-warning-line">Не удалось загрузить историю IP.</p>
              <p v-else-if="!selectedUserLoginIps.length" class="admin-empty">История IP появится после следующего входа клиента.</p>
              <div v-else class="admin-login-ip-list">
                <article v-for="entry in selectedUserLoginIps" :key="entry.id" class="admin-login-ip-row">
                  <div class="admin-login-ip-main">
                    <strong class="admin-login-ip-address">{{ entry.ipAddress }}</strong>
                    <span v-if="isNewLoginIp(entry)" class="admin-login-ip-new">Новый IP</span>
                  </div>
                  <div class="admin-login-ip-meta">
                    <span>Впервые: {{ formatAdminCompactDateTime(entry.firstSeenAt) }}</span>
                    <span>Последний вход: {{ formatAdminCompactDateTime(entry.lastSeenAt) }}</span>
                    <span>Входов: {{ entry.loginCount }}</span>
                  </div>
                </article>
              </div>
            </details>
          </div>
      </TaskScreen>

      <Teleport to="body">
        <div v-if="clientMessageOpen && selectedUser" class="admin-client-message-layer" @click.self="closeClientMessageModal">
            <form class="admin-client-message-modal" role="dialog" aria-modal="true" aria-labelledby="admin-client-message-title" @submit.prevent="submitClientMessage">
              <header class="admin-client-message-head">
                <div>
                  <h3 id="admin-client-message-title">Сообщение клиенту</h3>
                  <p>{{ userTitle(selectedUser) }} · ID {{ selectedUser.telegramId }}</p>
                </div>
                <button class="icon-button ui-icon-button" type="button" aria-label="Закрыть сообщение клиенту" @click="closeClientMessageModal">
                  <X class="h-4 w-4" aria-hidden="true" />
                </button>
              </header>
              <div class="admin-client-message-body">
                <div class="admin-client-message-row">
                  <label class="support-file-icon-button ui-icon-button admin-client-file-button" title="Добавить файл" aria-label="Добавить файл">
                    <Paperclip class="h-4 w-4" aria-hidden="true" />
                    <span v-if="clientMessageFiles.length" class="support-file-count">{{ clientMessageFiles.length }}</span>
                    <input type="file" accept="image/*,video/*" multiple @change="updateClientMessageFiles" />
                  </label>
                  <textarea ref="clientMessageInputRef" v-model="clientMessageText" rows="3" placeholder="Напишите сообщение клиенту" />
                </div>
                <div v-if="clientMessageFiles.length" class="admin-client-file-list">
                  <span v-for="file in clientMessageFiles" :key="file.name">{{ file.name }}</span>
                </div>
              </div>
              <button class="primary-button ui-button" type="submit" :disabled="sendingClientMessage">
                {{ sendingClientMessage ? "Отправляем..." : "Отправить" }}
              </button>
            </form>
        </div>
      </Teleport>
    </section>

    <section v-else-if="activePanel === 'mailings'" class="admin-panel ui-page-section admin-mailings-panel">
      <div class="admin-panel-head ui-page-header">
        <div>
          <h3>Рассылки</h3>
          <p>Push и email для выбранной аудитории.</p>
        </div>
        <button class="primary-button ui-button admin-add-button" type="button" @click="openMailingComposer()">Новая рассылка</button>
      </div>

      <section class="admin-crm-block ui-card admin-email-quota" aria-label="Суточный лимит email">
        <div class="admin-email-quota-head">
          <div>
            <span>Email за 24 часа</span>
            <strong>{{ mailingEmailQuota.used }} / {{ mailingEmailQuota.limit }}</strong>
          </div>
          <span>{{ mailingEmailQuota.remaining }} доступно</span>
        </div>
        <div class="admin-email-quota-track" aria-hidden="true">
          <span :style="{ width: `${Math.min(100, (mailingEmailQuota.used / mailingEmailQuota.limit) * 100)}%` }"></span>
        </div>
        <p>Коды авторизации, тестовые письма и рассылки учитываются вместе. Скорость — до {{ mailingEmailQuota.messagesPerSecond }} писем/с.</p>
        <small v-if="mailingEmailQuota.resetsAt">Ближайшее место освободится {{ formatDateTime(mailingEmailQuota.resetsAt) }}</small>
      </section>

      <button class="admin-mailing-history-entry ui-button" type="button" @click="openMailingHistory">
        <span>
          <strong>История рассылок</strong>
          <small>{{ mailings.length ? `${mailings.length} рассылок` : "Рассылок пока нет" }}</small>
        </span>
        <ChevronRight class="h-5 w-5" aria-hidden="true" />
      </button>

      <TaskScreen v-if="showMailingHistory" class="admin-task-screen admin-mailing-history-task-screen" title="История рассылок" :subtitle="mailings.length ? `${mailings.length} рассылок` : 'Рассылок пока нет'" portal @back="closeMailingHistory">
          <section class="admin-mailing-list admin-mailing-history-screen">

            <article
              v-for="mailing in mailings"
              :key="mailing.id"
              class="admin-mailing-card"
              role="button"
              tabindex="0"
              @click="openMailingDetail(mailing)"
              @keydown.enter.prevent="openMailingDetail(mailing)"
            >
              <header>
                <div>
                  <strong>{{ mailing.title }}</strong>
                  <small>{{ formatDateTime(mailing.createdAt) }} · {{ mailingAuthorLabel(mailing) }}</small>
                  <small>{{ getMailingChannelLabel(mailing.channel) }} · {{ getMailingStatusLabel(mailing.status) }}</small>
                </div>
                <span :class="`admin-mailing-status admin-mailing-status-${mailing.status}`">
                  {{ getMailingStatusLabel(mailing.status) }}
                </span>
              </header>
              <p>{{ mailing.body }}</p>
              <a
                v-if="mailing.attachment"
                class="admin-mailing-attachment"
                :href="mailing.attachment.url ?? '#'"
                target="_blank"
                rel="noreferrer"
                @click.stop
              >
                <Paperclip class="h-3.5 w-3.5" aria-hidden="true" />
                {{ mailingAttachmentText(mailing) }}
              </a>
              <div class="admin-mailing-progress">
                <span>{{ mailing.sentCount }} / {{ mailing.deliveryCount }} доставок</span>
                <span>{{ mailing.estimatedLabel }}</span>
              </div>
              <div class="admin-mailing-delivery-stats" aria-label="Состояние доставки">
                <span>Доставлено <strong>{{ mailing.sentCount }}</strong></span>
                <span>Ожидает <strong>{{ mailing.pendingCount }}</strong></span>
                <span>В обработке <strong>{{ mailing.processingCount }}</strong></span>
                <span>Пропущено <strong>{{ mailing.skippedCount }}</strong></span>
                <span :class="{ 'admin-mailing-delivery-error': mailing.failedCount > 0 }">Ошибки <strong>{{ mailing.failedCount }}</strong></span>
              </div>
              <div class="admin-mailing-actions">
                <button class="secondary-button ui-button" type="button" :disabled="saving" @click.stop="reuseMailing(mailing)">
                  Использовать снова
                </button>
                <button
                  v-if="canRetryFailedMailing(mailing)"
                  class="secondary-button ui-button"
                  type="button"
                  :aria-label="`Повторить ошибки: ${mailing.failedCount}`"
                  :disabled="saving"
                  @click.stop="handleRetryFailedMailing(mailing)"
                >
                  Повторить ошибки
                </button>
                <button class="secondary-button ui-button" type="button" :disabled="saving" @click.stop="handleTestMailing(mailing)">
                  Тест себе
                </button>
                <button v-if="mailing.status === 'running'" class="secondary-button ui-button" type="button" :disabled="saving" @click.stop="handlePauseMailing(mailing)">
                  Пауза
                </button>
                <button v-if="mailing.status === 'paused'" class="secondary-button ui-button" type="button" :disabled="saving" @click.stop="handleResumeMailing(mailing)">
                  Продолжить
                </button>
                <button
                  v-if="mailing.status === 'running' || mailing.status === 'paused' || mailing.status === 'scheduled'"
                  class="secondary-button ui-button admin-mailing-stop"
                  type="button"
                  :disabled="saving"
                  @click.stop="handleStopMailing(mailing)"
                >
                  Остановить
                </button>
              </div>
            </article>
            <p v-if="!mailings.length" class="admin-empty">Рассылок пока нет.</p>
          </section>
      </TaskScreen>

      <TaskScreen v-if="showMailingComposer" class="admin-task-screen admin-mailing-task-screen" title="Новая рассылка" subtitle="Текст, вложение, фильтры и планирование." portal @back="closeMailingComposer">
        <template #actions>
          <button class="secondary-button ui-icon-button admin-mailing-reset-button" type="button" aria-label="Сбросить форму" title="Сбросить форму" @click="resetMailingForm">
            <RotateCcw class="h-5 w-5" aria-hidden="true" />
          </button>
        </template>
          <section class="admin-detail ui-card admin-client-modal admin-mailing-composer-modal">
            <form id="admin-mailing-form" class="admin-crm-block ui-card admin-mailing-builder" @submit.prevent="handleCreateMailing">
              <div class="admin-panel-head ui-page-header admin-mailing-builder-head">
                <div>
                  <p class="admin-overline">Рассылки</p>
                  <h4 id="admin-mailing-composer-title">Новая рассылка</h4>
                  <p>Текст, HTML-форматирование, вложение, фильтры и планирование.</p>
                </div>
                <div class="admin-mailing-modal-actions">
                  <button class="secondary-button ui-button" type="button" @click="resetMailingForm">Сбросить</button>
                  <button class="icon-button ui-icon-button" type="button" aria-label="Закрыть рассылку" @click="closeMailingComposer">
                    <X class="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div class="admin-mailing-builder-body">
              <label class="admin-field">
                <span>Заголовок</span>
                <input v-model.trim="mailingTitle" class="text-input" placeholder="Например: Новая практика в клубе" />
              </label>

              <div class="admin-editor admin-mailing-editor">
                <div class="admin-mailing-editor-modes" role="group" aria-label="Режим редактора">
                  <button
                    class="secondary-button ui-button admin-mailing-editor-mode"
                    :class="{ 'admin-mailing-editor-mode-active': mailingEditorMode === 'visual' }"
                    type="button"
                    :aria-pressed="mailingEditorMode === 'visual'"
                    @click="setMailingEditorMode('visual')"
                  >Визуально</button>
                  <button
                    class="secondary-button ui-button admin-mailing-editor-mode"
                    :class="{ 'admin-mailing-editor-mode-active': mailingEditorMode === 'html' }"
                    type="button"
                    :aria-pressed="mailingEditorMode === 'html'"
                    @click="setMailingEditorMode('html')"
                  >HTML-код</button>
                </div>
                <template v-if="mailingEditorMode === 'visual'">
                  <div class="admin-editor-toolbar">
                    <button class="icon-button ui-icon-button" type="button" @click="applyMailingEditorCommand('bold')">B</button>
                    <button class="icon-button ui-icon-button" type="button" @click="applyMailingEditorCommand('italic')">I</button>
                    <button class="icon-button ui-icon-button" type="button" @click="applyMailingEditorCommand('underline')">U</button>
                    <button class="secondary-button ui-button" type="button" @click="applyMailingEditorCommand('insertUnorderedList')">Список</button>
                    <button class="secondary-button ui-button" type="button" @click="applyMailingEditorLink">Ссылка</button>
                  </div>
                  <div
                    ref="mailingEditorRef"
                    class="admin-rich-editor"
                    contenteditable="true"
                    role="textbox"
                    aria-label="Текст рассылки"
                    data-placeholder="Текст рассылки"
                    @input="syncMailingEditorBody"
                    @paste="handleMailingEditorPaste"
                  ></div>
                </template>
                <textarea
                  v-else
                  v-model="mailingBodyHtml"
                  class="text-input admin-mailing-html-source"
                  aria-label="HTML-код рассылки"
                  placeholder="<b>Важный текст</b>"
                  spellcheck="false"
                  @input="syncActiveMailingEditor"
                ></textarea>
                <section v-if="mailingPreparedMessage.safeHtml" class="admin-mailing-message-preview" aria-label="Предпросмотр сообщения">
                  <span>Предпросмотр сообщения</span>
                  <div v-html="mailingPreparedMessage.safeHtml"></div>
                </section>
              </div>

              <div class="admin-mailing-channels" aria-label="Куда отправляем рассылку">
                <button
                  v-for="channel in mailingChannelOptions"
                  :key="channel.value"
                  class="admin-mailing-channel"
                  :class="{ 'admin-mailing-channel-active': mailingChannel === channel.value }"
                  type="button"
                  @click="mailingChannel = channel.value"
                >
                  <strong>{{ channel.label }}</strong>
                  <span>{{ channel.hint }}</span>
                </button>
              </div>

              <div class="admin-mailing-filter-grid">
                <label class="admin-field">
                  <span>Статус доступа</span>
                  <select v-model="mailingFilters.accessStatus" class="text-input">
                    <option v-for="option in mailingAccessStatusOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="admin-field">
                  <span>Тип доступа</span>
                  <select v-model="mailingFilters.accessType" class="text-input">
                    <option v-for="option in mailingAccessTypeOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
              </div>

              <div class="admin-mailing-checks">
                <label class="admin-check-row">
                  <input v-model="mailingFilters.excludeAdmins" type="checkbox" />
                  <span>Исключить админов</span>
                </label>
                <label class="admin-check-row">
                  <input v-model="mailingFilters.excludeRestricted" type="checkbox" />
                  <span>Исключить ограничения</span>
                </label>
              </div>

              <div class="admin-mailing-row">
                <label class="admin-mailing-file">
                  <Paperclip class="h-4 w-4" aria-hidden="true" />
                  <span>{{ mailingAttachmentLabel }}</span>
                  <input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" @change="updateMailingAttachment" />
                </label>
                <label class="admin-field admin-mailing-date">
                  <span>Запланировать</span>
                  <input v-model="mailingScheduledAt" class="text-input" type="datetime-local" />
                </label>
              </div>

              <section class="admin-crm-block ui-card admin-mailing-preview admin-mailing-composer-preview">
                <div class="admin-panel-head ui-page-header admin-mailing-list-head">
                  <div>
                    <h4>Расчёт</h4>
                    <p>Сколько получателей попадёт в выбранные каналы.</p>
                  </div>
                  <button class="secondary-button ui-button" type="button" :disabled="mailingPreviewLoading" @click="refreshMailingPreview">
                    Пересчитать
                  </button>
                </div>
                <div class="admin-mailing-preview-grid">
                  <article>
                    <span>Получателей</span>
                    <strong>{{ mailingPreview?.targetCount ?? "—" }}</strong>
                  </article>
                  <article>
                    <span>Всего доставок</span>
                    <strong>{{ mailingPreview?.deliveryCount ?? "—" }}</strong>
                  </article>
                  <article>
                    <span>Push</span>
                    <strong>{{ mailingPreview?.pushCount ?? "—" }}</strong>
                  </article>
                  <article>
                    <span>PWA-подписок</span>
                    <strong>{{ mailingPreview?.pushSubscriptionCount ?? "—" }}</strong>
                  </article>
                  <article>
                    <span>Email</span>
                    <strong>{{ mailingPreview?.emailCount ?? "—" }}</strong>
                  </article>
                  <article>
                    <span>Email за 24 часа</span>
                    <strong>{{ mailingPreview?.emailQuota.used ?? "—" }} / {{ mailingPreview?.emailQuota.limit ?? "—" }}</strong>
                  </article>
                  <article>
                    <span>Доступно email</span>
                    <strong>{{ mailingPreview?.emailQuota.remaining ?? "—" }}</strong>
                  </article>
                  <article>
                    <span>Email без адреса</span>
                    <strong>{{ mailingPreview?.excludedMissingEmail ?? "—" }}</strong>
                  </article>
                  <article>
                    <span>Отписались от email</span>
                    <strong>{{ mailingPreview?.excludedEmailOptOut ?? "—" }}</strong>
                  </article>
                  <article>
                    <span>Не прошли фильтры</span>
                    <strong>{{ mailingPreview?.excludedByFilters ?? "—" }}</strong>
                  </article>
                  <article class="admin-mailing-preview-time">
                    <span>Примерное время</span>
                    <strong>{{ mailingPreviewLoading ? "считаем..." : mailingPreview?.estimatedLabel ?? "—" }}</strong>
                  </article>
                </div>
                <p v-if="mailingPreview?.emailDelayedByDailyLimit" class="admin-warning-line">
                  Часть email будет автоматически отправлена после освобождения суточного лимита.
                </p>
              </section>
              </div>

            </form>
          </section>
        <template #footer>
          <div class="admin-mailing-submit-row admin-mailing-builder-footer">
            <button class="secondary-button ui-button" type="button" :disabled="saving || !mailingCanSubmit" @click="handleTestMailingDraft">
              Тест себе
            </button>
            <button class="primary-button ui-button" form="admin-mailing-form" type="submit" :disabled="saving || !mailingCanSubmit">
              {{ mailingScheduledAt ? "Запланировать рассылку" : "Запустить рассылку" }}
            </button>
          </div>
        </template>
      </TaskScreen>

      <TaskScreen v-if="selectedMailing" class="admin-task-screen" :title="selectedMailing.title" :subtitle="`${formatDateTime(selectedMailing.createdAt)} · ${mailingAuthorLabel(selectedMailing)}`" portal @back="closeMailingDetail">
          <section class="admin-detail ui-card admin-client-modal admin-mailing-detail-modal">
            <header class="admin-client-modal-head">
              <div>
                <p class="admin-overline">Рассылка</p>
                <h3 id="admin-mailing-detail-title">{{ selectedMailing.title }}</h3>
                <p>{{ formatDateTime(selectedMailing.createdAt) }} · {{ mailingAuthorLabel(selectedMailing) }}</p>
              </div>
              <button class="icon-button ui-icon-button" type="button" aria-label="Закрыть рассылку" @click="closeMailingDetail">
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            <div class="admin-mailing-detail-grid">
              <article>
                <span>Канал</span>
                <strong>{{ getMailingChannelLabel(selectedMailing.channel) }}</strong>
              </article>
              <article>
                <span>Статус</span>
                <strong>{{ getMailingStatusLabel(selectedMailing.status) }}</strong>
              </article>
              <article>
                <span>Отправлено</span>
                <strong>{{ selectedMailing.sentCount }} / {{ selectedMailing.deliveryCount }}</strong>
              </article>
              <article>
                <span>Примерное время</span>
                <strong>{{ selectedMailing.estimatedLabel }}</strong>
              </article>
            </div>

            <div class="admin-mailing-delivery-stats" aria-label="Состояние доставки">
              <span>Доставлено <strong>{{ selectedMailing.sentCount }}</strong></span>
              <span>Ожидает <strong>{{ selectedMailing.pendingCount }}</strong></span>
              <span>В обработке <strong>{{ selectedMailing.processingCount }}</strong></span>
              <span>Пропущено <strong>{{ selectedMailing.skippedCount }}</strong></span>
              <span :class="{ 'admin-mailing-delivery-error': selectedMailing.failedCount > 0 }">Ошибки <strong>{{ selectedMailing.failedCount }}</strong></span>
            </div>

            <section class="admin-mailing-analytics" aria-labelledby="admin-mailing-analytics-title">
              <header class="admin-mailing-analytics-head">
                <div>
                  <span class="admin-overline">Аналитика</span>
                  <h4 id="admin-mailing-analytics-title">Вовлечённость получателей</h4>
                </div>
                <button class="secondary-button ui-button" type="button" :disabled="mailingAnalyticsLoading" @click="refreshMailingAnalytics">
                  Обновить
                </button>
              </header>

              <p v-if="mailingAnalyticsLoading" class="admin-empty">Загружаю аналитику…</p>
              <div v-else-if="mailingAnalyticsError" class="admin-mailing-analytics-notice admin-mailing-analytics-notice-error">
                <p>Не удалось загрузить аналитику.</p>
                <button class="secondary-button ui-button" type="button" @click="refreshMailingAnalytics">Повторить</button>
              </div>
              <p v-else-if="mailingAnalytics && !mailingAnalytics.trackingEnabledAt" class="admin-mailing-analytics-notice">
                Отслеживание вовлечённости появилось в версии 5.26. Для более ранних рассылок данных нет.
              </p>

              <template v-else-if="mailingAnalytics">
                <div class="admin-mailing-analytics-kpis">
                  <article><span>Доставлено</span><strong>{{ mailingAnalytics.summary.sent }}</strong></article>
                  <article><span>Открыто</span><strong>{{ mailingAnalytics.summary.opened }}</strong></article>
                  <article><span>Переходы</span><strong>{{ mailingAnalytics.summary.clicked }}</strong></article>
                  <article><span>Open rate</span><strong>{{ formatMailingAnalyticsRate(mailingAnalytics.summary.openRate) }}</strong></article>
                  <article><span>CTR</span><strong>{{ formatMailingAnalyticsRate(mailingAnalytics.summary.clickRate) }}</strong></article>
                  <article><span>CTOR</span><strong>{{ formatMailingAnalyticsRate(mailingAnalytics.summary.clickToOpenRate) }}</strong></article>
                </div>

                <p v-if="mailingAnalytics.emailOpenEstimate" class="admin-mailing-analytics-estimate">
                  Открытия Email приблизительные: почтовые клиенты могут блокировать или автоматически загружать пиксель.
                </p>

                <div class="admin-mailing-analytics-channels" aria-label="Аналитика по каналам">
                  <article v-for="channel in mailingAnalytics.channels" :key="channel.channel">
                    <header>
                      <strong>{{ channel.channel === "push" ? "Push" : "Email" }}</strong>
                      <span>{{ channel.sent }} доставлено</span>
                    </header>
                    <div><span>Открыто {{ channel.opened }}</span><strong>{{ formatMailingAnalyticsRate(channel.openRate) }}</strong></div>
                    <div><span>Переходы {{ channel.clicked }}</span><strong>{{ formatMailingAnalyticsRate(channel.clickRate) }}</strong></div>
                    <small v-if="channel.failed || channel.skipped">Ошибки {{ channel.failed }} · пропущено {{ channel.skipped }}</small>
                  </article>
                </div>

                <section class="admin-mailing-analytics-block">
                  <h5>Динамика</h5>
                  <p v-if="!mailingAnalytics.timeline.length" class="admin-empty">События пока не зафиксированы.</p>
                  <div v-else class="admin-mailing-analytics-timeline">
                    <article v-for="item in mailingAnalytics.timeline" :key="item.bucket">
                      <time :datetime="item.bucket">{{ formatMailingAnalyticsBucket(item.bucket) }}</time>
                      <div><span>Доставлено {{ item.sent }}</span><i class="is-sent" :style="{ width: mailingAnalyticsBarWidth(item.sent) }"></i></div>
                      <div><span>Открыто {{ item.opened }}</span><i class="is-opened" :style="{ width: mailingAnalyticsBarWidth(item.opened) }"></i></div>
                      <div><span>Переходы {{ item.clicked }}</span><i class="is-clicked" :style="{ width: mailingAnalyticsBarWidth(item.clicked) }"></i></div>
                    </article>
                  </div>
                </section>

                <section class="admin-mailing-analytics-block">
                  <h5>Популярные ссылки</h5>
                  <p v-if="!mailingAnalytics.links.length" class="admin-empty">Переходов по ссылкам пока нет.</p>
                  <ol v-else class="admin-mailing-analytics-links">
                    <li v-for="link in mailingAnalytics.links" :key="link.destination">
                      <a :href="link.destination" target="_blank" rel="noreferrer">{{ link.destination }}</a>
                      <strong>{{ link.uniqueClicks }}</strong>
                    </li>
                  </ol>
                </section>

                <section class="admin-mailing-analytics-block">
                  <div class="admin-mailing-analytics-recipients-head">
                    <h5>Получатели</h5>
                    <span>{{ mailingAnalyticsRecipients.length }} показано</span>
                  </div>
                  <div class="admin-mailing-analytics-filters">
                    <label>
                      <span>Статус</span>
                      <select v-model="mailingAnalyticsRecipientStatus" @change="updateMailingAnalyticsRecipients">
                        <option value="all">Все статусы</option>
                        <option value="delivered">Доставлено</option>
                        <option value="opened">Открыто</option>
                        <option value="clicked">Переход</option>
                        <option value="failed">Ошибка</option>
                        <option value="skipped">Пропущено</option>
                        <option value="pending">Ожидает</option>
                      </select>
                    </label>
                    <label>
                      <span>Канал</span>
                      <select v-model="mailingAnalyticsRecipientChannel" @change="updateMailingAnalyticsRecipients">
                        <option value="all">Все каналы</option>
                        <option value="push">Push</option>
                        <option value="email">Email</option>
                      </select>
                    </label>
                  </div>
                  <p v-if="mailingAnalyticsRecipientsLoading && !mailingAnalyticsRecipients.length" class="admin-empty">Загружаю получателей…</p>
                  <p v-else-if="!mailingAnalyticsRecipients.length" class="admin-empty">По выбранным фильтрам получателей нет.</p>
                  <div v-else class="admin-mailing-analytics-recipients">
                    <article v-for="recipient in mailingAnalyticsRecipients" :key="recipient.id">
                      <header>
                        <div><strong>{{ recipient.displayName }}</strong><small>ID {{ recipient.telegramId }} · {{ recipient.channel === "push" ? "Push" : "Email" }}</small></div>
                        <span :class="`is-${recipient.analyticsStatus}`">{{ mailingAnalyticsStatusLabel(recipient.analyticsStatus) }}</span>
                      </header>
                      <div class="admin-mailing-analytics-recipient-times">
                        <span>Отправлено: {{ formatDateTime(recipient.sentAt) }}</span>
                        <span v-if="recipient.openedAt">Открыто: {{ formatDateTime(recipient.openedAt) }}</span>
                        <span v-if="recipient.clickedAt">Переход: {{ formatDateTime(recipient.clickedAt) }}</span>
                      </div>
                      <small v-if="recipient.error" class="admin-mailing-delivery-error">{{ recipient.error }}</small>
                    </article>
                  </div>
                  <button
                    v-if="mailingAnalyticsNextCursor"
                    class="secondary-button ui-button admin-mailing-analytics-more"
                    type="button"
                    :disabled="mailingAnalyticsRecipientsLoading"
                    @click="loadMailingAnalyticsRecipients(false)"
                  >Показать ещё</button>
                </section>
              </template>
            </section>

            <section class="admin-mailing-detail-section">
              <span>Фильтры</span>
              <p>{{ mailingFilterSummary(selectedMailing) }}</p>
            </section>

            <section class="admin-mailing-detail-section">
              <span>Сообщение</span>
              <div v-if="selectedMailingBodyHtml" class="admin-mailing-detail-body" v-html="selectedMailingBodyHtml"></div>
              <p v-else>{{ selectedMailing.body }}</p>
            </section>

            <section class="admin-mailing-detail-section">
              <span>Вложение</span>
              <a
                v-if="selectedMailing.attachment"
                class="admin-mailing-attachment"
                :href="selectedMailing.attachment.url ?? '#'"
                target="_blank"
                rel="noreferrer"
              >
                <Paperclip class="h-3.5 w-3.5" aria-hidden="true" />
                {{ mailingAttachmentText(selectedMailing) }}
              </a>
              <p v-else>Без вложения</p>
            </section>

            <div class="admin-mailing-actions">
              <button class="primary-button ui-button" type="button" :disabled="saving" @click="reuseMailing(selectedMailing)">
                Использовать снова
              </button>
              <button
                v-if="canRetryFailedMailing(selectedMailing)"
                class="secondary-button ui-button"
                type="button"
                :aria-label="`Повторить ошибки: ${selectedMailing.failedCount}`"
                :disabled="saving"
                @click="handleRetryFailedMailing(selectedMailing)"
              >
                Повторить ошибки
              </button>
              <button class="secondary-button ui-button" type="button" :disabled="saving" @click="handleTestMailing(selectedMailing)">
                Тест себе
              </button>
            </div>
          </section>
      </TaskScreen>
    </section>

    <AdminPaymentsPanel v-else-if="isPaymentsPanel" class="admin-panel ui-page-section" />

    <AdminStoragePanel
      ref="storagePanelRef"
      v-else-if="activePanel === 'storage' && canUseStorage"
      :storage-settings="storageSettings"
      :selected-storage-target="selectedStorageTarget"
      :selected-storage-target-label="selectedStorageTargetLabel"
      :selected-storage-files-status="selectedStorageFilesStatus"
      :selected-storage-settings-status="selectedStorageSettingsStatus"
      :selected-storage-settings-title="selectedStorageSettingsTitle"
      :storage-overview="storageOverview"
      :storage-objects="storageObjects"
      :storage-objects-loading="storageObjectsLoading"
      :storage-objects-cursor="storageObjectsCursor"
      :storage-prefix="storagePrefix"
      :show-storage-files-modal="showStorageFilesModal"
      :show-storage-folder-modal="showStorageFolderModal"
      :selected-storage-folder="selectedStorageFolder"
      :selected-storage-folder-objects="selectedStorageFolderObjects"
      :storage-folder-groups="storageFolderGroups"
      :storage-search="storageSearch"
      :storage-folder-sort="storageFolderSort"
      :show-storage-settings-modal="showStorageSettingsModal"
      :storage-form="storageForm"
      :saving="saving"
      :format-storage-size="formatStorageSize"
      :storage-object-file-name="storageObjectFileName"
      :storage-source-label="storageSourceLabel"
      @select-target="openStorageStatusActions"
      @open-files="openSelectedStorageFiles"
      @open-settings="openStorageSettings"
      @back="closeStorageTask"
      @refresh="loadStorageObjects()"
      @open-folder="openStorageFolder"
      @search-change="storageSearch = $event"
      @sort-change="storageFolderSort = $event"
      @open-object="openStorageObject"
      @delete-object="handleDeleteStorageObject"
      @load-more="loadStorageObjects({ append: true })"
      @save="handleSaveStorageSettings"
      @storage-form-change="storageForm = $event"
    />

    <AdminProjectSettingsPanel v-else-if="isProjectSettingsPanel" class="admin-panel ui-page-section" :is-owner="isOwner" />

    <AdminServerPanel v-else-if="isServerPanel" class="admin-panel ui-page-section" />

    <section v-else-if="activePanel === 'admins'" class="admin-panel ui-page-section admin-permissions-panel">
      <div class="admin-panel-head ui-page-header">
        <div>
          <h3>Администраторы</h3>
          <p>Доступ, роль вручную и права по всем разделам.</p>
        </div>
      </div>

      <section class="admin-permissions-owner">
        <article class="admin-permissions-owner-card ui-card">
          <div>
            <span>Владелец клуба</span>
            <strong>{{ ownerTelegramId || session.user?.telegramId }}</strong>
            <small>Полный доступ без ограничений.</small>
          </div>
          <Check class="h-5 w-5" aria-hidden="true" />
        </article>

        <button
          v-if="isOwner"
          class="secondary-button ui-button"
          type="button"
          :disabled="saving || !admins.length"
          @click="openTransferOwnerModal"
        >
          Передать владение
        </button>
      </section>

      <section v-if="isOwner" class="admin-crm-block ui-card admin-add-admin-block">
        <div>
          <h4>Добавить администратора</h4>
          <p>Введите email или найдите клиента по имени, username либо ID.</p>
        </div>

        <form class="admin-search-row" @submit.prevent="handleAddAdmin()">
          <input v-model.trim="adminSearchQuery" class="text-input" placeholder="email, имя или username" />
          <button class="primary-button ui-button admin-add-button" type="submit" :disabled="saving || !resolveAdminSearchTelegramId()">Добавить</button>
        </form>

        <div v-if="adminSearchCandidates.length" class="admin-candidate-list">
          <button
            v-for="user in adminSearchCandidates"
            :key="user.id"
            class="admin-candidate-button ui-button"
            type="button"
            :disabled="saving"
            @click="handleAddAdmin(user.telegramId)"
          >
            <span>{{ getAdminCandidateTitle(user) }}</span>
            <small>ID {{ user.telegramId }}</small>
          </button>
        </div>
      </section>

      <TaskScreen v-if="showTransferOwnerModal" class="admin-task-screen admin-transfer-owner-task-screen" title="Передать клуб" subtitle="Новый владелец получит полный доступ." portal @back="closeTransferOwnerModal">
          <section class="admin-transfer-owner-card ui-card">
            <form class="admin-form admin-transfer-owner-form" @submit.prevent="requestTransferOwnerConfirmation">
              <select v-model="transferOwnerTelegramId" class="text-input">
                <option value="" disabled>Выберите администратора</option>
                <option v-for="admin in admins" :key="admin.id" :value="admin.telegramId">
                  {{ adminTitle(admin) }} · ID {{ admin.telegramId }}
                </option>
              </select>
              <p class="admin-warning-line">
                Подтвердите действие только если точно хотите сменить владельца клуба.
              </p>
              <button class="primary-button ui-button" type="submit" :disabled="saving || !transferOwnerTelegramId">
                Подтвердить передачу
              </button>
            </form>
          </section>
      </TaskScreen>

      <ConfirmDialog
        :open="showTransferOwnerConfirm"
        title="Передать клуб выбранному администратору?"
        description="После подтверждения выбранный администратор сразу станет владельцем и получит полный контроль над клубом."
        confirm-label="Да, передать клуб"
        cancel-label="Отмена"
        :danger="true"
        :busy="saving"
        @cancel="showTransferOwnerConfirm = false"
        @confirm="handleTransferOwner"
      />

      <p v-if="!isOwner" class="admin-empty">Добавлять и удалять админов может только владелец.</p>

      <div class="admin-permission-list">
        <button
          v-for="admin in admins"
          :key="admin.id"
          class="admin-permission-row-button ui-button"
          :class="{ 'admin-permission-row-disabled': !admin.isActive }"
          type="button"
          @click="openAdminAccessModal(admin)"
        >
          <span class="admin-permission-identity">
            <img v-if="admin.photoUrl" :src="admin.photoUrl" :alt="adminTitle(admin)" loading="lazy" decoding="async" />
            <span v-else>{{ adminTitle(admin).slice(0, 1).toUpperCase() }}</span>
            <div>
              <strong>{{ adminTitle(admin) }}</strong>
              <small>
                {{ adminRoleTitle(admin) }}
                <template v-if="admin.username"> · @{{ admin.username }}</template>
              </small>
            </div>
          </span>
          <span class="admin-permission-row-status" :class="admin.isActive ? 'admin-permission-row-status-active' : 'admin-permission-row-status-disabled'">
            {{ admin.isActive ? "Активен" : "Выключен" }}
          </span>
        </button>
        <p v-if="!admins.length" class="admin-empty">Администраторов пока нет.</p>
      </div>

      <section class="admin-crm-block ui-card admin-action-log-panel">
        <header class="admin-action-log-head">
          <div>
            <h4>Журнал действий</h4>
            <p>{{ adminActionLogs.length ? `${adminActionLogs.length} последних действий` : "Действий пока нет" }}</p>
          </div>
          <button class="secondary-button ui-button admin-action-log-toggle" type="button" @click="adminActionLogExpanded = !adminActionLogExpanded">
            {{ adminActionLogExpanded ? "Свернуть журнал" : "Показать журнал" }}
          </button>
        </header>

        <div v-if="adminActionLogExpanded" class="admin-action-log-body">
          <select v-model="adminActionActorFilter" class="text-input admin-action-log-filter">
            <option value="">Все администраторы</option>
            <option v-for="admin in visibleAdminActionActors" :key="admin.telegramId" :value="admin.telegramId">
              {{ adminActionActorTitle(admin) }}
            </option>
          </select>

          <div class="admin-action-log-list">
            <article v-for="log in adminActionLogs" :key="log.id" class="admin-action-log-item">
              <div>
                <strong>{{ log.summary }}</strong>
                <span>{{ adminActionActorTitle(log.actor) }} · {{ formatDateTime(log.createdAt) }}</span>
                <small v-if="adminActionMetaText(log)">{{ adminActionMetaText(log) }}</small>
              </div>
            </article>
            <p v-if="!adminActionLogs.length" class="admin-empty">Действий пока нет.</p>
          </div>
        </div>
      </section>

      <TaskScreen v-if="selectedAdminAccessCurrent" class="admin-task-screen" :title="adminTitle(selectedAdminAccessCurrent)" subtitle="Права и доступ администратора" portal @back="closeAdminAccessModal">
          <section class="admin-permission-surface ui-card" :class="{ 'admin-permission-card-disabled': !selectedAdminAccessCurrent.isActive }">
            <div class="admin-permission-content">
              <div class="admin-permission-head">
                <div>
                  <strong>{{ adminRoleTitle(selectedAdminAccessCurrent) }}</strong>
                  <small>
                    ID {{ selectedAdminAccessCurrent.telegramId }}
                    <template v-if="selectedAdminAccessCurrent.username"> · @{{ selectedAdminAccessCurrent.username }}</template>
                  </small>
                </div>

                <label class="admin-switch-row">
                  <input
                    :checked="selectedAdminAccessCurrent.isActive"
                    type="checkbox"
                    :disabled="saving || !isOwner"
                    @change="handleUpdateAdminAccess(selectedAdminAccessCurrent, { isActive: !selectedAdminAccessCurrent.isActive })"
                  />
                  <span>Доступ администратора</span>
                </label>
              </div>

              <div class="admin-permission-meta">
                <label class="admin-field">
                  <span>Роль вручную</span>
                  <input
                    class="text-input"
                    :value="selectedAdminAccessCurrent.roleLabel ?? ''"
                    placeholder="Например: Старший модератор"
                    :disabled="saving || !isOwner"
                    @change="handleAdminRoleLabelChange(selectedAdminAccessCurrent, $event)"
                  />
                </label>

                <div class="admin-permission-summary">
                  <span>{{ adminPermissionCount(selectedAdminAccessCurrent) }} / {{ adminPermissionOptions.length }}</span>
                  <small>включено прав</small>
                </div>
              </div>

              <div class="admin-permission-grid ui-responsive-grid">
                <label v-for="permission in adminPermissionOptions" :key="permission.value" class="admin-permission-toggle">
                  <span>{{ permission.label }}</span>
                  <input
                    :checked="hasAdminPermissionEntry(selectedAdminAccessCurrent, permission.value)"
                    type="checkbox"
                    :disabled="saving || !isOwner"
                    @change="toggleAdminPermission(selectedAdminAccessCurrent, permission.value)"
                  />
                </label>
              </div>

              <footer class="admin-permission-actions">
                <small>
                  Добавлен {{ new Date(selectedAdminAccessCurrent.createdAt).toLocaleDateString("ru-RU") }}
                </small>
                <button v-if="isOwner" class="icon-button ui-icon-button" type="button" :disabled="saving" @click="handleRemoveAdmin(selectedAdminAccessCurrent.telegramId)">
                  <Trash2 class="h-4 w-4" aria-hidden="true" />
                </button>
              </footer>
            </div>
          </section>
      </TaskScreen>
    </section>
  </section>
</template>
