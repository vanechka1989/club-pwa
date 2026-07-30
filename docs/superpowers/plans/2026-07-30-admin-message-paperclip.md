# Admin Message Paperclip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать нативную надпись файлового поля и оставить в редакторе сообщения клиенту только скрепку.

**Architecture:** Сохраняем существующий `label` как доступную кнопку выбора файлов. Нативный input остаётся поверх всей зоны нажатия, но получает явные геометрию и прозрачность в CSS раздела администратора; лишний визуальный бейдж удаляется из шаблона.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest.

## Global Constraints

- Не менять логику выбора и отправки файлов.
- Минимальная зона нажатия — 44×44 px.
- Видим только glyph скрепки; доступное имя — «Добавить файл».

---

### Task 1: Paperclip-only control

**Files:**
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Modify: `apps/web/src/features/admin/adminRoute.css`
- Test: `apps/web/src/features/admin/adminClientCard.test.ts`

**Interfaces:**
- Consumes: существующий `clientMessage.files` и `updateClientMessageFiles`.
- Produces: доступная 44×44 кнопка, внутри которой нативный файловый input невидим.

- [ ] **Step 1: Write the failing test**

Добавить проверки, что шаблон не содержит `support-file-count`, а CSS для `.admin-client-file-button input` задаёт `position: absolute`, `inset: 0`, `width/height: 100%`, `opacity: 0` и `font-size: 0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/web test -- adminClientCard.test.ts`

Expected: FAIL на отсутствии полного правила скрытия input и наличии бейджа.

- [ ] **Step 3: Write minimal implementation**

Удалить числовой `<span>` из label. Добавить точное правило скрытия нативного input, сохранив его кликабельным поверх всей кнопки.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @club/web test -- adminClientCard.test.ts`

Expected: PASS.

- [ ] **Step 5: Verify release and commit**

Run: `pnpm check`, `pnpm test`, `pnpm build`, `pnpm test:e2e:release`.

Commit: `fix(admin): show paperclip-only attachment control`.
