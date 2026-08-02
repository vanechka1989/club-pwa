import { cleanup, fireEvent, render, screen, within } from "@testing-library/vue";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminStatsResponse, AdminStatsUser, AdminUserDetailResponse, ClubUser } from "@club/shared";
import { getAdminStats, getAdminUserDetail } from "@/api/client";
import { useSessionStore } from "@/stores/session";
import AdminClientsPanel from "./AdminClientsPanel.vue";
import AdminSection from "./AdminSection.vue";

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn()
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/admin" }),
  useRouter: () => routerMocks
}));

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    getAdminStats: vi.fn(),
    getAdminUserDetail: vi.fn()
  };
});

const client: AdminStatsUser = {
  id: "client-1",
  telegramId: "1001",
  email: null,
  firstName: "Анна",
  username: "anna",
  displayName: null,
  displayNameChangedByUserAt: null,
  photoUrl: null,
  role: "member",
  membershipStatus: "active",
  membershipExpiresAt: null,
  tariff: "manual",
  hasRestrictions: false,
  completedItems: 0,
  totalItems: 0,
  lastOpenedItemTitle: null,
  lastOpenedAt: null,
  lastLoginAt: "2026-07-27T00:00:00.000Z",
  telegramBotStatus: "unknown",
  telegramBotBlockedAt: null,
  telegramBotUnblockedAt: null,
  acquisition: null,
  createdAt: "2026-07-27T00:00:00.000Z"
};

const statsResponse: AdminStatsResponse = {
  totalUsers: 1,
  activeUsers: 1,
  completedItems: 0,
  totalItems: 0,
  users: [client],
  communityMessages: [],
  pollStats: {
    totalPolls: 0,
    activePolls: 0,
    closedPolls: 0,
    uniqueParticipants: 0,
    totalVotes: 0,
    participationPercent: 0,
    polls: []
  }
};

const clientDetail: AdminUserDetailResponse = {
  user: client,
  subscriptions: [],
  moderationEvents: [],
  device: null,
  devices: [],
  referrals: { invitedBy: null, invited: [] },
  learningEngagement: [],
  learningAssessments: []
};

const adminUser: ClubUser = {
  id: "admin-1",
  telegramId: "admin@example.com",
  email: "admin@example.com",
  firstName: "Админ",
  username: "admin",
  photoUrl: null,
  role: "admin",
  realRole: "admin",
  adminRoleLabel: null,
  adminPermissions: ["users"],
  membershipStatus: "active",
  membershipExpiresAt: null,
  paymentType: "manual",
  recurrentPaymentStatus: null,
  nextPaymentAt: null,
  avatarPositionX: 50,
  avatarPositionY: 50,
  avatarScale: 1,
  avatarRefreshedAt: null
};

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    summary: { total: 1, active: 1, restricted: 0 },
    filters: { query: "", subscription: "all", tariff: "all", restrictions: "all", source: "all", utmField: "all", utmValue: "" } as const,
    filtersActive: false,
    tariffOptions: [{ value: "all", label: "Все тарифы" }],
    clientSourceOptions: [],
    filteredUsers: [client],
    selectedUser: null,
    selectedUserDetail: null,
    selectedUserPaymentOrders: [],
    selectedUserLastPayment: null,
    selectedUserPaidTotal: 0,
    selectedUserDevices: [],
    selectedUserDeviceText: "",
    selectedUserLoginIps: [],
    selectedUserLoginIpsLoading: false,
    selectedUserLoginIpsError: false,
    accessExpiresAt: "",
    pendingClientAccessAction: null,
    accessSaveSucceeded: false,
    accessSaveButtonText: "Сохранить",
    clientAccessBusy: false,
    canGrantClientAccess: true,
    canManageSelectedUser: true,
    canManageClientLearning: true,
    canManageSelectedUserAccess: true,
    canViewLoginIps: false,
    saving: false,
    clientMessage: { open: false, text: "", files: [], sending: false },
    userTitle: (user: AdminStatsUser) => user.firstName ?? `ID ${user.telegramId}`,
    userInitial: () => "А",
    selectedUserMeta: () => "Клиент",
    getAccessActionSummary: () => "Ручной доступ",
    paymentOrderDate: () => "27.07",
    paymentOrderStatusLabel: () => "Оплачен",
    formatAdminDateTime: () => "27.07",
    formatAdminShortDate: () => "27.07",
    formatAdminCompactDateTime: () => "27.07",
    formatLearningEngagementDuration: () => "0 сек.",
    referralUserTitle: () => "Клиент",
    referralRewardStatusLabel: () => "Дни начислены",
    getClientDeviceTitle: () => "Android",
    getClientDeviceScreen: () => "100×100",
    isNewLoginIp: () => false,
    ...overrides
  };
}

