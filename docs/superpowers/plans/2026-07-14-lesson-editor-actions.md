# Lesson Editor Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести действия редактора урока в конец прокручиваемой формы, чтобы мобильная клавиатура не перекрывала поля.

**Architecture:** Существующие обработчики `saveLesson`, `deleteLesson` и `closeLessonModal` сохраняются. Меняется только DOM-расположение действий и CSS-компоновка routed task screen.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest.

## Global Constraints

- Не изменять API и бизнес-логику уроков.
- Кнопка «Закрыть» удаляется как дублирующая стрелку назад.
- Действия не используют `position: fixed` или `position: sticky`.

---

### Task 1: Регрессионный тест компоновки

**Files:**
- Create: `apps/web/src/features/learning/lessonEditorActions.test.ts`

- [ ] **Step 1: Написать тест, проверяющий DOM-порядок действий внутри `lesson-preview-scroll`, отсутствие кнопки «Закрыть» и отсутствие sticky/fixed CSS.**
- [ ] **Step 2: Запустить `pnpm --filter @club/web test -- lessonEditorActions.test.ts` и подтвердить ожидаемое падение.**

### Task 2: Исправление DOM и CSS

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Перенести блок `lesson-preview-actions-edit` внутрь конца `lesson-preview-scroll`.**
- [ ] **Step 2: Удалить кнопку «Закрыть» и оставить удаление/сохранение.**
- [ ] **Step 3: Сделать блок обычной частью потока без отдельного фона, blur и границы.**
- [ ] **Step 4: Запустить регрессионный тест и подтвердить прохождение.**

### Task 3: Версия, полная проверка и выкладка

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`

- [ ] **Step 1: Повысить версию и добавить release note.**
- [ ] **Step 2: Запустить `git diff --check`, `pnpm test`, `pnpm check`, `pnpm build`.**
- [ ] **Step 3: Закоммитить, отправить `main`, дождаться production workflow и проверить health/version.**
