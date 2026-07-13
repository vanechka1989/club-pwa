import { describe, expect, it } from "vitest";
import { translateInterfaceText } from "./interfaceLocalization";
import { useI18n } from "./i18n";

describe("interface localization", () => {
  it("translates legacy nested screen labels to English", () => {
    expect(translateInterfaceText("Новая рассылка", "en")).toBe("New mailing");
    expect(translateInterfaceText("Удалить все сообщения", "en")).toBe("Delete all messages");
    expect(translateInterfaceText("Редактировать тариф", "en")).toBe("Edit plan");
    expect(translateInterfaceText("Дополнительные материалы", "en")).toBe("Additional materials");
  });

  it("translates dynamic counters without changing their values", () => {
    expect(translateInterfaceText("5 клиентов", "en")).toBe("5 clients");
    expect(translateInterfaceText("13 сообщений", "en")).toBe("13 messages");
    expect(translateInterfaceText("2 записей", "en")).toBe("2 records");
  });

  it("keeps Russian copy untouched in Russian locale", () => {
    expect(translateInterfaceText("Новая рассылка", "ru")).toBe("Новая рассылка");
  });

  it("keeps the corrected Russian support copy without the unwanted commas", () => {
    const { setLocale, t } = useI18n();
    setLocale("ru");
    expect(t("supportSectionSubtitleUser")).toBe("Опишите проблему и мы ответим в приложении.");
    expect(t("supportNeedHelpText")).toBe("Создайте обращение и ответ появится здесь же.");
  });
});
