import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { appVersion } from "./version";
import { getLocalizedReleaseNotes, getReleaseNoteByVersion, releaseNotes } from "./releaseNotes";

describe("release notes", () => {
  it("keeps historical data outside the current release module", () => {
    const currentModule = readFileSync(resolve(__dirname, "releaseNotes.ts"), "utf8");
    const historyModule = readFileSync(resolve(__dirname, "releaseHistory.ts"), "utf8");

    expect(currentModule.split(/\r?\n/).length).toBeLessThan(100);
    expect(historyModule).toContain('version: "5.66"');
    expect(historyModule).toContain('version: "1.38"');
  });
  it("publishes the profile interaction fixes as version 6.30", () => {
    expect(appVersion).toBe("6.30");
    expect(releaseNotes[0]?.title).toBe("Исправление редактирования профиля");
    expect(releaseNotes[0]?.items.join(" ")).toMatch(/сохранить/i);
    expect(releaseNotes[0]?.items.join(" ")).toMatch(/выделен/i);

    const accessStatus = releaseNotes.find((note) => note.version === "6.29");
    expect(accessStatus?.title).toBe("Статус доступа и продукт");

    const polishedProfile = releaseNotes.find((note) => note.version === "6.28");
    expect(polishedProfile?.title).toBe("Аккуратная карточка профиля");

    const profileAccessCard = releaseNotes.find((note) => note.version === "6.27");
    expect(profileAccessCard?.title).toBe("Компактный профиль и понятный доступ");

    const compactAdvertising = releaseNotes.find((note) => note.version === "6.26");
    expect(compactAdvertising?.title).toBe("Компактные источники рекламы");

    const advertisingChannels = releaseNotes.find((note) => note.version === "6.25");
    expect(advertisingChannels?.title).toBe("Каналы рекламы и крупные суммы");

    const compactHeaders = releaseNotes.find((note) => note.version === "6.24");
    expect(compactHeaders?.title).toBe("Компактные шапки и разные цвета тарифов");

    const retentionCharts = releaseNotes.find((note) => note.version === "6.23");
    expect(retentionCharts?.title).toBe("Компактные шапки и графики оттока");

    const compactShowcase = releaseNotes.find((note) => note.version === "6.22");
    expect(compactShowcase?.title).toBe("Компактная карточка и живая демо-аналитика");

    const realCatalog = releaseNotes.find((note) => note.version === "6.21");
    expect(realCatalog?.title).toBe("Реальные тарифы в демо-аналитике");

    const protectedShowcase = releaseNotes.find((note) => note.version === "6.20");
    expect(protectedShowcase?.title).toBe("Защита контактов и демо-аналитика");

    const deletionFix = releaseNotes.find((note) => note.version === "6.19");
    expect(deletionFix?.title).toBe("Исправление удаления клиентов");

    const clientDeletion = releaseNotes.find((note) => note.version === "6.18");
    expect(clientDeletion?.title).toBe("Полное удаление клиентов");

    const richLessonText = releaseNotes.find((note) => note.version === "6.17");
    expect(richLessonText?.title).toBe("Форматирование текста в уроках");

    const unifiedRevenue = releaseNotes.find((note) => note.version === "6.16");
    expect(unifiedRevenue?.title).toBe("Единые диаграммы выручки");

    const compactFinance = releaseNotes.find((note) => note.version === "6.15");
    expect(compactFinance?.title).toBe("Спокойная финансовая аналитика");

    const visualFinance = releaseNotes.find((note) => note.version === "6.14");
    expect(visualFinance?.title).toBe("Визуальный финансовый дашборд");

    const extendedFinance = releaseNotes.find((note) => note.version === "6.13");
    expect(extendedFinance?.title).toBe("Расширенная аналитика финансов");

    const homeworkInbox = releaseNotes.find((note) => note.version === "6.12");
    expect(homeworkInbox?.title).toBe("Отдельный экран результатов ДЗ");

    const visibleHomeworkDecisions = releaseNotes.find((note) => note.version === "6.11");
    expect(visibleHomeworkDecisions?.title).toBe("Результат проверки ДЗ на виду");

    const unobstructedHomeworkReview = releaseNotes.find((note) => note.version === "6.10");
    expect(unobstructedHomeworkReview?.title).toBe("Проверка ДЗ без перекрытия");

    const compatibleHomeworkUploads = releaseNotes.find((note) => note.version === "6.09");
    expect(compatibleHomeworkUploads?.title).toBe("Домашние задания доходят до проверки");

    const reliableHomeworkUploads = releaseNotes.find((note) => note.version === "6.08");
    expect(reliableHomeworkUploads?.title).toBe("Надёжная отправка домашних заданий");

    const dailyAnalytics = releaseNotes.find((note) => note.version === "6.07");
    expect(dailyAnalytics?.title).toBe("Непрерывные графики по дням");

    const learningAnalytics = releaseNotes.find((note) => note.version === "6.06");
    expect(learningAnalytics?.title).toBe("Порядок в аналитике обучения");

    const communityAnalytics = releaseNotes.find((note) => note.version === "6.05");
    expect(communityAnalytics?.title).toBe("Наглядная аналитика общения");

    const releaseHistoryFix = releaseNotes.find((note) => note.version === "6.04");
    expect(releaseHistoryFix?.title).toBe("Полноэкранная история обновлений");

    const clientNavigationRelease = releaseNotes.find((note) => note.version === "6.03");
    expect(clientNavigationRelease?.title).toBe("Источник клиента и быстрые рассылки");

    const dropdownNavigationRelease = releaseNotes.find((note) => note.version === "6.02");
    expect(dropdownNavigationRelease?.title).toBe("Выпадающая навигация админки");

    const compactNavigationRelease = releaseNotes.find((note) => note.version === "6.01");
    expect(compactNavigationRelease?.title).toBe("Компактная навигация админки");

    const alignedAnalyticsRelease = releaseNotes.find((note) => note.version === "6.00");
    expect(alignedAnalyticsRelease?.title).toBe("Ровный выбор периода аналитики");

    const unifiedAnalyticsRelease = releaseNotes.find((note) => note.version === "5.99");
    expect(unifiedAnalyticsRelease?.title).toBe("Все показатели в едином стиле");

    const visualAnalyticsRelease = releaseNotes.find((note) => note.version === "5.98");
    expect(visualAnalyticsRelease?.title).toBe("Наглядная аналитика клуба");

    const unifiedClientPagesRelease = releaseNotes.find((note) => note.version === "5.97");
    expect(unifiedClientPagesRelease?.title).toBe("Единый стиль страниц клиента");

    const compactClientPagesRelease = releaseNotes.find((note) => note.version === "5.96");
    expect(compactClientPagesRelease?.title).toBe("Компактные страницы клиента");

    const repeatableAssessmentsRelease = releaseNotes.find((note) => note.version === "5.95");
    expect(repeatableAssessmentsRelease?.title).toBe("Разделы клиента и повторное прохождение");

    const completeResultsRelease = releaseNotes.find((note) => note.version === "5.93");
    expect(completeResultsRelease?.title).toBe("Единое обучение и полные результаты");

    const progressRelease = releaseNotes.find((note) => note.version === "5.92");
    expect(progressRelease?.title).toBe("Понятный прогресс и результаты теста");

    const lessonEditorRelease = releaseNotes.find((note) => note.version === "5.90");
    expect(lessonEditorRelease?.title).toBe("Удобная карточка урока");

    const separateAssessmentRelease = releaseNotes.find((note) => note.version === "5.89");
    expect(separateAssessmentRelease?.title).toBe("Проверка знаний отдельно");

    const assessmentRelease = releaseNotes.find((note) => note.version === "5.88");
    expect(assessmentRelease?.title).toBe("Тесты и домашние задания");

    const discoveryRelease = releaseNotes.find((note) => note.version === "5.87");
    expect(discoveryRelease?.title).toBe("Нужные уроки всегда под рукой");

    const learningPathRelease = releaseNotes.find((note) => note.version === "5.86");
    expect(learningPathRelease?.title).toBe("Понятный маршрут обучения");

    const actionableAlertsRelease = releaseNotes.find((note) => note.version === "5.85");
    expect(actionableAlertsRelease?.title).toBe("Понятный блок внимания");

    const individualSubscriptionRelease = releaseNotes.find((note) => note.version === "5.84");
    expect(individualSubscriptionRelease?.title).toBe("Платная индивидуальная подписка");

    const paperclipRelease = releaseNotes.find((note) => note.version === "5.83");
    expect(paperclipRelease?.title).toBe("Только скрепка в сообщении");

    const cancelledAutopayRelease = releaseNotes.find((note) => note.version === "5.82");
    expect(cancelledAutopayRelease?.title).toBe("Честный статус автосписания");

    const semanticActionsRelease = releaseNotes.find((note) => note.version === "5.81");
    expect(semanticActionsRelease?.title).toBe("Понятные действия с клиентом");

    const compactActionsRelease = releaseNotes.find((note) => note.version === "5.80");
    expect(compactActionsRelease?.title).toBe("Удобные действия в карточке клиента");

    const personalSubscriptionsRelease = releaseNotes.find((note) => note.version === "5.79");
    expect(personalSubscriptionsRelease?.title).toBe("Персональные подписки для клиентов");

    const clientActivityRelease = releaseNotes.find((note) => note.version === "5.78");
    expect(clientActivityRelease?.title).toBe("Клиенты по последней активности");

    const largeSupportRelease = releaseNotes.find((note) => note.version === "5.77");
    expect(largeSupportRelease?.title).toBe("Большие файлы в поддержке");

    const dedicatedErrorRelease = releaseNotes.find((note) => note.version === "5.76");
    expect(dedicatedErrorRelease?.title).toBe("Каждая ошибка открывается отдельно");

    const periodPriceRelease = releaseNotes.find((note) => note.version === "5.70");
    expect(periodPriceRelease?.title).toBe("Надёжные цены Lava и раздельная статистика");

    const multicurrencyRelease = releaseNotes.find((note) => note.version === "5.69");
    expect(multicurrencyRelease?.title).toBe("Оплата в рублях, евро и долларах");

    const previousOptimizationRelease = releaseNotes.find((note) => note.version === "5.68");
    expect(previousOptimizationRelease?.title).toBe("Оптимизация кода и загрузки");

    const paymentAndSupportRelease = releaseNotes.find((note) => note.version === "5.67");
    expect(paymentAndSupportRelease?.title).toBe("Понятная оплата и современная поддержка");

    const appLikeInteractionsRelease = releaseNotes.find((note) => note.version === "5.66");
    expect(appLikeInteractionsRelease?.title).toBe("Приложение без браузерных меню");

    const compactDetailRelease = releaseNotes.find((note) => note.version === "5.65");
    expect(compactDetailRelease?.title).toBe("Компактные страницы, модули и поддержка");

    const compactWorkspaceRelease = releaseNotes.find((note) => note.version === "5.64");
    expect(compactWorkspaceRelease?.title).toBe("Исправлен колокольчик и расширена рабочая область");

    const moduleDraftRelease = releaseNotes.find((note) => note.version === "5.63");
    expect(moduleDraftRelease?.title).toBe("Безопасные черновики и восстановление модулей");

    const linkFreeEmailRelease = releaseNotes.find((note) => note.version === "5.62");
    expect(linkFreeEmailRelease?.title).toBe("Красивые письма без внешних ссылок");

    const expiryReminderRelease = releaseNotes.find((note) => note.version === "5.61");
    expect(expiryReminderRelease?.title).toBe("Напоминания об окончании доступа");

    const webhookCompatibilityRelease = releaseNotes.find((note) => note.version === "5.59");
    expect(webhookCompatibilityRelease?.title).toBe("Webhook Lava принимает оплату");

    const reliableCheckoutRelease = releaseNotes.find((note) => note.version === "5.58");
    expect(reliableCheckoutRelease?.title).toBe("Надёжная оплата и уведомления");

    const lavaAutofillRelease = releaseNotes.find((note) => note.version === "5.57");
    expect(lavaAutofillRelease?.title).toBe("Тарифы Lava без ручного заполнения");

    const improvedPaymentFlow = releaseNotes.find((note) => note.version === "5.56");
    expect(improvedPaymentFlow?.title).toBe("Удобное управление оплатой");

    const lavaFlowRelease = releaseNotes.find((note) => note.version === "5.55");
    expect(lavaFlowRelease?.title).toBe("Понятное подключение Lava");

    const lavaCatalogRelease = releaseNotes.find((note) => note.version === "5.54");
    expect(lavaCatalogRelease?.title).toBe("Исправлена проверка Lava");

    const lavaConnectionRelease = releaseNotes.find((note) => note.version === "5.53");
    expect(lavaConnectionRelease?.title).toBe("Исправлено подключение Lava");

    const lavaRelease = releaseNotes.find((note) => note.version === "5.52");
    expect(lavaRelease?.title).toBe("Оплата через Lava");

    const storageRelease = releaseNotes.find((note) => note.version === "5.51");
    expect(storageRelease?.title).toBe("Автоматическое обслуживание диска");

    const notificationRelease = releaseNotes.find((note) => note.version === "5.50");
    expect(notificationRelease?.title).toBe("Понятные системные уведомления");

    const stabilityRelease = releaseNotes.find((note) => note.version === "5.49");
    expect(stabilityRelease?.title).toBe("Стабильность и резервное восстановление");

    const monitoringRelease = releaseNotes.find((note) => note.version === "5.48");
    expect(monitoringRelease?.title).toBe("Мониторинг работы приложения");

    const automaticCompletionRelease = releaseNotes.find((note) => note.version === "5.47");
    expect(automaticCompletionRelease?.title).toBe("Автоматическое завершение уроков");

    const clientActionsRelease = releaseNotes.find((note) => note.version === "5.46");
    expect(clientActionsRelease?.title).toBe("Действия клиента выше источника");

    const compactAcquisitionRelease = releaseNotes.find((note) => note.version === "5.45");
    expect(compactAcquisitionRelease?.title).toBe("Компактная аналитика рекламы");
    expect(compactAcquisitionRelease?.items.join(" ")).toContain("повторный блок");

    const clearerUtmRelease = releaseNotes.find((note) => note.version === "5.44");
    expect(clearerUtmRelease?.title).toBe("Понятные названия UTM-меток");
    expect(clearerUtmRelease?.items.join(" ")).toContain("utm_source");

    const clientFiltersRelease = releaseNotes.find((note) => note.version === "5.43");
    expect(clientFiltersRelease?.title).toBe("Фильтры клиентов по источникам");

    const adminLoadingRelease = releaseNotes.find((note) => note.version === "5.42");
    expect(adminLoadingRelease?.title).toBe("Админка загружается быстрее");

    const clientSourceRelease = releaseNotes.find((note) => note.version === "5.41");
    expect(clientSourceRelease?.title).toBe("Источник клиента без переноса");

    const lessonContentRelease = releaseNotes.find((note) => note.version === "5.40");
    expect(lessonContentRelease?.title).toBe("Весь контент виден в редакторе");

    const adminWorkflowRelease = releaseNotes.find((note) => note.version === "5.39");
    expect(adminWorkflowRelease?.title).toBe("Аккуратнее в админке");

    const optimizationRelease = releaseNotes.find((note) => note.version === "5.38");
    expect(optimizationRelease?.title).toBe("Быстрее и надёжнее");

    const engagementRelease = releaseNotes.find((note) => note.version === "5.37");
    expect(engagementRelease?.title).toBe("Активность в обучении");

    const sourceComparisonRelease = releaseNotes.find((note) => note.version === "5.36");
    expect(sourceComparisonRelease?.title).toBe("Единое сравнение источников");

    const separatedAnalyticsRelease = releaseNotes.find((note) => note.version === "5.35");
    expect(separatedAnalyticsRelease?.title).toBe("Раздельные экраны аналитики");

    const acquisitionRelease = releaseNotes.find((note) => note.version === "5.34");
    expect(acquisitionRelease?.title).toBe("Аналитика привлечения клиентов");
    expect(acquisitionRelease?.items.join(" ")).toContain("first-touch");

    const insideReactionRelease = releaseNotes.find((note) => note.version === "5.33");
    expect(insideReactionRelease?.title).toBe("Реакции внутри сообщения");

    const circularReactionRelease = releaseNotes.find((note) => note.version === "5.32");
    expect(circularReactionRelease?.title).toBe("Круглые реакции в углу сообщения");

    const compactReactionRelease = releaseNotes.find((note) => note.version === "5.31");
    expect(compactReactionRelease?.title).toBe("Компактные реакции в чате");

    const moduleEditorRelease = releaseNotes.find((note) => note.version === "5.30");
    expect(moduleEditorRelease?.title).toBe("Ровный редактор модулей");

    const sharedHeaderRelease = releaseNotes.find((note) => note.version === "5.29");
    expect(sharedHeaderRelease?.title).toBe("Единые шапки внутренних экранов");

    const profileDetailRelease = releaseNotes.find((note) => note.version === "5.28");
    expect(profileDetailRelease?.title).toBe("Профиль: ровные внутренние экраны");

    const reactionRelease = releaseNotes.find((note) => note.version === "5.27");
    expect(reactionRelease?.title).toBe("Читаемые реакции в чате");
    expect(reactionRelease?.items.join(" ")).toContain("Android и iPhone");

    const analyticsRelease = releaseNotes.find((note) => note.version === "5.26");
    expect(analyticsRelease?.title).toBe("Аналитика рассылок");
    expect(analyticsRelease?.items.join(" ")).toContain("Open rate");

    const reliableDeliveryRelease = releaseNotes.find((note) => note.version === "5.25");
    expect(reliableDeliveryRelease?.title).toBe("Надёжная доставка рассылок");
    expect(reliableDeliveryRelease?.items.join(" ")).toContain("Повторить ошибки");

    const htmlMailingRelease = releaseNotes.find((note) => note.version === "5.24");
    expect(htmlMailingRelease?.title).toBe("HTML-форматирование рассылок");
    expect(htmlMailingRelease?.items.join(" ")).toContain("HTML-код");

    const reliableSaveRelease = releaseNotes.find((note) => note.version === "5.23");
    expect(reliableSaveRelease?.title).toBe("Надёжное сохранение уроков");
    expect(reliableSaveRelease?.items.join(" ")).toContain("проверит сервер");

    const photoMenuRelease = releaseNotes.find((note) => note.version === "5.22");
    expect(photoMenuRelease?.title).toBe("Ровные отступы меню фото");
    expect(photoMenuRelease?.items.join(" ")).toContain("справа");

    const avatarDraftRelease = releaseNotes.find((note) => note.version === "5.21");
    expect(avatarDraftRelease?.title).toBe("Предпросмотр фото до сохранения");
    expect(avatarDraftRelease?.items.join(" ")).toContain("Сохранить");

    const previousRelease = releaseNotes.find((note) => note.version === "5.20");
    expect(previousRelease?.title).toBe("Возвращено меню фото профиля");
    expect(previousRelease?.items.join(" ")).toContain("Настроить кадр");

    const navigationFix = releaseNotes.find((note) => note.version === "5.13");
    expect(navigationFix?.title).toBe("Убрана полоса под нижним меню");
    expect(navigationFix?.items.join(" ")).toContain("iPhone и Android");
  });

  it("keeps the current app version at the top of the changelog", () => {
    expect(releaseNotes[0]?.version).toBe(appVersion);
    expect(releaseNotes[0]?.items.length).toBeGreaterThan(0);
  });

  it("orders versions from newest to oldest", () => {
    const numericVersions = releaseNotes.map((note) => Number(note.version));
    const sortedVersions = [...numericVersions].sort((left, right) => right - left);

    expect(numericVersions).toEqual(sortedVersions);
  });

  it("does not skip patch versions in the visible changelog", () => {
    const numericVersions = releaseNotes.map((note) => Math.round(Number(note.version) * 100));

    for (let index = 1; index < numericVersions.length; index += 1) {
      const previous = numericVersions[index - 1];
      const current = numericVersions[index];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      expect(previous! - current!).toBe(1);
    }
  });

  it("finds release details by version", () => {
    expect(getReleaseNoteByVersion(appVersion)?.version).toBe(appVersion);
    expect(getReleaseNoteByVersion("0.00")).toBeNull();
  });

  it("does not expose Russian system copy in the English changelog", () => {
    const englishNotes = getLocalizedReleaseNotes("en");
    expect(englishNotes[0]?.title).toBe("Profile editing fixes");
    expect(englishNotes.flatMap((note) => [note.title, ...note.items]).join(" ")).not.toMatch(/[А-Яа-яЁё]/);
  });
});
