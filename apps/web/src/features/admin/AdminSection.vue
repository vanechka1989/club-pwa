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
  CalendarClock,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Cloud,
  CreditCard,
  Link2,
  Megaphone,
  Server,
  SlidersHorizontal,
  Shield,
  UsersRound,
  X,
  type LucideIcon
} from "lucide-vue-next";
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { sanitizeHtml } from "@/utils/sanitizeHtml";
import { uploadSupportAttachments } from "@/features/support/directUpload";
import AdminClientsPanel from "./AdminClientsPanel.vue";
import { isAdminClientDetailSection, type AdminClientDetailSection } from "./adminClientDetailSection";
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
  getAssessmentReviewQueue,
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
  resetHomeworkSubmission,
  resetQuizAttempts,
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
  getAdminClientDisplayName,
  getAdminTariffLabel
} from "@/features/admin/adminClientCard";
import {
  allClientSourcesFilter,
  filterAdminClients,
  getAdminClientSourceOptions,
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
import { resolveAdminPollStats } from "@/features/admin/adminStatsFallback";
import { buildAdminStatistics, type AdminStatisticsPeriod } from "@/features/admin/adminStatistics";
import { paymentSuccessPercent } from "@/features/admin/adminAnalyticsOverview";
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
const AdminPaymentsPanel = defineAsyncComponent(() => import("./AdminPaymentsPanel.vue"));
const AdminMailingsPanel = defineAsyncComponent(() => import("./AdminMailingsPanel.vue"));
const AdminStoragePanel = defineAsyncComponent(() => import("./AdminStoragePanel.vue"));
const AdminPermissionsPanel = defineAsyncComponent(() => import("./AdminPermissionsPanel.vue"));
const AdminProjectSettingsPanel = defineAsyncComponent(() => import("./AdminProjectSettingsPanel.vue"));
const AdminServerPanel = defineAsyncComponent(() => import("./AdminServerPanel.vue"));
const AdminReleaseNotesTask = defineAsyncComponent(() => import("./AdminReleaseNotesTask.vue"));
const AdminAssessmentResultTask = defineAsyncComponent(() => import("./AdminAssessmentResultTask.vue"));
const AdminClientLearningTask = defineAsyncComponent(() => import("./AdminClientLearningTask.vue"));
const AdminClientDetailTask = defineAsyncComponent(() => import("./AdminClientDetailTask.vue"));

const session = useSessionStore();
const notifications = useNotificationsStore();
const appDialogs = useAppDialogsStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();

function openAdminTask(path: string) {
  if (route.path !== path) void router.push(path);
}

function replaceAdminTask(path: string) {
  if (route.path !== path) void router.replace(path);
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
type ClientFilters = {
  query: string;
  subscription: "all" | "active" | "closed";
  tariff: string;
  restrictions: "all" | "restricted";
  source: string;
  utmField: AdminClientUtmField;
  utmValue: string;
};
type AdminClientsPanelExpose = {
  getClientMessageInput: () => HTMLTextAreaElement | null;
};
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
const mailingPreviewLoading = ref(false);
const showMailingComposer = ref(false);
const showMailingHistory = ref(false);
const paymentOrders = ref<PaymentOrderLog[]>([]);
const communityTopics = ref<ClubTopic[]>([]);
const communityMessages = ref<AdminCommunityMessage[]>([]);
const pollStats = ref<AdminStatsResponse["pollStats"]>({ totalPolls: 0, activePolls: 0, closedPolls: 0, uniqueParticipants: 0, totalVotes: 0, participationPercent: 0, polls: [] });
const selectedUser = ref<AdminStatsUser | null>(null);
const selectedUserDetail = ref<AdminUserDetailResponse | null>(null);
const selectedClientSection = ref<AdminClientDetailSection | null>(null);
const selectedLearningResult = ref<{ mode: "quiz" | "homework"; recordId: string } | null>(null);
const selectedClientSectionHistoryEntry = ref(false);
const selectedLearningResultHistoryEntry = ref(false);
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
const assessmentReviewCount = ref(0);
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
const clientsPanelRef = ref<AdminClientsPanelExpose | null>(null);
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
const mailingsPanelRef = ref<{ getMailingEditor: () => HTMLElement | null } | null>(null);
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
const canManageClientLearning = computed(() => hasCurrentAdminPermission("materials"));
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
const clientFilters = computed<ClientFilters>(() => ({
  query: search.value,
  subscription: subscriptionFilter.value,
  tariff: tariffFilter.value,
  restrictions: restrictionFilter.value,
  source: sourceFilter.value,
  utmField: utmFieldFilter.value,
  utmValue: utmValueFilter.value
}));
const clientSummary = computed(() => ({
  total: totalUsers.value,
  active: activeUsers.value,
  restricted: restrictedUsers.value
}));
const clientMessage = computed(() => ({
  open: clientMessageOpen.value,
  text: clientMessageText.value,
  files: clientMessageFiles.value,
  sending: sendingClientMessage.value
}));
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
const paymentOutcomeCount = computed(
  () =>
    adminStatistics.value.payments.paidOrders +
    adminStatistics.value.payments.pendingOrders +
    adminStatistics.value.payments.failedOrders
);
const successfulPaymentPercent = computed(() =>
  paymentSuccessPercent(
    adminStatistics.value.payments.paidOrders,
    adminStatistics.value.payments.pendingOrders,
    adminStatistics.value.payments.failedOrders
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

function getMailingEditor() {
  return mailingsPanelRef.value?.getMailingEditor() ?? null;
}

function updateMailingBodyHtml(value: string) {
  mailingBodyHtml.value = value;
  mailingBody.value = mailingPreparedMessage.value.plainText;
}

function syncMailingEditorBody() {
  updateMailingBodyHtml(getMailingEditor()?.innerHTML ?? "");
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
  const editor = getMailingEditor();
  if (mode === "visual" && editor) {
    editor.innerHTML = mailingBodyHtml.value;
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
  getMailingEditor()?.focus();
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
  const editor = getMailingEditor();
  if (editor) {
    editor.innerHTML = "";
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

  const editor = getMailingEditor();
  if (editor) {
    editor.innerHTML = mailingBodyHtml.value;
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

function openExpiringAccessAttention() {
  openUserAccessDrilldown({
    key: "expiring_soon",
    label: "Истекает доступ",
    value: adminStatistics.value.clients.expiringSoon
  });
}

function openPaymentAttention() {
  openPaymentDrilldown({
    key: "attention",
    label: "Проблемы с оплатой",
    value: adminStatistics.value.payments.problemOrders
  });
}

function openAssessmentAttention() {
  void router.push("/learning");
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

function paymentAttentionReason(order: PaymentOrderLog) {
  const paymentFailed = order.status === "failed";
  const webhookFailed = Boolean(order.webhook && !order.webhook.isValid);

  if (paymentFailed && webhookFailed) {
    return "Оплата + уведомление";
  }

  return paymentFailed ? "Ошибка оплаты" : "Ошибка уведомления";
}

function russianCountLabel(value: number, one: string, few: string, many: string) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
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
  selectedClientSection.value = null;
  selectedLearningResult.value = null;
  selectedClientSectionHistoryEntry.value = false;
  selectedLearningResultHistoryEntry.value = false;
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

async function selectUser(user: AdminStatsUser, navigate = true) {
  resetAccessSaveState();
  applySelectedUser(user);
  selectedUserDisplayName.value = user.displayName || user.firstName || user.username || "";
  selectedUserDisplayNameError.value = null;
  if (!props.clientCardOnly && navigate) {
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
  clientMessageInputRef.value = clientsPanelRef.value?.getClientMessageInput() ?? null;
  clientMessageInputRef.value?.focus({ preventScroll: true });
}

function closeClientMessageModal() {
  clientMessageOpen.value = false;
  clientMessageText.value = "";
  clientMessageFiles.value = [];
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

function updateClientFilters(filters: ClientFilters) {
  search.value = filters.query;
  subscriptionFilter.value = filters.subscription;
  tariffFilter.value = filters.tariff;
  restrictionFilter.value = filters.restrictions;
  sourceFilter.value = filters.source;
  utmFieldFilter.value = filters.utmField;
  utmValueFilter.value = filters.utmValue;
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
      actionLogsResponse,
      assessmentQueueResponse
    ] = await Promise.all([
      shouldLoadAdmins ? getAdminUsers() : Promise.resolve(null),
      shouldLoadStats ? getAdminStats() : Promise.resolve(null),
      shouldLoadLearning ? getAdminLearning() : Promise.resolve(null),
      shouldLoadPayments ? getAdminPaymentHistory() : Promise.resolve(null),
      shouldLoadCommunity ? getCommunityTopics() : Promise.resolve(null),
      shouldLoadMailings ? getAdminMailings() : Promise.resolve(null),
      shouldLoadAdminActions ? getAdminActionLogs(adminActionActorFilter.value || undefined) : Promise.resolve(null),
      shouldLoadLearning ? getAssessmentReviewQueue() : Promise.resolve(null)
    ]);
    if (adminsResponse) {
      ownerTelegramId.value = adminsResponse.ownerTelegramId;
      admins.value = adminsResponse.admins;
    }
    if (statsResponse) {
      users.value = statsResponse.users;
      communityMessages.value = statsResponse.communityMessages ?? [];
      pollStats.value = resolveAdminPollStats(statsResponse.pollStats, pollStats.value);
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
    assessmentReviewCount.value = assessmentQueueResponse?.total ?? 0;
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
  try {
    const attachments = await uploadSupportAttachments(clientMessageFiles.value);
    await createAdminClientSupportTicket(telegramId, { message: text, attachments });
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

async function handleResetHomework(id: string) {
  if (!selectedUser.value) return;
  const confirmed = await appDialogs.confirm({
    title: "Сбросить прохождение ДЗ?",
    description: "Результат останется в истории, а клиент сможет отправить новую версию задания.",
    confirmLabel: "Сбросить",
    cancelLabel: "Отмена",
    tone: "danger"
  });
  if (!confirmed) return;
  saving.value = true;
  try {
    await resetHomeworkSubmission(id);
    selectedUserDetail.value = await getAdminUserDetail(selectedUser.value.telegramId);
    await loadAll();
    setStatus("Прохождение домашнего задания сброшено.");
  } catch {
    setError("Не удалось сбросить прохождение домашнего задания.");
  } finally {
    saving.value = false;
  }
}

function openLearningResult(value: { mode: "quiz" | "homework"; recordId: string }) {
  if (!selectedUser.value) return;
  selectedClientSection.value = "learning";
  selectedLearningResult.value = value;
  if (!props.clientCardOnly) {
    selectedLearningResultHistoryEntry.value = true;
    openAdminTask(`/admin/clients/${encodeURIComponent(selectedUser.value.telegramId)}/learning/${value.mode}/${encodeURIComponent(value.recordId)}`);
  }
}

function closeLearningResult() {
  selectedLearningResult.value = null;
  if (!props.clientCardOnly && selectedUser.value) {
    if (selectedLearningResultHistoryEntry.value) {
      selectedLearningResultHistoryEntry.value = false;
      router.back();
    } else {
      replaceAdminTask(`/admin/clients/${encodeURIComponent(selectedUser.value.telegramId)}/learning`);
    }
  }
}

function openClientSection(section: AdminClientDetailSection) {
  if (!selectedUser.value) return;
  selectedClientSection.value = section;
  selectedLearningResult.value = null;
  if (!props.clientCardOnly) {
    selectedClientSectionHistoryEntry.value = true;
    openAdminTask(`/admin/clients/${encodeURIComponent(selectedUser.value.telegramId)}/${section}`);
  }
}

function closeClientSection() {
  selectedClientSection.value = null;
  selectedLearningResult.value = null;
  if (!props.clientCardOnly && selectedUser.value) {
    if (selectedClientSectionHistoryEntry.value) {
      selectedClientSectionHistoryEntry.value = false;
      router.back();
    } else {
      replaceAdminTask(`/admin/clients/${encodeURIComponent(selectedUser.value.telegramId)}`);
    }
  }
}

async function handleResetLearningResult(value: { mode: "quiz" | "homework"; recordId: string }) {
  if (!selectedUser.value) return;
  const kind = value.mode === "quiz" ? "теста" : "домашнего задания";
  const confirmed = await appDialogs.confirm({
    title: `Сбросить прохождение ${kind}?`,
    description: "Результат останется в истории, а клиент сможет пройти задание заново.",
    confirmLabel: "Сбросить",
    cancelLabel: "Отмена",
    tone: "danger"
  });
  if (!confirmed) return;
  saving.value = true;
  try {
    if (value.mode === "quiz") await resetQuizAttempts(value.recordId);
    else await resetHomeworkSubmission(value.recordId);
    selectedUserDetail.value = await getAdminUserDetail(selectedUser.value.telegramId);
    await loadAll();
    setStatus(`Прохождение ${kind} сброшено.`);
    closeLearningResult();
  } catch {
    setError(`Не удалось сбросить прохождение ${kind}.`);
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
  selectedClientSection.value = null;
  selectedLearningResult.value = null;
  selectedClientSectionHistoryEntry.value = false;
  selectedLearningResultHistoryEntry.value = false;
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
  const learningResultMatch = path.match(/^\/admin\/clients\/([^/]+)\/learning\/(quiz|homework)\/([^/]+)$/);
  if (learningResultMatch) {
    activePanel.value = "users";
    const telegramId = decodeURIComponent(learningResultMatch[1]!);
    const user = users.value.find((item) => item.telegramId === telegramId);
    if (user && selectedUser.value?.telegramId !== telegramId) await selectUser(user, false);
    if (user) {
      selectedClientSection.value = "learning";
      selectedLearningResult.value = { mode: learningResultMatch[2] as "quiz" | "homework", recordId: decodeURIComponent(learningResultMatch[3]!) };
    }
    return;
  }
  const clientSectionMatch = path.match(/^\/admin\/clients\/([^/]+)\/([^/]+)$/);
  if (clientSectionMatch && isAdminClientDetailSection(clientSectionMatch[2]!)) {
    activePanel.value = "users";
    selectedLearningResult.value = null;
    selectedLearningResultHistoryEntry.value = false;
    const telegramId = decodeURIComponent(clientSectionMatch[1]!);
    const user = users.value.find((item) => item.telegramId === telegramId);
    if (user && selectedUser.value?.telegramId !== telegramId) await selectUser(user, false);
    if (user) selectedClientSection.value = clientSectionMatch[2];
    return;
  }
  const clientMatch = path.match(/^\/admin\/clients\/([^/]+)$/);
  if (clientMatch) {
    activePanel.value = "users";
    selectedClientSection.value = null;
    selectedLearningResult.value = null;
    selectedClientSectionHistoryEntry.value = false;
    selectedLearningResultHistoryEntry.value = false;
    const telegramId = decodeURIComponent(clientMatch[1]!);
    const user = users.value.find((item) => item.telegramId === telegramId);
    if (user && selectedUser.value?.telegramId !== telegramId) await selectUser(user, false);
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
  if (path === "/admin/server/logs" || path === "/admin/server" || /^\/admin\/server\/errors\/[^/]+$/.test(path)) {
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
              <span :class="activePaymentBreakdown.key === 'attention' ? 'payment-status-failed' : `payment-status-${order.status}`">
                {{ activePaymentBreakdown.key === "attention" ? paymentAttentionReason(order) : paymentOrderStatusLabel(order.status) }}
              </span>
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
        <div class="admin-stat-summary-kpis">
          <article><span>Выручка</span><strong>{{ adminStatistics.payments.revenueRub.toLocaleString("ru-RU") }} ₽</strong><small>{{ adminStatistics.payments.paidOrders }} оплат за выбранный период</small></article>
          <article><span>Новые клиенты</span><strong>+{{ adminStatistics.clients.newInPeriod }}</strong><small>за выбранный период</small></article>
        </div>
        <div class="admin-stat-visual-grid">
          <button
            class="admin-stat-visual-action ui-button admin-stat-visual-clients"
            type="button"
            :aria-label="`Активные клиенты: ${adminStatistics.clients.activePercent}%`"
            @click="openStatisticsDetail('clients')"
          >
            <span class="admin-stat-ring" :style="`--chart-value: ${adminStatistics.clients.activePercent}%`" aria-hidden="true"><b>{{ adminStatistics.clients.activePercent }}%</b></span>
            <strong>Активные</strong>
            <small>{{ adminStatistics.clients.active }} из {{ adminStatistics.clients.total }} клиентов</small>
          </button>
          <button
            class="admin-stat-visual-action ui-button admin-stat-visual-finance"
            type="button"
            :aria-label="`Успешные оплаты: ${successfulPaymentPercent}%`"
            @click="openStatisticsDetail('finance')"
          >
            <span class="admin-stat-ring" :style="`--chart-value: ${successfulPaymentPercent}%`" aria-hidden="true"><b>{{ successfulPaymentPercent }}%</b></span>
            <strong>Оплаты</strong>
            <small>{{ adminStatistics.payments.paidOrders }} из {{ paymentOutcomeCount }} операций</small>
          </button>
          <button
            class="admin-stat-visual-action ui-button admin-stat-visual-learning"
            type="button"
            :aria-label="`Средний прогресс обучения: ${adminStatistics.learning.averageProgressPercent}%`"
            @click="openStatisticsDetail('learning')"
          >
            <span class="admin-stat-ring" :style="`--chart-value: ${adminStatistics.learning.averageProgressPercent}%`" aria-hidden="true"><b>{{ adminStatistics.learning.averageProgressPercent }}%</b></span>
            <strong>Прогресс</strong>
            <small>{{ adminStatistics.learning.completedItems }} из {{ adminStatistics.learning.totalItems }} шагов</small>
          </button>
        </div>
      </div>

      <div
        v-if="adminStatistics.clients.expiringSoon || adminStatistics.payments.problemOrders || assessmentReviewCount"
        class="admin-stat-attention"
        aria-label="Требуют внимания"
      >
        <button
          v-if="adminStatistics.clients.expiringSoon"
          class="admin-stat-attention-action ui-button"
          type="button"
          aria-label="Открыть клиентов с истекающим доступом"
          @click="openExpiringAccessAttention"
        >
          <span class="admin-stat-attention-icon"><CalendarClock aria-hidden="true" /></span>
          <span class="admin-stat-attention-copy"><strong>Истекает доступ</strong><small>в ближайшие 7 дней</small></span>
          <span class="admin-stat-attention-value">
            <b>{{ adminStatistics.clients.expiringSoon }}</b>
            <small>{{ russianCountLabel(adminStatistics.clients.expiringSoon, "клиент", "клиента", "клиентов") }}</small>
          </span>
          <ChevronRight class="admin-stat-attention-chevron" aria-hidden="true" />
        </button>
        <button
          v-if="adminStatistics.payments.problemOrders"
          class="admin-stat-attention-action ui-button"
          type="button"
          aria-label="Открыть проблемные платежи"
          @click="openPaymentAttention"
        >
          <span class="admin-stat-attention-icon"><CircleAlert aria-hidden="true" /></span>
          <span class="admin-stat-attention-copy"><strong>Проблемы с оплатой</strong><small>за выбранный период</small></span>
          <span class="admin-stat-attention-value">
            <b>{{ adminStatistics.payments.problemOrders }}</b>
            <small>{{ russianCountLabel(adminStatistics.payments.problemOrders, "операция", "операции", "операций") }}</small>
          </span>
          <ChevronRight class="admin-stat-attention-chevron" aria-hidden="true" />
        </button>
        <button
          v-if="assessmentReviewCount"
          class="admin-stat-attention-action ui-button"
          type="button"
          aria-label="Открыть работы на проверку"
          @click="openAssessmentAttention"
        >
          <span class="admin-stat-attention-icon"><ClipboardCheck aria-hidden="true" /></span>
          <span class="admin-stat-attention-copy"><strong>Работы на проверку</strong><small>тесты и домашние задания</small></span>
          <span class="admin-stat-attention-value"><b>{{ assessmentReviewCount }}</b><small>{{ russianCountLabel(assessmentReviewCount, "работа", "работы", "работ") }}</small></span>
          <ChevronRight class="admin-stat-attention-chevron" aria-hidden="true" />
        </button>
      </div>

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

    <AdminAssessmentResultTask
      v-if="activePanel === 'users' && selectedUser && selectedLearningResult"
      :telegram-id="selectedUser.telegramId"
      :client-name="userTitle(selectedUser)"
      :mode="selectedLearningResult.mode"
      :record-id="selectedLearningResult.recordId"
      :can-reset="canManageSelectedUser && canManageClientLearning"
      :format-date="formatAdminCompactDateTime"
      @back="closeLearningResult"
      @reset="handleResetLearningResult"
    />

    <AdminClientLearningTask
      v-else-if="activePanel === 'users' && selectedUser && selectedClientSection === 'learning'"
      :client-name="userTitle(selectedUser)"
      :engagement="selectedUserDetail?.learningEngagement ?? []"
      :assessments="selectedUserDetail?.learningAssessments ?? []"
      :can-manage="canManageSelectedUser && canManageClientLearning"
      :format-duration="formatLearningEngagementDuration"
      :format-date="formatAdminCompactDateTime"
      @back="closeClientSection"
      @open-result="openLearningResult"
    />

    <AdminClientDetailTask
      v-else-if="activePanel === 'users' && selectedUser && selectedClientSection && selectedClientSection !== 'learning'"
      :section="selectedClientSection"
      :client-name="userTitle(selectedUser)"
      :user="selectedUser"
      :detail="selectedUserDetail"
      :payment-orders="selectedUserPaymentOrders"
      :last-payment="selectedUserLastPayment"
      :devices="selectedUserDevices"
      :device-text="selectedUserDeviceText"
      :login-ips="selectedUserLoginIps"
      :login-ips-loading="selectedUserLoginIpsLoading"
      :login-ips-error="selectedUserLoginIpsError"
      :can-manage="canManageSelectedUser"
      :saving="saving"
      :payment-order-date="paymentOrderDate"
      :payment-order-status-label="paymentOrderStatusLabel"
      :format-date="formatAdminDateTime"
      :format-compact-date="formatAdminCompactDateTime"
      :referral-user-title="referralUserTitle"
      :referral-reward-status-label="referralRewardStatusLabel"
      :get-device-title="getClientDeviceTitle"
      :get-device-screen="getClientDeviceScreen"
      :is-new-login-ip="isNewLoginIp"
      @back="closeClientSection"
      @revoke-mute="handleRevokeMute"
      @copy-device-info="copyTextToClipboard"
    />

    <AdminClientsPanel
      ref="clientsPanelRef"
      v-else-if="activePanel === 'users'"
      :summary="clientSummary"
      :filters="clientFilters"
      :filters-active="filtersActive"
      :tariff-options="tariffOptions"
      :client-source-options="clientSourceOptions"
      :filtered-users="filteredUsers"
      :selected-user="selectedUser"
      :selected-user-detail="selectedUserDetail"
      :selected-user-payment-orders="selectedUserPaymentOrders"
      :selected-user-last-payment="selectedUserLastPayment"
      :selected-user-paid-total="selectedUserPaidTotal"
      :selected-user-devices="selectedUserDevices"
      :selected-user-device-text="selectedUserDeviceText"
      :selected-user-login-ips="selectedUserLoginIps"
      :selected-user-login-ips-loading="selectedUserLoginIpsLoading"
      :selected-user-login-ips-error="selectedUserLoginIpsError"
      :access-expires-at="accessExpiresAt"
      :pending-client-access-action="pendingClientAccessAction"
      :access-save-succeeded="accessSaveSucceeded"
      :access-save-button-text="accessSaveButtonText"
      :client-access-busy="clientAccessBusy"
      :can-grant-client-access="canGrantClientAccess"
      :can-manage-selected-user="canManageSelectedUser"
      :can-manage-client-learning="canManageClientLearning"
      :can-manage-selected-user-access="canManageSelectedUserAccess"
      :can-view-login-ips="canViewLoginIps"
      :saving="saving"
      :client-message="clientMessage"
      :user-title="userTitle"
      :user-initial="userInitial"
      :selected-user-meta="selectedUserMeta"
      :get-access-action-summary="getAccessActionSummary"
      :payment-order-date="paymentOrderDate"
      :payment-order-status-label="paymentOrderStatusLabel"
      :format-admin-date-time="formatAdminDateTime"
      :format-admin-short-date="formatAdminShortDate"
      :format-admin-compact-date-time="formatAdminCompactDateTime"
      :format-learning-engagement-duration="formatLearningEngagementDuration"
      :referral-user-title="referralUserTitle"
      :referral-reward-status-label="referralRewardStatusLabel"
      :get-client-device-title="getClientDeviceTitle"
      :get-client-device-screen="getClientDeviceScreen"
      :is-new-login-ip="isNewLoginIp"
      @update:filters="updateClientFilters"
      @reset-filters="resetClientFilters"
      @select-user="selectUser"
      @client-card-close="closeSelectedUser"
      @update:access-expires-at="accessExpiresAt = $event"
      @open-access="handleOpenAccess"
      @close-access="handleCloseAccess"
      @extend-access="handleExtendAccess"
      @manual-access="handleManualAccessSave"
      @quick-mute="handleQuickMute"
      @open-message="openClientMessageModal"
      @close-message="closeClientMessageModal"
      @update:client-message-text="clientMessageText = $event"
      @update:client-message-files="clientMessageFiles = $event"
      @submit-message="submitClientMessage"
      @revoke-mute="handleRevokeMute"
      @reset-homework="handleResetHomework"
      @open-client-section="openClientSection"
      @open-learning-result="openLearningResult"
      @copy-device-info="copyTextToClipboard"
    />

    <AdminMailingsPanel
      ref="mailingsPanelRef"
      v-else-if="activePanel === 'mailings'"
      :mailing-email-quota="mailingEmailQuota"       :mailings="mailings"
      :show-mailing-history="showMailingHistory"       :show-mailing-composer="showMailingComposer"
      :selected-mailing="selectedMailing"       :mailing-title="mailingTitle"
      :mailing-body-html="mailingBodyHtml"       :mailing-editor-mode="mailingEditorMode"
      :mailing-channel="mailingChannel"       :mailing-filters="mailingFilters"
      :mailing-scheduled-at="mailingScheduledAt"       :mailing-attachment-label="mailingAttachmentLabel"
      :mailing-preview="mailingPreview"       :mailing-preview-loading="mailingPreviewLoading"
      :mailing-prepared-message="mailingPreparedMessage"       :mailing-can-submit="mailingCanSubmit"
      :saving="saving"       :mailing-analytics="mailingAnalytics"
      :mailing-analytics-loading="mailingAnalyticsLoading"       :mailing-analytics-error="mailingAnalyticsError"
      :mailing-analytics-recipients="mailingAnalyticsRecipients"       :mailing-analytics-recipients-loading="mailingAnalyticsRecipientsLoading"
      :mailing-analytics-recipient-status="mailingAnalyticsRecipientStatus"       :mailing-analytics-recipient-channel="mailingAnalyticsRecipientChannel"
      :mailing-analytics-next-cursor="mailingAnalyticsNextCursor"       :selected-mailing-body-html="selectedMailingBodyHtml"
      :mailing-channel-options="mailingChannelOptions"       :mailing-access-status-options="mailingAccessStatusOptions"
      :mailing-access-type-options="mailingAccessTypeOptions"       :format-date-time="formatDateTime"
      :mailing-author-label="mailingAuthorLabel"       :mailing-attachment-text="mailingAttachmentText"
      :mailing-filter-summary="mailingFilterSummary"       :get-mailing-channel-label="getMailingChannelLabel"
      :get-mailing-status-label="getMailingStatusLabel"       :can-retry-failed-mailing="canRetryFailedMailing"
      :format-mailing-analytics-rate="formatMailingAnalyticsRate"       :format-mailing-analytics-bucket="formatMailingAnalyticsBucket"
      :mailing-analytics-bar-width="mailingAnalyticsBarWidth"       :mailing-analytics-status-label="mailingAnalyticsStatusLabel"
      @open-composer="openMailingComposer()"
      @open-history="openMailingHistory"
      @open-detail="openMailingDetail"
      @back="task => task === 'history' ? closeMailingHistory() : task === 'composer' ? closeMailingComposer() : closeMailingDetail()"
      @update:mailing-title="mailingTitle = $event"
      @update:mailing-body-html="updateMailingBodyHtml"
      @update:mailing-editor-mode="setMailingEditorMode"
      @update:mailing-channel="mailingChannel = $event"
      @update:mailing-filters="mailingFilters = $event"
      @update:mailing-scheduled-at="mailingScheduledAt = $event"
      @update:mailing-attachment="mailingAttachment = $event"
      @editor-paste="handleMailingEditorPaste"
      @editor-command="applyMailingEditorCommand"
      @editor-link="applyMailingEditorLink"
      @reset="resetMailingForm"
      @refresh-preview="refreshMailingPreview"
      @submit="handleCreateMailing"
      @test-draft="handleTestMailingDraft"
      @reuse="reuseMailing"
      @retry="handleRetryFailedMailing"
      @test="handleTestMailing"
      @pause="handlePauseMailing"
      @resume="handleResumeMailing"
      @stop="handleStopMailing"
      @refresh-analytics="refreshMailingAnalytics"
      @update:mailing-analytics-recipient-status="mailingAnalyticsRecipientStatus = $event"
      @update:mailing-analytics-recipient-channel="mailingAnalyticsRecipientChannel = $event"
      @refresh-analytics-recipients="updateMailingAnalyticsRecipients"
      @load-more-analytics-recipients="loadMailingAnalyticsRecipients(false)"
    />
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

    <AdminPermissionsPanel
      v-else-if="activePanel === 'admins'"
      :owner-telegram-id="ownerTelegramId"
      :current-user-telegram-id="session.user?.telegramId"
      :is-owner="isOwner"
      :admins="admins"
      :admin-search-query="adminSearchQuery"
      :resolved-admin-search-telegram-id="resolveAdminSearchTelegramId()"
      :admin-search-candidates="adminSearchCandidates"
      :show-transfer-owner-modal="showTransferOwnerModal"
      :transfer-owner-telegram-id="transferOwnerTelegramId"
      :selected-admin-access="selectedAdminAccessCurrent"
      :admin-permission-options="adminPermissionOptions"
      :saving="saving"
      :admin-action-logs="adminActionLogs"
      :visible-admin-action-actors="visibleAdminActionActors"
      :admin-action-actor-filter="adminActionActorFilter"
      :admin-action-log-expanded="adminActionLogExpanded"
      :format-date-time="formatDateTime"
      @update:admin-search-query="adminSearchQuery = $event"
      @add="handleAddAdmin"
      @open-transfer="openTransferOwnerModal"
      @request-transfer-confirmation="requestTransferOwnerConfirmation"
      @update:transfer-owner-telegram-id="transferOwnerTelegramId = $event"
      @open-access="openAdminAccessModal"
      @update-access="handleUpdateAdminAccess"
      @remove="handleRemoveAdmin"
      @back="(task) => task === 'transfer' ? closeTransferOwnerModal() : closeAdminAccessModal()"
      @update:admin-action-log-expanded="adminActionLogExpanded = $event"
      @update:admin-action-actor-filter="adminActionActorFilter = $event"
    />

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

  </section>
</template>