describe("AdminClientsPanel", () => {
  afterEach(cleanup);

  it("keeps the default clients surface eager and delegates card closure to the shell", () => {
    const shell = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    const panel = readFileSync(resolve(__dirname, "AdminClientsPanel.vue"), "utf8");

    expect(shell).toContain('import AdminClientsPanel from "./AdminClientsPanel.vue";');
    expect(shell).toContain("<AdminClientsPanel");
    expect(shell).toContain('@client-card-close="closeSelectedUser"');
    expect(shell).not.toContain('class="admin-client-overview"');
    expect(shell.slice(shell.indexOf("function closeSelectedUser"), shell.indexOf("function isNewLoginIp"))).toContain("if (!props.clientCardOnly)");
    expect(panel).not.toContain("@/api/client");
    expect(panel).not.toContain("useRouter");
    expect(panel).not.toContain("useSessionStore");
  });

  it("emits a cloned filter update without mutating the filter prop", async () => {
    const props = createProps();
    const { emitted } = render(AdminClientsPanel, { props });

    await fireEvent.update(screen.getByPlaceholderText("Поиск по ID, имени или username"), "Анна");

    expect(props.filters).toEqual({ query: "", subscription: "all", tariff: "all", restrictions: "all", source: "all", utmField: "all", utmValue: "" });
    expect(emitted()["update:filters"]).toEqual([[{ ...props.filters, query: "Анна" }]]);
  });

  it("renders one complete client button and emits its user when the card is clicked", async () => {
    const neverLoggedInClient: AdminStatsUser = {
      ...client,
      email: "anna.long.contact@example.com",
      completedItems: 3,
      totalItems: 9,
      lastLoginAt: null
    };
    const { container, emitted } = render(AdminClientsPanel, {
      props: createProps({ filteredUsers: [neverLoggedInClient] })
    });
    const cards = container.querySelectorAll<HTMLButtonElement>("button.admin-client-list-row");

    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.tagName).toBe("BUTTON");
    const cardContent = within(card);
    expect(cardContent.getByText("Анна", { exact: true })).toBeTruthy();
    expect(cardContent.getByText("anna.long.contact@example.com", { exact: true })).toBeTruthy();
    expect(cardContent.getByText("Ручной доступ", { exact: true })).toBeTruthy();
    expect(cardContent.getByText("Уроки 3/9", { exact: true })).toBeTruthy();
    expect(cardContent.getByText("Не входил", { exact: true })).toBeTruthy();
    expect(cardContent.getByText("Доступ открыт", { exact: true })).toBeTruthy();

    await fireEvent.click(card);

    expect(emitted()["select-user"]).toEqual([[neverLoggedInClient]]);
  });

  it("emits the access action payload from the selected client card", async () => {
    const { emitted } = render(AdminClientsPanel, { props: createProps({ selectedUser: client }) });

    await fireEvent.click(screen.getByRole("button", { name: "+7 дней" }));

    expect(emitted()["extend-access"]).toEqual([[7]]);
  });

  it("opens every client summary as an equally compact dedicated task row", async () => {
    const { emitted } = render(AdminClientsPanel, {
      props: createProps({
        selectedUser: client,
        selectedUserDetail: clientDetail,
        canViewLoginIps: true
      })
    });

    const sections = [
      ["Источник клиента", "acquisition"],
      ["Активность", "activity"],
      ["Обучение", "learning"],
      ["Подписки", "subscriptions"],
      ["Оплаты клиента", "payments"],
      ["Рефералы", "referrals"],
      ["Ограничения и удаления", "moderation"],
      ["Устройства", "devices"],
      ["IP входов", "login-ips"]
    ] as const;

    expect(document.querySelectorAll(".admin-client-section-icon")).toHaveLength(9);
    expect(document.querySelectorAll(".admin-client-workspace details.admin-client-section")).toHaveLength(0);

    for (const [label] of sections) {
      const button = screen.getByRole("button", { name: `Открыть раздел ${label}` });
      expect(button.classList.contains("admin-client-compact-link")).toBe(true);
      await fireEvent.click(button);
    }

    expect(emitted()["open-client-section"]).toEqual(sections.map(([, section]) => [section]));
  });

  it("uses the never-login fallback in the selected client detail", () => {
    const neverLoggedInClient: AdminStatsUser = { ...client, lastLoginAt: null };
    render(AdminClientsPanel, {
      props: createProps({ filteredUsers: [neverLoggedInClient], selectedUser: neverLoggedInClient })
    });

    expect(screen.getByText("Последний вход: Не входил", { exact: true })).toBeTruthy();
  });

  it("shows cancelled automatic billing while preserving the paid access date", () => {
    const cancelledRecurrentClient: AdminStatsUser = {
      ...client,
      tariff: "prodamus_recurrent",
      recurrentPaymentStatus: "cancelled",
      membershipExpiresAt: "2026-09-06T00:00:00.000Z"
    };
    render(AdminClientsPanel, {
      props: createProps({ filteredUsers: [cancelledRecurrentClient], selectedUser: cancelledRecurrentClient })
    });

    expect(screen.getAllByText("Автосписание отменено", { exact: true })).toHaveLength(2);
    expect(screen.getAllByText("до 27.07", { exact: true }).length).toBeGreaterThan(0);
  });

  it("summarizes assessment events before opening the learning task", async () => {
    const detail: AdminUserDetailResponse = {
      ...clientDetail,
      learningAssessments: [{
        contentItemId: "lesson-1",
        title: "Практика",
        categoryTitle: "Модуль 1",
        mode: "homework",
        recordId: "submission-1",
        status: "accepted",
        version: 2,
        attemptNumber: null,
        earnedPoints: null,
        maxPoints: null,
        percent: null,
        submittedAt: "2026-08-01T12:00:00.000Z",
        reviewedAt: "2026-08-01T13:00:00.000Z",
        reviewComment: "Отлично",
        resetAt: null,
        resetReason: null,
        canReset: true
      }]
    };
    const { emitted } = render(AdminClientsPanel, { props: createProps({ selectedUser: client, selectedUserDetail: detail }) });

    expect(screen.getByText("1 событие", { exact: true })).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Открыть раздел Обучение" }));
    expect(emitted()["open-client-section"]).toEqual([["learning"]]);
  });

  it("emits client-card-close from a clientCardOnly card without owning router side effects", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().user = adminUser;
    vi.mocked(getAdminStats).mockResolvedValue(statsResponse);
    vi.mocked(getAdminUserDetail).mockResolvedValue(clientDetail);
    routerMocks.push.mockClear();
    routerMocks.replace.mockClear();
    const { emitted } = render(AdminSection, {
      props: { clientCardOnly: true, openClientTelegramId: client.telegramId },
      global: {
        plugins: [pinia],
        stubs: { AdminClientAcquisition: true }
      }
    });

    await fireEvent.click(await screen.findByRole("button", { name: "Назад" }));

    expect(emitted()["client-card-close"]).toEqual([[]]);
    expect(routerMocks.push).not.toHaveBeenCalled();
    expect(routerMocks.replace).not.toHaveBeenCalled();
  });

  it("keeps the separate learning screen inside a support client card without changing routes", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().user = adminUser;
    vi.mocked(getAdminStats).mockResolvedValue(statsResponse);
    vi.mocked(getAdminUserDetail).mockResolvedValue(clientDetail);
    routerMocks.push.mockClear();
    routerMocks.replace.mockClear();
    render(AdminSection, {
      props: { clientCardOnly: true, openClientTelegramId: client.telegramId },
      global: {
        plugins: [pinia],
        stubs: { AdminClientAcquisition: true }
      }
    });

    await fireEvent.click(await screen.findByRole("button", { name: "Открыть раздел Обучение" }));
    expect(await screen.findByRole("heading", { name: "Обучение" })).toBeTruthy();
    expect(routerMocks.push).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(await screen.findByRole("button", { name: "Открыть раздел Обучение" })).toBeTruthy();
    expect(routerMocks.push).not.toHaveBeenCalled();
    expect(routerMocks.replace).not.toHaveBeenCalled();
  });

  it("uses browser history for internally opened learning tasks and keeps replace as a deep-link fallback", () => {
    const shell = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    const closeResult = shell.slice(shell.indexOf("function closeLearningResult"), shell.indexOf("function openClientSection"));
    const closeLearning = shell.slice(shell.indexOf("function closeClientSection"), shell.indexOf("async function handleResetLearningResult"));

    expect(closeResult).toContain("router.back()");
    expect(closeResult).toContain("replaceAdminTask");
    expect(closeLearning).toContain("router.back()");
    expect(closeLearning).toContain("replaceAdminTask");
  });
});
