# Modules Edit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в шапку модулей карандаш и скрывать административные действия списка до включения режима редактирования.

**Architecture:** Состояние режима хранится локально в `LearningSection.vue` и не меняет API или права. Все существующие административные элементы получают дополнительное условие `isEditingModules`; просмотр, раскрытие модулей и открытие уроков остаются неизменными.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest, Testing Library Vue, CSS, Vite PWA.

## Global Constraints

- Переключатель доступен только пользователю с `canManageModules`.
- Режим по умолчанию выключен и сбрасывается при потере права управления материалами.
- Карандаш располагается перед плюсом и повторяет визуальное состояние переключателя оплаты.
- Плюс создания модуля остаётся доступным администратору независимо от режима.
- API и бизнес-логика управления материалами не меняются.

---

### Task 1: Проверяемый режим редактирования списка модулей

**Files:**
- Create: `apps/web/src/features/learning/learningEditMode.test.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue:317-388,2566-2790`
- Modify: `apps/web/src/styles.css:18549-18693`

**Interfaces:**
- Consumes: `canManageModules: ComputedRef<boolean>` и существующие обработчики управления модулями.
- Produces: `isEditingModules: Ref<boolean>` и кнопка `Редактировать модули` с `aria-pressed`.

- [ ] **Step 1: Написать падающий тест**

Создать source-level тест, который проверяет новый контракт шаблона до реализации:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./LearningSection.vue", import.meta.url)), "utf8");

describe("learning edit mode", () => {
  it("keeps module administration hidden until the edit toggle is enabled", () => {
    expect(source).toContain("const isEditingModules = ref(false)");
    expect(source).toContain('aria-label="Редактировать модули"');
    expect(source).toContain(':aria-pressed="isEditingModules"');
    expect(source).toContain('@click="isEditingModules = !isEditingModules"');
    expect(source).toContain('v-if="canManageModules && isEditingModules && !isModuleCollapsed(module.id)"');
    expect(source).toContain('v-if="canManageModules && isEditingModules && isModuleCollapsed(module.id)"');
    expect(source).toContain('v-if="canManageModules && isEditingModules"');
    expect(source).toContain('v-if="canManageModules && isEditingModules && deletedLessons.length"');
  });

  it("places the edit toggle before the add module action", () => {
    expect(source).toMatch(/aria-label="Редактировать модули"[\s\S]*aria-label="Добавить модуль"/);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает по нужной причине**

Run: `pnpm --filter @club/web test -- learningEditMode.test.ts`

Expected: FAIL, потому что в компоненте нет `isEditingModules` и кнопки `Редактировать модули`.

- [ ] **Step 3: Добавить минимальную реализацию**

В `LearningSection.vue` добавить состояние и сброс права:

```ts
const isEditingModules = ref(false);

watch(canManageModules, (canManage) => {
  if (!canManage) isEditingModules.value = false;
});
```

В шапке перед кнопкой плюса добавить:

```vue
<button
  class="icon-button ui-icon-button"
  :class="{ 'payment-edit-toggle-active': isEditingModules }"
  type="button"
  aria-label="Редактировать модули"
  :aria-pressed="isEditingModules"
  @click="isEditingModules = !isEditingModules"
>
  <Pencil class="h-5 w-5" aria-hidden="true" />
</button>
```

Дополнить `isEditingModules` условиями показа добавления урока, сортировки и редактирования модуля, сортировки/удаления уроков и удалённого контента. Классы `module-admin-actions` и `module-member-actions` переключать по активному режиму, чтобы выключенный экран использовал геометрию клиента.

- [ ] **Step 4: Запустить тест и TypeScript check**

Run: `pnpm --filter @club/web test -- learningEditMode.test.ts && pnpm --filter @club/web check`

Expected: PASS и отсутствие ошибок TypeScript.

- [ ] **Step 5: Зафиксировать функциональность**

```bash
git add apps/web/src/features/learning/learningEditMode.test.ts apps/web/src/features/learning/LearningSection.vue apps/web/src/styles.css
git commit -m "feat(learning): add explicit modules edit mode"
```

---

### Task 2: Релиз и проверка PWA

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Consumes: текущая версия `4.90` и cache name `club-pwa-v189`.
- Produces: версия `4.91`, cache name `club-pwa-v190` и заметка о режиме редактирования модулей.

- [ ] **Step 1: Обновить падающие релизные ожидания**

В тестах ожидать:

```ts
expect(appVersion).toBe("4.91");
expect(releaseNotes[0]?.title).toBe("Режим редактирования модулей");
expect(worker).toContain('const cacheName = "club-pwa-v190"');
```

- [ ] **Step 2: Проверить RED**

Run: `pnpm --filter @club/web test -- releaseNotes.test.ts pwa.test.ts`

Expected: FAIL на версии `4.90`, старой заметке и `club-pwa-v189`.

- [ ] **Step 3: Обновить релизные данные**

Установить `appVersion = "4.91"`, дату `18.07.2026`, `club-pwa-v190` и верхнюю русскую/английскую заметку о новом переключателе редактирования модулей.

- [ ] **Step 4: Полная проверка**

Run: `pnpm test && pnpm check && pnpm build && git diff --check`

Expected: все тесты, TypeScript check и production build проходят; `git diff --check` не выводит ошибок.

- [ ] **Step 5: Коммит и выкладка**

```bash
git add apps/web/src/features/app/version.ts apps/web/public/sw.js apps/web/src/features/app/pwa.test.ts apps/web/src/features/app/releaseNotes.ts apps/web/src/features/app/releaseNotes.test.ts docs/superpowers/plans/2026-07-18-modules-edit-mode.md
git commit -m "chore(release): publish modules edit mode"
git push origin main
```

Проверить GitHub Actions `Deploy to VPS`, затем на `https://club2.myn8nservertest.ru` подтвердить `club-pwa-v190`, версию `4.91` и `GET /api/health -> {"ok":true}`.

