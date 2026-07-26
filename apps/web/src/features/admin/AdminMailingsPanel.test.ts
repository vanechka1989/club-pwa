import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import type { AdminMailing, MailingFilters } from "@club/shared";
import AdminMailingsPanel from "./AdminMailingsPanel.vue";

const filters: MailingFilters = { accessStatus: "active", accessType: "all", excludeAdmins: true, excludeRestricted: true };
const mailing: AdminMailing = {
  id: "mailing-1", title: "Новость", body: "Текст", bodyHtml: null, channel: "push", filters,
  status: "completed", scheduledAt: null, startedAt: null, completedAt: null, createdBy: null,
  targetCount: 1, deliveryCount: 1, sentCount: 0, failedCount: 1, skippedCount: 0, pendingCount: 0,
  processingCount: 0, estimatedSeconds: 0, estimatedLabel: "сразу", attachment: null,
  createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z"
};

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    mailingEmailQuota: { used: 0, remaining: 2000, limit: 2000, windowHours: 24, maxRecipientsPerMessage: 100, messagesPerSecond: 5, resetsAt: null },
    mailings: [mailing], showMailingHistory: false, showMailingComposer: true, selectedMailing: null,
    mailingTitle: "Исходный заголовок", mailingBodyHtml: "", mailingEditorMode: "visual" as const, mailingChannel: "push" as const,
    mailingFilters: filters, mailingScheduledAt: "", mailingAttachmentLabel: "Добавить вложение", mailingPreview: null,
    mailingPreviewLoading: false, mailingPreparedMessage: { safeHtml: "", plainText: "Текст" }, mailingCanSubmit: true,
    saving: false, mailingAnalytics: null, mailingAnalyticsLoading: false, mailingAnalyticsError: false,
    mailingAnalyticsRecipients: [], mailingAnalyticsRecipientsLoading: false, mailingAnalyticsRecipientStatus: "all" as const,
    mailingAnalyticsRecipientChannel: "all" as const, mailingAnalyticsNextCursor: null, selectedMailingBodyHtml: "",
    mailingChannelOptions: [{ value: "push" as const, label: "Push", hint: "Приложение + PWA" }],
    mailingAccessStatusOptions: [{ value: "active" as const, label: "Активна подписка" }],
    mailingAccessTypeOptions: [{ value: "all" as const, label: "Любой тип" }],
    formatDateTime: () => "дата", mailingAuthorLabel: () => "Автор", mailingAttachmentText: () => "Вложение",
    mailingFilterSummary: () => "Фильтры", getMailingChannelLabel: () => "Push", getMailingStatusLabel: () => "Завершена",
    canRetryFailedMailing: (value: AdminMailing) => value.failedCount > 0,
    formatMailingAnalyticsRate: () => "0%", formatMailingAnalyticsBucket: () => "дата", mailingAnalyticsBarWidth: () => "0%",
    mailingAnalyticsStatusLabel: () => "Доставлено",
    ...overrides
  };
}

describe("AdminMailingsPanel", () => {
  afterEach(cleanup);

  it("emits a cloned title update without mutating the supplied props", async () => {
    const props = createProps();
    const { emitted } = render(AdminMailingsPanel, { props });

    await fireEvent.update(screen.getByPlaceholderText("Например: Новая практика в клубе"), "  Новый заголовок  ");

    expect(props.mailingTitle).toBe("Исходный заголовок");
    expect(emitted()["update:mailing-title"]).toEqual([["Новый заголовок"]]);
  });

  it("renders the parent-owned visual editor HTML when the composer opens", () => {
    render(AdminMailingsPanel, { props: createProps({ mailingBodyHtml: "<p>Сохранённый текст</p>" }) });

    expect(screen.getByRole("textbox", { name: "Текст рассылки" }).innerHTML).toBe("<p>Сохранённый текст</p>");
  });

  it("emits submit and retry intents with the selected mailing", async () => {
    const { emitted, rerender } = render(AdminMailingsPanel, { props: createProps() });

    await fireEvent.submit(document.querySelector("#admin-mailing-form")!);
    expect(emitted().submit).toEqual([[]]);

    await rerender(createProps({ showMailingComposer: false, showMailingHistory: true }));
    await fireEvent.click(screen.getByRole("button", { name: "Повторить ошибки: 1" }));
    expect(emitted().retry).toEqual([[mailing]]);
  });

  it("emits the composer back intent", async () => {
    const { emitted } = render(AdminMailingsPanel, { props: createProps() });

    await fireEvent.click(screen.getByRole("button", { name: "Закрыть рассылку" }));

    expect(emitted().back).toEqual([["composer"]]);
  });
});
