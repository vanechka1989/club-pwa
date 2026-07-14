# Direct Lesson Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить между стрелками карточки урока прямое удаление с подтверждением без открытия редактора.

**Architecture:** `LearningSection.vue` получает общий обработчик удаления конкретного урока, который используют и карточка, и редактор. Существующий `appDialogs` отвечает за подтверждение, существующий API и архивный список — за удаление и семидневное восстановление.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vitest, Testing Library, CSS.

## Global Constraints

- Кнопка доступна только пользователям с правом управления модулями.
- Минимальная область нажатия каждой иконки — 44 × 44 px.
- Удаление всегда требует подтверждения внутри приложения.
- При ошибке карточка остаётся в модуле.

---

### Task 1: Прямое удаление карточки

**Files:**
- Modify: `apps/web/src/features/learning/learningArchive.test.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `appDialogs.confirm`, `deleteAdminLearningMaterial`, `removeLessonFromModule`.
- Produces: `requestDeleteLesson(module, lesson, closeAfterDelete)`.

- [x] **Step 1: Write the failing test**

Добавить тест, который раскрывает модуль, находит `Удалить урок Вариант 2. Модули и уроки`, проверяет порядок «влево — удалить — вправо», нажимает корзину, убеждается, что редактор не открыт, подтверждает диалог и проверяет перенос урока в удалённые.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/web exec vitest run src/features/learning/learningArchive.test.ts --reporter=dot`

Expected: FAIL — кнопка прямого удаления отсутствует.

- [x] **Step 3: Write minimal implementation**

Вынести существующее удаление в:

```ts
async function requestDeleteLesson(module: ModuleCard, lesson: ModuleLesson, closeAfterDelete = false) {
  const confirmed = await appDialogs.confirm({
    title: `Удалить урок «${lesson.title}»?`,
    description: "Урок попадёт в удалённые на 7 дней, после чего будет удалён окончательно.",
    confirmLabel: "Удалить урок",
    tone: "danger"
  });
  if (!confirmed) return;
  // существующий API, обновление модуля и deletedLessons
}
```

Между стрелками добавить кнопку `Trash2` с `@click.stop="requestDeleteLesson(module, image)"` и `aria-label="Удалить урок ..."`. Стили должны сохранить три равных 44 px действия и использовать опасный семантический цвет.

- [x] **Step 4: Run focused tests and type check**

Run: `pnpm --filter @club/web exec vitest run src/features/learning/learningArchive.test.ts --reporter=dot && pnpm --filter @club/web check`

Expected: PASS.

### Task 2: Release and deployment

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

- [x] **Step 1: Update release metadata**

Поднять приложение до `4.40`, service worker до `v139`, добавить русскую и английскую запись о прямом удалении карточек.

- [x] **Step 2: Verify all checks**

Run: `pnpm test && pnpm build && git diff --check`

Expected: PASS.

- [ ] **Step 3: Commit, push and deploy**

```bash
git add .
git commit -m "feat: delete lesson cards directly"
git push origin main
ssh -i C:\Users\ivan\.ssh\club_pwa_codex_ed25519 root@2.27.28.89 "cd /opt/club-pwa && bash deploy/update.sh"
```
