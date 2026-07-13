import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/vue";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";
import LearningSection from "./LearningSection.vue";

function renderAsOwner() {
  const pinia = createPinia();
  const session = useSessionStore(pinia);
  session.user = {
    id: "owner-id",
    telegramId: "593677751",
    firstName: "Ivan",
    username: null,
    photoUrl: null,
    role: "owner",
    realRole: "owner",
    adminRoleLabel: "Владелец",
    adminPermissions: [],
    membershipStatus: "active",
    membershipExpiresAt: null,
    paymentType: "none",
    recurrentPaymentStatus: null,
    nextPaymentAt: null,
    avatarPositionX: 50,
    avatarPositionY: 50,
    avatarScale: 1,
    avatarRefreshedAt: null
  };

  render(LearningSection, {
    global: {
      plugins: [pinia]
    }
  });

  return pinia;
}

function renderAsMember() {
  const pinia = createPinia();
  const session = useSessionStore(pinia);
  session.user = {
    id: "member-id",
    telegramId: "753327296",
    firstName: "Екатерина",
    username: null,
    photoUrl: null,
    role: "member",
    realRole: "member",
    adminRoleLabel: null,
    adminPermissions: [],
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

  render(LearningSection, {
    global: {
      plugins: [pinia]
    }
  });
}

async function expandModule(title: string) {
  if (screen.queryByRole("button", { name: `Свернуть ${title}` })) {
    return;
  }

  await waitFor(() => expect(screen.getByRole("button", { name: `Развернуть ${title}` })).toBeTruthy());
  await fireEvent.click(screen.getByRole("button", { name: `Развернуть ${title}` }));
  await waitFor(() => expect(screen.getByRole("button", { name: `Свернуть ${title}` })).toBeTruthy());
}

async function expandModuleOne() {
  await expandModule("Модуль 1");
}

async function openLessonCreator(moduleTitle: string) {
  await expandModule(moduleTitle);
  await fireEvent.click(screen.getByRole("button", { name: `Добавить карточку в ${moduleTitle}` }));
}

async function makeModuleOneHorizontal() {
  await fireEvent.click(screen.getByRole("button", { name: "Редактировать Модуль 1" }));
  await fireEvent.click(screen.getByRole("button", { name: "Горизонтальные уроки" }));
  await fireEvent.click(screen.getByRole("button", { name: "Сохранить модуль" }));
}

describe("Learning section modules", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    cleanup();
  });

  it("shows module cards in the mockups style", () => {
    render(LearningSection, {
      global: {
        plugins: [createPinia()]
      }
    });

    expect(screen.getByRole("heading", { name: "Модули" })).toBeTruthy();
    expect(screen.getByText("Модуль 1")).toBeTruthy();
    expect(screen.getByText("Модуль 2")).toBeTruthy();
    expect(screen.getByText("4 урока")).toBeTruthy();
    expect(screen.getByText("3 урока")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Вариант 1\. Плеер и очередь/ })).toBeNull();
    expect(screen.queryByText("Раздел в разработке")).toBeNull();
    expect(screen.queryByText("Обучение: варианты визуала")).toBeNull();
    expect(screen.queryByText("Статистика клуба")).toBeNull();
    expect(screen.queryByText("Контент")).toBeNull();
    expect(screen.queryByText("Последний открытый урок")).toBeNull();
    expect(screen.queryByRole("button", { name: "Добавить контент" })).toBeNull();
  });

  it("separates the shared section header from module content", () => {
    const source = readFileSync(resolve(__dirname, "LearningSection.vue"), "utf8");

    expect(source).toContain('class="modules-section ui-page-section"');
    expect(source).toContain('class="section-head ui-page-header"');
    expect(source).toContain('<h2 class="section-title">{{ t("modulesTitle") }}</h2>');
    expect(source).toContain('<p class="section-subtitle">{{ t("modulesSubtitle") }}</p>');
    expect(source).toContain('class="modules-content"');
    expect(source).toContain("'module-admin-actions': canManageModules");
    expect(source).toContain("'module-member-actions': !canManageModules");
    expect(source).not.toContain('class="admin-panel modules-panel ui-page-section"');
  });

  it("uses the compact shared gap below the modules header", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
    const rule = styles.match(/\.modules-section\s*\{(?<body>[^}]*)\}/g)?.at(-1) ?? "";

    expect(rule).toMatch(/gap:\s*12px/);
  });

  it("shows the module before the lesson title in the continue card", () => {
    const source = readFileSync(resolve(__dirname, "LearningSection.vue"), "utf8");

    expect(source).toContain('const continueLessonTitle = computed(() => lastOpenedLessonModule.value?.title ?? "")');
    expect(source).toContain("lastOpenedMaterial.value?.title ?? lastOpenedLesson.value?.title ?? \"\"");
    expect(source).not.toContain('return lastOpenedLessonModule.value?.title ?? "";');
  });

  it("renders collapsed modules as compact summary rows with separate admin actions", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(styles).toMatch(/\.modules-section \.module-card-head\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s);
    expect(styles).toMatch(/\.modules-section \.module-card-collapsed\s*\{[^}]*min-height:\s*0;[^}]*height:\s*auto;/s);
    expect(styles).toMatch(/\.modules-section \.module-admin-actions\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s);
    expect(styles).toMatch(/\.modules-section \.module-member-actions\s*\{[^}]*width:\s*auto;/s);
  });

  it("visually separates module controls from lesson card controls", () => {
    const source = readFileSync(resolve(__dirname, "LearningSection.vue"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(source).toContain("module-level-sort-controls");
    expect(source).toContain("module-level-action");
    expect(source).toContain("lesson-level-sort-controls");
    expect(styles).toMatch(/\.modules-section \.module-level-sort-controls\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*padding:\s*0;[^}]*box-shadow:\s*none;/s);
    expect(styles).toMatch(/\.modules-section \.module-level-sort-controls \.module-sort-button\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--accent\) 16%, var\(--panel-strong\)\);/s);
    expect(styles).toMatch(/\.modules-section \.module-level-action\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--accent\) 16%, var\(--panel-strong\)\);/s);
    expect(styles).toMatch(/\.modules-section \.lesson-level-sort-controls\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*padding:\s*0;[^}]*box-shadow:\s*none;/s);
    expect(source).toContain('v-if="canManageModules && isModuleCollapsed(module.id)" class="module-sort-controls module-level-sort-controls"');
  });

  it("shows a compact add-card action only inside an expanded module", async () => {
    renderAsOwner();

    const moduleOne = document.querySelector<HTMLElement>('[data-module-id="module-1"]');
    expect(moduleOne).toBeTruthy();
    const moduleOneView = within(moduleOne!);

    expect(moduleOneView.getByRole("button", { name: "Редактировать Модуль 1" })).toBeTruthy();
    expect(moduleOneView.queryByRole("button", { name: "Добавить карточку в Модуль 1" })).toBeNull();
    expect(moduleOneView.queryByRole("button", { name: "Свернуть карточки Модуль 1" })).toBeNull();

    await expandModuleOne();

    expect(moduleOneView.queryByRole("button", { name: "Редактировать Модуль 1" })).toBeNull();
    const addCard = moduleOneView.getByRole("button", { name: "Добавить карточку в Модуль 1" });
    expect(addCard.textContent).toContain("Добавить урок");
    expect(addCard.classList.contains("module-add-card-button")).toBe(true);

    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
    expect(styles).toMatch(/\.modules-section \.module-actions-expanded > span\s*\{[^}]*height:\s*28px;/s);
    expect(styles).toMatch(/\.modules-section \.module-add-card-button\s*\{[^}]*height:\s*28px;[^}]*max-height:\s*28px;[^}]*box-sizing:\s*border-box;[^}]*padding:\s*0\s+7px;/s);
    expect(styles).toMatch(/\.modules-section \.module-add-card-button\s*\{[^}]*border-radius:\s*8px;[^}]*background:\s*color-mix\(in srgb, var\(--accent\) 14%, var\(--panel-strong\)\);/s);
    expect(styles).toMatch(/\.modules-section \.module-add-card-button > svg\s*\{[^}]*width:\s*12px;[^}]*height:\s*12px;/s);
    const openCollapse = moduleOneView.getByRole("button", { name: "Свернуть карточки Модуль 1" });
    expect(openCollapse.classList.contains("module-open-collapse-control")).toBe(true);
    expect(openCollapse.querySelector(".module-collapse-icon-up")).toBeTruthy();
  });

  it("adds a module by title", async () => {
    renderAsOwner();

    await fireEvent.click(screen.getByRole("button", { name: "Добавить модуль" }));

    const moduleTask = screen.getByRole("dialog", { name: "Новый модуль" });
    expect(moduleTask.classList.contains("module-name-modal")).toBe(true);
    expect(moduleTask.classList.contains("modal-size-compact")).toBe(true);
    expect(moduleTask.classList.contains("admin-client-modal")).toBe(false);
    expect(moduleTask.closest(".task-screen-route-layer")).toBeTruthy();
    expect(screen.getByLabelText("Название модуля").classList.contains("text-input")).toBe(true);
    expect(screen.getByLabelText("Описание модуля")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Тип карточек модуля" })).toBeTruthy();

    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
    const formRule = styles.match(/\.module-form\s*\{(?<body>[^}]*)\}/s)?.groups?.body ?? "";
    expect(formRule).toMatch(/flex:\s*0\s+1\s+auto;/);

    await fireEvent.update(screen.getByLabelText("Название модуля"), "Модуль 3");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить модуль" }));

    expect(screen.getByText("Модуль 3")).toBeTruthy();
    expect(screen.getByText("0 уроков")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Новый модуль" })).toBeNull();
  });

  it("renames a selected module", async () => {
    renderAsOwner();

    expect(screen.queryByRole("button", { name: "Редактировать модуль" })).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: "Редактировать Модуль 1" }));
    await fireEvent.update(screen.getByLabelText("Название модуля"), "Первый модуль");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить модуль" }));

    expect(screen.getByText("Первый модуль")).toBeTruthy();
    expect(screen.queryByText("Модуль 1")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Редактировать модуль" })).toBeNull();
  });

  it("collapses and expands a module from its header", async () => {
    renderAsOwner();

    expect(screen.queryByRole("button", { name: /Вариант 1\. Плеер и очередь/ })).toBeNull();
    expect(screen.getByText("Первый модуль клуба. Внутри будут уроки и материалы первого блока.")).toBeTruthy();
    expect(screen.queryByText("Модуль клуба")).toBeNull();

    await expandModuleOne();

    expect(screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ })).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Свернуть Модуль 1" }));

    expect(screen.queryByRole("button", { name: /Вариант 1\. Плеер и очередь/ })).toBeNull();
  });

  it("uses arrow-only sort controls without manual drag handles", async () => {
    renderAsOwner();

    await expandModuleOne();
    const moduleOne = document.querySelector<HTMLElement>('[data-module-id="module-1"]');
    expect(moduleOne).toBeTruthy();
    const moduleOneView = within(moduleOne!);

    expect(screen.queryByRole("button", { name: "Перетащить модуль" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Перетащить урок" })).toBeNull();
    expect(moduleOneView.queryByRole("button", { name: "Поднять модуль" })).toBeNull();
    expect(moduleOneView.queryByRole("button", { name: "Опустить модуль" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Сдвинуть урок влево" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Сдвинуть урок вправо" }).length).toBeGreaterThan(0);

    await fireEvent.click(screen.getByRole("button", { name: "Свернуть Модуль 1" }));
    expect(moduleOneView.getByRole("button", { name: "Поднять модуль" })).toBeTruthy();
    expect(moduleOneView.getByRole("button", { name: "Опустить модуль" })).toBeTruthy();
    await makeModuleOneHorizontal();
    await expandModuleOne();

    expect(screen.getAllByRole("button", { name: "Поднять урок" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Опустить урок" }).length).toBeGreaterThan(0);

    const source = readFileSync(resolve(__dirname, "LearningSection.vue"), "utf8");
    expect(source).not.toContain("GripVertical");
  });

  it("opens a lesson modal from a module lesson card", async () => {
    renderAsOwner();

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ }));

    const lessonDialog = screen.getByRole("dialog", { name: "Вариант 1. Плеер и очередь" });
    expect(lessonDialog).toBeTruthy();
    expect(lessonDialog.querySelector(".lesson-preview-scroll")).toBeTruthy();
    expect(screen.getByText("Урок из модуля")).toBeTruthy();
    expect(lessonDialog.textContent).toContain("Модуль 1");
  });

  it("renders horizontal lesson cards when a module uses horizontal layout", async () => {
    renderAsOwner();

    await makeModuleOneHorizontal();
    await expandModuleOne();

    const horizontalLesson = screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ });
    expect(horizontalLesson.classList.contains("admin-mockup-thumb-horizontal")).toBe(true);
    expect(horizontalLesson.classList.contains("admin-mockup-thumb-vertical")).toBe(false);
  });

  it("sizes horizontal lesson cards like a rotated vertical card", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(styles).toMatch(/\.modules-section\s+\.admin-mockup-thumb-horizontal\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s);
    expect(styles).toMatch(/\.modules-section\s+\.admin-mockup-thumb-horizontal\s*\{[^}]*width:\s*min\(100%,\s*360px\);/s);
    expect(styles).toMatch(/\.modules-section\s+\.admin-mockup-thumb-horizontal\s*\{[^}]*height:\s*auto;/s);
    expect(styles).toMatch(/\.admin-mockup-grid\s*\{[^}]*gap:\s*0\.38rem;/s);
  });

  it("keeps vertical lesson cards readable on narrow screens", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(styles).toMatch(/\.admin-mockup-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(8rem,\s*1fr\)\);/s);
  });

  it("keeps horizontal lesson covers wide instead of square", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(styles).toMatch(/\.modules-section\s+\.admin-mockup-thumb-horizontal\s+img\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9;/s);
    expect(styles).toMatch(/\.modules-section\s+\.admin-mockup-thumb-horizontal\s+img\s*\{[^}]*max-height:\s*203px;/s);
  });

  it("places horizontal lesson title above the cover without description", async () => {
    renderAsOwner();

    await makeModuleOneHorizontal();
    await expandModuleOne();

    const horizontalLesson = screen.getByRole("button", { name: /Вариант 2\. Модули и уроки/ });
    expect(horizontalLesson.firstElementChild?.classList.contains("admin-mockup-thumb-label")).toBe(true);
    expect(horizontalLesson.lastElementChild?.tagName.toLowerCase()).toBe("img");
    expect(horizontalLesson.textContent).not.toContain("Модульная структура с уроками внутри каждого блока.");
  });

  it("centers horizontal lesson titles above their covers", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(styles).toMatch(/\.modules-section\s+\.admin-mockup-thumb-horizontal\s+\.admin-mockup-thumb-label\s*\{[^}]*justify-content:\s*center;/s);
    expect(styles).toMatch(/\.admin-mockup-thumb\s+\.admin-mockup-thumb-label\s*\{[^}]*text-align:\s*center;/s);
    expect(styles).toMatch(/\.admin-mockup-thumb\s+\.admin-mockup-thumb-label\s+strong\s*\{[^}]*justify-content:\s*center;/s);
  });

  it("frames the whole lesson card instead of making title pills", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
    const thumbRule = styles.match(/\.admin-mockup-thumb\s*\{(?<body>[^}]*)\}/s)?.groups?.body ?? "";
    const labelRule =
      styles.match(/\.admin-mockup-thumb\s+\.admin-mockup-thumb-label\s*\{(?<body>[^}]*)\}/s)?.groups?.body ??
      "";
    const horizontalRule =
      styles.match(/\.modules-section\s+\.admin-mockup-thumb-horizontal\s*\{(?<body>[^}]*)\}/s)?.groups?.body ??
      "";

    expect(thumbRule).toMatch(/border:\s*1px\s+solid/);
    expect(thumbRule).toMatch(/background:/);
    expect(thumbRule).toMatch(/padding:\s*0\.34rem/);
    expect(horizontalRule).not.toMatch(/border:\s*0;/);
    expect(horizontalRule).not.toMatch(/padding:\s*0;/);
    expect(labelRule).not.toMatch(/border:/);
    expect(labelRule).not.toMatch(/background:/);
    expect(labelRule).not.toMatch(/box-shadow:/);
  });

  it("creates modules with description and default lesson card layout", async () => {
    renderAsOwner();

    await fireEvent.click(screen.getByRole("button", { name: "Добавить модуль" }));
    await fireEvent.update(screen.getByLabelText("Название модуля"), "Горизонтальный модуль");
    await fireEvent.update(screen.getByLabelText("Описание модуля"), "Описание для нового модуля");
    await fireEvent.click(screen.getByRole("button", { name: "Горизонтальные уроки" }));
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить модуль" }));

    expect(screen.getByText("Горизонтальный модуль")).toBeTruthy();

    expect(screen.getByText("Описание для нового модуля")).toBeTruthy();

    await openLessonCreator("Горизонтальный модуль");
    expect(screen.getByText("Горизонтальная карточка")).toBeTruthy();
    expect(screen.getByText("Формат карточек задан в настройках модуля.")).toBeTruthy();
  });

  it("locks lesson card layout to the selected module layout", async () => {
    renderAsOwner();

    await fireEvent.click(screen.getByRole("button", { name: "Добавить модуль" }));
    await fireEvent.update(screen.getByLabelText("Название модуля"), "Только горизонтальные");
    await fireEvent.click(screen.getByRole("button", { name: "Горизонтальные уроки" }));
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить модуль" }));

    await openLessonCreator("Только горизонтальные");

    expect(screen.getByText("Формат карточек задан в настройках модуля.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Вертикальная карточка" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Горизонтальная карточка" })).toBeNull();
    expect(screen.getByText("Горизонтальная карточка")).toBeTruthy();

    await fireEvent.update(screen.getByLabelText("Название урока"), "Урок в формате модуля");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить урок" }));

    await expandModule("Только горизонтальные");
    const lessonCard = screen.getByRole("button", { name: /Урок в формате модуля/ });
    expect(lessonCard.classList.contains("admin-mockup-thumb-horizontal")).toBe(true);
  });

  it("edits module description and default lesson card layout", async () => {
    renderAsOwner();

    await fireEvent.click(screen.getByRole("button", { name: "Редактировать Модуль 1" }));
    await fireEvent.update(screen.getByLabelText("Описание модуля"), "Новое описание модуля");
    await fireEvent.click(screen.getByRole("button", { name: "Горизонтальные уроки" }));
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить модуль" }));

    expect(screen.getByText("Новое описание модуля")).toBeTruthy();

    await expandModuleOne();
    expect(screen.getAllByText("Новое описание модуля")).toHaveLength(1);

    await fireEvent.click(screen.getByRole("button", { name: "Добавить карточку в Модуль 1" }));
    expect(screen.getByText("Горизонтальная карточка")).toBeTruthy();
    expect(screen.getByText("Формат карточек задан в настройках модуля.")).toBeTruthy();
  });

  it("deletes a module after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAsOwner();

    await fireEvent.click(screen.getByRole("button", { name: "Редактировать Модуль 2" }));
    await fireEvent.click(screen.getByRole("button", { name: "Удалить модуль" }));

    expect(window.confirm).toHaveBeenCalledWith('Удалить модуль "Модуль 2" вместе с уроками?');
    expect(screen.queryByText("Модуль 2")).toBeNull();
  });

  it("uses a compact lesson modal for member viewing", async () => {
    renderAsMember();

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: /Вариант 3\. Библиотека/ }));

    const lessonDialog = screen.getByRole("dialog", { name: "Вариант 3. Библиотека" });
    expect(lessonDialog.classList.contains("lesson-preview-modal-view")).toBe(true);
    expect(lessonDialog.classList.contains("lesson-preview-modal-edit")).toBe(false);
    expect(screen.queryByLabelText("Название урока")).toBeNull();
  });

  it("shows lesson content to members inside the lesson modal", async () => {
    renderAsMember();

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ }));

    const lessonDialog = screen.getByRole("dialog", { name: "Вариант 1. Плеер и очередь" });

    expect(lessonDialog.querySelector(".lesson-viewer-content")).toBeTruthy();
    expect(screen.getByText("Содержимое урока")).toBeTruthy();
    expect(screen.getByText("Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.")).toBeTruthy();
  });

  it("uses a custom lesson video player with fullscreen control", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
    const source = readFileSync(resolve(__dirname, "LearningSection.vue"), "utf8");

    expect(source).toContain('class="lesson-video-player"');
    expect(source).toContain(':poster="lessonVideoPoster"');
    expect(source).toContain("showLessonVideoControls");
    expect(source).toContain("@ended=\"handleLessonVideoEnded\"");
    expect(source).toContain("lesson-video-exit-fullscreen-button");
    expect(styles).toMatch(/\.lesson-video-player\s*\{/);
    expect(styles).toMatch(/\.lesson-video-player-fullscreen\s*\{[^}]*position:\s*fixed;/s);
    expect(styles).toMatch(/\.lesson-video-fullscreen-button\s*\{/);
    expect(styles).toMatch(/\.lesson-video-controls-hidden\s*\{/);
    expect(styles).toMatch(/\.lesson-video-exit-fullscreen-button\s*\{/);
  });

  it("adds a lesson inside a selected module", async () => {
    renderAsOwner();

    await openLessonCreator("Модуль 1");

    const lessonDialog = screen.getByRole("dialog", { name: "Новый урок" });
    expect(lessonDialog).toBeTruthy();
    const fieldLabels = Array.from(lessonDialog.querySelectorAll(".lesson-editor-form .admin-field > span")).map((element) =>
      element.textContent?.trim()
    );
    expect(fieldLabels.slice(0, 2)).toEqual(["Вид карточки", "Название урока"]);
    expect(screen.getByText("Обложка карточки (не обязательно)")).toBeTruthy();
    expect(screen.queryByText("Можно не загружать")).toBeNull();

    await fireEvent.update(screen.getByLabelText("Название урока"), "Новый урок");
    await fireEvent.update(screen.getByLabelText("Описание урока"), "Короткое описание нового урока");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить урок" }));

    expect(screen.queryByRole("dialog", { name: "Новый урок" })).toBeNull();
    await expandModuleOne();
    expect(screen.getByRole("button", { name: /Новый урок/ })).toBeTruthy();
    expect(screen.getByText("5 уроков")).toBeTruthy();
  });

  it("switches a pasted YouTube link from photo url to video YouTube source", async () => {
    renderAsOwner();

    await openLessonCreator("Модуль 1");
    await fireEvent.update(screen.getByLabelText("Название урока"), "YouTube урок");
    await fireEvent.click(screen.getByRole("button", { name: "Фото" }));
    await fireEvent.click(screen.getByRole("button", { name: "Ссылка" }));
    await fireEvent.update(screen.getByLabelText("Ссылка на файл урока"), "https://www.youtube.com/live/EVHs7jmRdXk");

    await waitFor(() => expect(screen.getByLabelText("Ссылка YouTube")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Видео" }).classList.contains("lesson-kind-button-active")).toBe(true);
    expect(screen.getByRole("button", { name: "YouTube" }).classList.contains("lesson-source-button-active")).toBe(true);
  });

  it("switches a pasted YouTube link in extra material to video YouTube source", async () => {
    renderAsOwner();

    await openLessonCreator("Модуль 1");
    await fireEvent.click(screen.getByRole("button", { name: "Добавить ещё материал" }));

    const materialCard = document.querySelector(".lesson-extra-card") as HTMLElement;
    const material = within(materialCard);
    await fireEvent.click(material.getByRole("button", { name: "Фото" }));
    await fireEvent.click(material.getByRole("button", { name: "Ссылка" }));
    await fireEvent.update(material.getByLabelText("Ссылка на файл материала"), "https://www.youtube.com/live/EVHs7jmRdXk");

    await waitFor(() => expect(material.getByLabelText("Ссылка YouTube")).toBeTruthy());
    expect(material.getByRole("button", { name: "Видео" }).classList.contains("lesson-kind-button-active")).toBe(true);
    expect(material.getByRole("button", { name: "YouTube" }).classList.contains("lesson-source-button-active")).toBe(true);
  });

  it("saves lessons with the module card layout", async () => {
    renderAsOwner();

    await makeModuleOneHorizontal();
    await openLessonCreator("Модуль 1");

    await fireEvent.update(screen.getByLabelText("Название урока"), "Горизонтальный урок");
    await fireEvent.update(screen.getByLabelText("Описание урока"), "Компактная карточка урока");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить урок" }));

    await expandModuleOne();
    const lessonCard = screen.getByRole("button", { name: /Горизонтальный урок/ });
    expect(lessonCard.classList.contains("admin-mockup-thumb-horizontal")).toBe(true);
  });

  it("uses the single midnight default cover when a lesson has no uploaded cover", async () => {
    const pinia = renderAsOwner();
    const ui = useUiStore(pinia);
    ui.setColorScheme("azure");

    await openLessonCreator("Модуль 1");
    await fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    await fireEvent.click(screen.getByRole("button", { name: "Свернуть карточки Модуль 1" }));
    await fireEvent.click(screen.getByRole("button", { name: "Редактировать Модуль 1" }));
    await fireEvent.click(screen.getByRole("button", { name: "Горизонтальные уроки" }));
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить модуль" }));
    await openLessonCreator("Модуль 1");

    await fireEvent.update(screen.getByLabelText("Название урока"), "Урок без обложки");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить урок" }));

    await expandModuleOne();
    const lessonCard = screen.getByRole("button", { name: /Урок без обложки/ });
    const cover = lessonCard.querySelector("img");

    expect(cover?.getAttribute("src")).toBe("/previews/default-lessons/midnight-horizontal.webp");
  });

  it("keeps default lesson covers lightweight", () => {
    const coversPath = resolve(__dirname, "../../../public/previews/default-lessons");
    const covers = readdirSync(coversPath);

    expect(covers).toHaveLength(12);
    expect(covers.every((file) => file.endsWith(".webp"))).toBe(true);
    expect(covers.every((file) => statSync(resolve(coversPath, file)).size < 80_000)).toBe(true);
  });

  it("removes a custom lesson cover and returns the card to the midnight default", async () => {
    const pinia = renderAsOwner();
    const ui = useUiStore(pinia);
    ui.setColorScheme("graphite");

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ }));

    expect(screen.getByText("Текущая обложка сохранена")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Удалить обложку" }));
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить урок" }));

    const lessonCard = screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ });
    expect(lessonCard.querySelector("img")?.getAttribute("src")).toBe("/previews/default-lessons/midnight-vertical.webp");
  });

  it("edits lesson content from the same lesson modal", async () => {
    renderAsOwner();

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ }));

    await fireEvent.update(screen.getByLabelText("Название урока"), "Первый урок");
    await fireEvent.update(screen.getByLabelText("Описание урока"), "Обновленное описание урока");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить урок" }));

    expect(screen.queryByRole("dialog", { name: "Вариант 1. Плеер и очередь" })).toBeNull();
    expect(screen.getByRole("button", { name: /Первый урок/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Вариант 1\. Плеер и очередь/ })).toBeNull();
  });

  it("deletes a lesson from a module after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAsOwner();

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ }));
    await fireEvent.click(screen.getByRole("button", { name: "Удалить урок" }));

    expect(window.confirm).toHaveBeenCalledWith('Удалить урок "Вариант 1. Плеер и очередь"? Он попадет в удалённые на 7 дней.');
    expect(screen.queryByRole("dialog", { name: "Вариант 1. Плеер и очередь" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Открыть урок Вариант 1. Плеер и очередь" })).toBeNull();
    expect(screen.getAllByText("3 урока").length).toBeGreaterThanOrEqual(1);
  });

  it("moves deleted lessons to a system module and restores them from the card", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAsOwner();

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ }));
    await fireEvent.click(screen.getByRole("button", { name: "Удалить урок" }));

    expect(screen.getByText("Удалённый контент")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Развернуть Удалённый контент" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Восстановить Вариант 1. Плеер и очередь" })).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: "Развернуть Удалённый контент" }));

    expect(screen.getByText("Вариант 1. Плеер и очередь")).toBeTruthy();
    expect(screen.getByText(/Будет удалено через 7 дн\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Восстановить Вариант 1. Плеер и очередь" })).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Восстановить Вариант 1. Плеер и очередь" }));

    expect(screen.queryByText("Удалённый контент")).toBeNull();
    await expandModuleOne();
    expect(screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ })).toBeTruthy();
  });

  it("keeps the deleted content system module collapsed by default", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAsOwner();

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ }));
    await fireEvent.click(screen.getByRole("button", { name: "Удалить урок" }));

    expect(screen.getByRole("button", { name: "Развернуть Удалённый контент" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Восстановить Вариант 1. Плеер и очередь" })).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: "Развернуть Удалённый контент" }));

    expect(screen.getByRole("button", { name: "Восстановить Вариант 1. Плеер и очередь" })).toBeTruthy();
  });
});
